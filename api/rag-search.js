const {
  createEmbedding,
  json,
  readBody,
  sanitizeSourceType,
  setCors,
  supabaseFetch,
  validateQuestion
} = require('../lib/rag-utils');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const query = validateQuestion(body.query || body.question);
    const embedding = await createEmbedding(query, 'RETRIEVAL_QUERY');
    const sourceType = body.source_type ? sanitizeSourceType(body.source_type) : null;
    const matches = await supabaseFetch('/rest/v1/rpc/match_rag_chunks', {
      method: 'POST',
      body: JSON.stringify({
        query_embedding: embedding,
        match_threshold: Number(body.match_threshold || 0.2),
        match_count: Number(body.match_count || 8),
        filter_source_type: sourceType,
        filter_visibility: body.filter_visibility || 'public'
      })
    });
    return json(res, 200, { ok: true, matches: Array.isArray(matches) ? matches : [] });
  } catch (e) {
    console.error('RAG search error:', e);
    return json(res, e.status || 500, { error: e.message || 'Unable to search Guidcy knowledge.' });
  }
};
