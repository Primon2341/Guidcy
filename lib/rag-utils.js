const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_CHAT_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_GUIDCY_SUPABASE_URL = 'https://lsthngfxehayeqyctkla.supabase.co';
const MAX_QUESTION_LENGTH = 1200;

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function envAny(names) {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return '';
}

function supabaseUrl() {
  const raw = String(envAny(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL']) || DEFAULT_GUIDCY_SUPABASE_URL).trim().replace(/^['"]|['"]$/g, '');
  try {
    const parsed = new URL(raw);
    return parsed.origin.replace(/\/$/, '');
  } catch (_) {
    return DEFAULT_GUIDCY_SUPABASE_URL;
  }
}

function serviceKey() {
  return env('SUPABASE_SERVICE_ROLE_KEY');
}

function geminiKey() {
  return envAny(['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']);
}

function groqKey() {
  return env('GROQ_API_KEY');
}

function embeddingModel() {
  return env('GEMINI_EMBEDDING_MODEL', DEFAULT_EMBEDDING_MODEL).replace(/^models\//, '');
}

function embeddingDimensions() {
  const value = Number(env('GEMINI_EMBEDDING_DIMENSIONS', DEFAULT_EMBEDDING_DIMENSIONS));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_EMBEDDING_DIMENSIONS;
}

function chatModel() {
  return env('GROQ_CHAT_MODEL', DEFAULT_CHAT_MODEL);
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-RAG-Admin-Secret');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (req.body && typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return Object.fromEntries(new URLSearchParams(req.body)); }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return Object.fromEntries(new URLSearchParams(raw)); }
}

function configError(missing) {
  const e = new Error(`Missing RAG environment variable(s): ${missing.join(', ')}`);
  e.status = 500;
  return e;
}

function requiredServerConfig() {
  const missing = [];
  if (!geminiKey()) missing.push('GEMINI_API_KEY');
  if (!groqKey()) missing.push('GROQ_API_KEY');
  if (!serviceKey()) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) throw configError(missing);
}

function requiredSupabaseConfig() {
  const missing = [];
  if (!serviceKey()) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) throw configError(missing);
}

function requiredEmbeddingConfig() {
  const missing = [];
  if (!geminiKey()) missing.push('GEMINI_API_KEY');
  if (missing.length) throw configError(missing);
}

function requiredChatConfig() {
  const missing = [];
  if (!groqKey()) missing.push('GROQ_API_KEY');
  if (missing.length) throw configError(missing);
}

async function parseJsonResponse(response, fallbackMessage) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!response.ok) {
    const message = typeof data === 'string'
      ? data
      : (data && (data.message || data.error?.message || data.error)) || fallbackMessage;
    const e = new Error(message);
    e.status = response.status;
    e.data = data;
    throw e;
  }
  return data;
}

async function supabaseFetch(path, options = {}) {
  requiredSupabaseConfig();
  const url = `${supabaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = Object.assign({
    apikey: serviceKey(),
    Authorization: `Bearer ${serviceKey()}`,
    'Content-Type': 'application/json'
  }, options.headers || {});
  const response = await fetch(url, Object.assign({}, options, { headers }));
  try {
    return await parseJsonResponse(response, 'Supabase request failed');
  } catch (e) {
    e.message = `Supabase request failed: ${e.message}`;
    throw e;
  }
}

async function createEmbedding(input, taskType = '') {
  requiredEmbeddingConfig();
  const cleanInput = String(input || '').replace(/\s+/g, ' ').trim();
  if (!cleanInput) {
    const e = new Error('Text is required for embedding.');
    e.status = 400;
    throw e;
  }
  const model = embeddingModel();
  const dimensions = embeddingDimensions();
  const payload = {
    model: `models/${model}`,
    content: {
      parts: [{ text: cleanInput }]
    },
    outputDimensionality: dimensions
  };
  if (taskType) payload.taskType = taskType;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': geminiKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  let data;
  try {
    data = await parseJsonResponse(response, 'Gemini embedding request failed');
  } catch (e) {
    e.message = `Gemini embedding request failed: ${e.message}`;
    throw e;
  }
  const embedding = data && data.embedding && data.embedding.values;
  if (!Array.isArray(embedding)) throw Object.assign(new Error('Gemini did not return an embedding vector.'), { status: 502 });
  if (embedding.length !== dimensions) {
    throw Object.assign(new Error(`Gemini returned ${embedding.length} dimensions; expected ${dimensions}.`), { status: 502 });
  }
  return embedding;
}

async function createChatCompletion(messages, options = {}) {
  requiredChatConfig();
  const maxTokens = Number(options.maxTokens || options.max_tokens || 950);
  const temperature = Number(options.temperature ?? 0.15);
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: chatModel(),
      temperature: Number.isFinite(temperature) ? temperature : 0.15,
      top_p: 0.9,
      max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.min(Math.floor(maxTokens), 1400) : 950,
      messages
    })
  });
  let data;
  try {
    data = await parseJsonResponse(response, 'Groq chat request failed');
  } catch (e) {
    e.message = `Groq chat request failed: ${e.message}`;
    throw e;
  }
  const answer = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!answer) throw Object.assign(new Error('Groq did not return an answer.'), { status: 502 });
  return String(answer).trim();
}

function cleanText(value, max = 20000) {
  return String(value == null ? '' : value)
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function cleanId(value, max = 120) {
  return String(value == null ? '' : value).trim().replace(/[^\w:./-]+/g, '-').slice(0, max);
}

function sanitizeSourceType(value) {
  const allowed = new Set(['site','help','marketplace','webinar','consultant','policy','custom']);
  const clean = String(value || 'custom').toLowerCase().trim();
  return allowed.has(clean) ? clean : 'custom';
}

function sanitizeVisibility(value) {
  const allowed = new Set(['public','authenticated','private','admin']);
  const clean = String(value || 'public').toLowerCase().trim();
  return allowed.has(clean) ? clean : 'public';
}

function approxTokenCount(value) {
  return Math.ceil(String(value || '').length / 4);
}

function chunkText(text, maxChars = 1300, overlapChars = 180) {
  const normalized = cleanText(text, 80000);
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }
    for (let i = 0; i < paragraph.length; i += Math.max(maxChars - overlapChars, 500)) {
      chunks.push(paragraph.slice(i, i + maxChars).trim());
    }
    current = '';
  }
  if (current) chunks.push(current);
  return chunks.map((chunk, index) => {
    if (index === 0 || overlapChars <= 0) return chunk;
    const prev = chunks[index - 1] || '';
    const overlap = prev.slice(Math.max(0, prev.length - overlapChars)).trim();
    return overlap ? `${overlap}\n\n${chunk}` : chunk;
  }).filter(Boolean);
}

function validateQuestion(question) {
  const clean = cleanText(question, MAX_QUESTION_LENGTH);
  if (clean.length < 2) throw Object.assign(new Error('Please ask a question first.'), { status: 400 });
  return clean;
}

function requireAdminSecret(req, body = {}) {
  const configured = env('RAG_ADMIN_SECRET');
  if (!configured) {
    const e = new Error('RAG_ADMIN_SECRET is required before ingesting knowledge.');
    e.status = 500;
    throw e;
  }
  const provided = req.headers['x-rag-admin-secret'] || body.adminSecret || body.secret;
  if (String(provided || '') !== configured) {
    const e = new Error('Invalid RAG admin secret.');
    e.status = 401;
    throw e;
  }
}

function seedDocuments() {
  return [
    {
      source_type: 'site',
      source_id: 'guidcy-overview',
      title: 'Guidcy platform overview',
      content: 'Guidcy is an expert consultation marketplace where users can browse verified consultants, book paid guidance sessions, attend webinars, use career discovery tools, and buy or sell useful PDF notes in the marketplace. The platform focuses on professional, career, business, finance, startup, and education guidance.'
    },
    {
      source_type: 'help',
      source_id: 'booking-flow',
      title: 'Consultant booking flow',
      content: 'Users browse consultants, select an expert, choose a suitable session, complete payment, and then get access to the session details. Paid bookings use the PayU payment flow configured on the server. Booking status and payment status are updated after payment verification.'
    },
    {
      source_type: 'marketplace',
      source_id: 'notes-flow',
      title: 'Marketplace notes flow',
      content: 'The Guidcy marketplace lets users buy, download, and sell PDF notes. Only PDFs up to 15 MB are accepted. Sellers choose how many opening pages are available as a preview. Paid notes unlock full access after login and successful payment. Free notes can be downloaded without payment after the required access checks. Sellers can edit a listing after publishing to update price and preview page count. Admin can see marketplace orders, seller payable amount, Guidcy commission, seller bank details when submitted, and mark seller payouts as paid.'
    },
    {
      source_type: 'marketplace',
      source_id: 'seller-payouts',
      title: 'Marketplace seller payouts',
      content: 'For paid marketplace notes, Guidcy tracks the buyer, seller, note, sale amount, Guidcy commission, seller payable amount, payment status, and seller payout status. Sellers can see notes posted, copies sold, commission, paid amount, pending amount, and weekly dues paid message in their dashboard. Admin settles seller payable amounts and records transaction ID, payout mode, paid time, and payout notes.'
    },
    {
      source_type: 'webinar',
      source_id: 'webinars',
      title: 'Webinars and registrations',
      content: 'Guidcy webinars can be free or paid. Users register from the webinars page. Paid webinar registration uses the same server-side PayU flow as other paid actions, and successful payment confirms the registration.'
    },
    {
      source_type: 'policy',
      source_id: 'refunds-disputes',
      title: 'Refunds and disputes',
      content: 'Guidcy provides refund and dispute pages for users who need help with payments, sessions, marketplace purchases, or other platform concerns. Users should contact Guidcy support with the relevant booking, webinar, or marketplace order details.'
    },
    {
      source_type: 'consultant',
      source_id: 'consultant-earnings',
      title: 'Consultant earnings and payouts',
      content: 'Consultants can use their dashboard to manage availability, booking requests, profile settings, payout details, and earnings. Earnings show paid bookings, gross sales, Guidcy commission, consultant payable, paid payout amount, pending payout amount, payout references, and whether Guidcy has paid weekly dues.'
    }
  ];
}

function uniqueSources(matches) {
  const seen = new Set();
  return (matches || []).filter(match => {
    const key = `${match.document_id}:${match.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(match => ({
    title: match.title,
    source_type: match.source_type,
    source_id: match.source_id,
    similarity: Number(match.similarity || 0)
  }));
}

module.exports = {
  approxTokenCount,
  chatModel,
  chunkText,
  cleanId,
  cleanText,
  createChatCompletion,
  createEmbedding,
  embeddingDimensions,
  embeddingModel,
  json,
  readBody,
  requireAdminSecret,
  sanitizeSourceType,
  sanitizeVisibility,
  seedDocuments,
  setCors,
  supabaseFetch,
  uniqueSources,
  validateQuestion
};
