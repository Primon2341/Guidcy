const {
  approxTokenCount,
  chunkText,
  cleanId,
  cleanText,
  createEmbedding,
  embeddingModel,
  json,
  readBody,
  requireAdminSecret,
  sanitizeSourceType,
  sanitizeVisibility,
  seedDocuments,
  setCors,
  supabaseFetch
} = require('../lib/rag-utils');

async function deleteExistingDocument(sourceType, sourceId) {
  if (!sourceId) return;
  const query = `/rest/v1/rag_documents?source_type=eq.${encodeURIComponent(sourceType)}&source_id=eq.${encodeURIComponent(sourceId)}`;
  await supabaseFetch(query, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

async function insertDocument(document) {
  const payload = {
    title: cleanText(document.title, 180) || 'Guidcy knowledge',
    content: cleanText(document.content),
    source_type: sanitizeSourceType(document.source_type),
    source_id: cleanId(document.source_id || document.id || document.title || Date.now()),
    visibility: sanitizeVisibility(document.visibility),
    metadata: document.metadata && typeof document.metadata === 'object' ? document.metadata : {}
  };
  if (!payload.content) throw Object.assign(new Error(`Document "${payload.title}" is empty.`), { status: 400 });

  const rows = await supabaseFetch('/rest/v1/rag_documents?select=id,title,source_type,source_id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function insertChunks(documentId, chunks, baseMetadata = {}) {
  const inserted = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const content = chunks[i];
    const embedding = await createEmbedding(content, 'RETRIEVAL_DOCUMENT');
    const rows = await supabaseFetch('/rest/v1/rag_chunks?select=id,chunk_index', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        document_id: documentId,
        chunk_index: i,
        content,
        token_count: approxTokenCount(content),
        embedding_model: embeddingModel(),
        embedding,
        metadata: Object.assign({}, baseMetadata, { chunk: i })
      })
    });
    inserted.push(Array.isArray(rows) ? rows[0] : rows);
  }
  return inserted;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    requireAdminSecret(req, body);
    const documents = Array.isArray(body.documents) && body.documents.length
      ? body.documents
      : (body.seed ? seedDocuments() : []);

    if (!documents.length) {
      return json(res, 400, { error: 'Provide documents[] or send { "seed": true }.' });
    }

    const results = [];
    for (const raw of documents.slice(0, 25)) {
      const sourceType = sanitizeSourceType(raw.source_type);
      const sourceId = cleanId(raw.source_id || raw.id || raw.title || Date.now());
      if (body.replace !== false) await deleteExistingDocument(sourceType, sourceId);
      const document = await insertDocument(Object.assign({}, raw, { source_type: sourceType, source_id: sourceId }));
      const chunks = chunkText(raw.content);
      const rows = await insertChunks(document.id, chunks, {
        source_type: sourceType,
        source_id: sourceId,
        title: document.title
      });
      results.push({
        document_id: document.id,
        title: document.title,
        source_type: sourceType,
        source_id: sourceId,
        chunks: rows.length
      });
    }

    return json(res, 200, {
      ok: true,
      documents: results.length,
      chunks: results.reduce((sum, row) => sum + row.chunks, 0),
      results
    });
  } catch (e) {
    console.error('RAG ingest error:', e);
    return json(res, e.status || 500, { error: e.message || 'Unable to ingest Guidcy knowledge.' });
  }
};
