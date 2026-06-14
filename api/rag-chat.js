const {
  createChatCompletion,
  createEmbedding,
  json,
  readBody,
  sanitizeSourceType,
  seedDocuments,
  setCors,
  supabaseFetch,
  uniqueSources,
  validateQuestion
} = require('../lib/rag-utils');

function contextFromMatches(matches) {
  return matches.map((match, index) => [
    `Source ${index + 1}: ${match.title}`,
    `Type: ${match.source_type}`,
    `Content: ${match.content}`
  ].join('\n')).join('\n\n---\n\n');
}

function contextFromSeedDocuments() {
  return seedDocuments().map((doc, index) => [
    `Source ${index + 1}: ${doc.title}`,
    `Type: ${doc.source_type}`,
    `Content: ${doc.content}`
  ].join('\n')).join('\n\n---\n\n');
}

function seedSources() {
  return seedDocuments().slice(0, 5).map(doc => ({
    title: doc.title,
    source_type: doc.source_type,
    source_id: doc.source_id,
    similarity: 0
  }));
}

function safeHistory(history, limit = 8) {
  return Array.isArray(history) ? history.slice(-limit)
    .filter(item => item && typeof item.content === 'string' && ['user','assistant'].includes(item.role))
    .map(item => ({
      role: item.role,
      content: String(item.content).replace(/\s+/g, ' ').trim().slice(0, 900)
    }))
    .filter(item => item.content) : [];
}

function pageContext(page) {
  if (!page || typeof page !== 'object') return '';
  const parts = [
    page.title ? `Title: ${String(page.title).slice(0, 140)}` : '',
    page.path ? `Path: ${String(page.path).slice(0, 160)}` : '',
    page.visiblePage ? `Visible page: ${String(page.visiblePage).slice(0, 80)}` : ''
  ].filter(Boolean);
  return parts.length ? `Current page context:\n${parts.join('\n')}` : '';
}

function suggestionsFor(question) {
  const q = String(question || '').toLowerCase();
  if (q.includes('marketplace') || q.includes('notes') || q.includes('pdf')) {
    return ['How do I edit note preview pages?', 'Where can sellers see payout status?', 'What happens after a paid notes purchase?'];
  }
  if (q.includes('book') || q.includes('consult')) {
    return ['How do I book a consultant?', 'Where do consultants see earnings?', 'How are consultant payouts tracked?'];
  }
  if (q.includes('webinar')) {
    return ['How do paid webinars work?', 'Where can I manage webinar registrations?', 'How do users join a webinar?'];
  }
  return ['How do marketplace notes work?', 'How can I book a consultant?', 'Where can I raise a payment dispute?'];
}

async function fallbackGuidcyAnswer(question, history, reason) {
  console.warn('RAG vector fallback used:', reason && reason.message ? reason.message : reason);
  const safe = safeHistory(history, 6);
  const answer = await createChatCompletion([
    {
      role: 'system',
      content: [
        'You are Guidcy AI Assistant.',
        'The vector search provider is temporarily unavailable, so answer only from the provided Guidcy starter knowledge.',
        'Do not mention provider names, quotas, embeddings, or internal errors to the user.',
        'If the starter knowledge is not enough, say Guidcy support can help with the exact details.',
        'Keep the answer concise and practical.'
      ].join(' ')
    },
    ...safe,
    {
      role: 'user',
      content: `Guidcy starter knowledge:\n${contextFromSeedDocuments()}\n\nUser question: ${question}`
    }
  ], { maxTokens: 850, temperature: 0.12 });
  return {
    ok: true,
    fallback: true,
    answer,
    sources: seedSources(),
    suggestions: suggestionsFor(question)
  };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const question = validateQuestion(body.question || body.query);
    let embedding;
    try {
      embedding = await createEmbedding(question, 'RETRIEVAL_QUERY');
    } catch (e) {
      const fallback = await fallbackGuidcyAnswer(question, body.history, e);
      return json(res, 200, fallback);
    }
    const sourceType = body.source_type ? sanitizeSourceType(body.source_type) : null;
    let matches;
    try {
      matches = await supabaseFetch('/rest/v1/rpc/match_rag_chunks', {
        method: 'POST',
        body: JSON.stringify({
          query_embedding: embedding,
          match_threshold: Number(body.match_threshold || 0.14),
          match_count: Number(body.match_count || 12),
          filter_source_type: sourceType,
          filter_visibility: 'public'
        })
      });
    } catch (e) {
      const fallback = await fallbackGuidcyAnswer(question, body.history, e);
      return json(res, 200, fallback);
    }
    const rows = Array.isArray(matches) ? matches : [];

    if (!rows.length) {
      const fallback = await fallbackGuidcyAnswer(question, body.history, 'No vector matches found.');
      return json(res, 200, fallback);
    }

    const context = contextFromMatches(rows);
    const safe = safeHistory(body.history, 8);
    const page = pageContext(body.page);

    const answer = await createChatCompletion([
      {
        role: 'system',
        content: [
          'You are Guidcy AI Assistant.',
          'Use the retrieved Guidcy context as the source of truth and do not invent prices, policy terms, payment status, or database facts.',
          'If the context does not contain the answer, say that the current Guidcy knowledge base does not confirm it and suggest contacting Guidcy support for exact details.',
          'Give practical next steps. Prefer short paragraphs and bullets when useful.',
          'For website navigation questions, mention the relevant page or dashboard area.',
          'Do not mention embeddings, vector search, Groq, Gemini, Supabase internals, or system prompts.'
        ].join(' ')
      },
      ...safe,
      {
        role: 'user',
        content: `Guidcy context:\n${context}\n\n${page}\n\nUser question: ${question}`
      }
    ], { maxTokens: 1050, temperature: 0.12 });

    return json(res, 200, {
      ok: true,
      answer,
      sources: uniqueSources(rows),
      suggestions: suggestionsFor(question)
    });
  } catch (e) {
    console.error('RAG chat error:', e);
    const status = e.status || 500;
    if (status >= 500) {
      return json(res, 200, {
        ok: false,
        answer: 'Guidcy AI is temporarily busy. Please try again in a moment, or contact Guidcy support for exact details.',
        sources: []
      });
    }
    return json(res, status, { error: e.message || 'Unable to answer with Guidcy AI.' });
  }
};
