const {
  createChatCompletion,
  createEmbedding,
  json,
  readBody,
  setCors,
  uniqueSources,
  validateQuestion
} = require('../lib/rag-utils');

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lsthngfxehayeqyctkla.supabase.co').replace(/\/$/, '');
const GUIDCY_PUBLIC_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzdGhuZ2Z4ZWhheWVxeWN0a2xhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMTgyNzcsImV4cCI6MjA5MjY5NDI3N30.kKTzunZl1JGLNswkPZUBOy9xD8G9FyIGbx0Oh6msIo4';
const SUPABASE_REST_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || GUIDCY_PUBLIC_ANON_KEY;

const DICT = {
  startup: ['startup','founder','funding','grant','investor','pitch','incubator','accelerator','business plan','mvp','entrepreneur','valuation'],
  career: ['career','job','resume','cv','interview','linkedin','placement','salary','switch','mentor','hr','recruitment','growth'],
  education: ['college','university','admission','course','degree','jee','neet','cat','mba','btech','study abroad','scholarship','counsellor','counselor'],
  marketing: ['marketing','seo','sem','social media','brand','branding','content','growth','sales','ads','performance marketing'],
  finance: ['finance','tax','investment','banking','accounting','ca','cfa','wealth','funding','valuation','financial'],
  legal: ['legal','law','compliance','contract','company registration','ip','trademark','patent'],
  technology: ['technology','tech','software','developer','data','ai','machine learning','cloud','python','java','react','product'],
  wellness: ['health','wellness','mental','nutrition','fitness','therapy','doctor'],
  design: ['design','ui','ux','figma','graphic','creative'],
  business: ['business','strategy','management','operations','consulting','sales','market','customer']
};

function norm(value) {
  return String(value || '').toLowerCase().trim();
}

function arr(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value).split(/[,|;\n]/).map(item => item.trim()).filter(Boolean);
}

function consultantText(c) {
  return [
    c.name, c.role, c.specialty, c.category, c.bio, c.about, c.expertise, c.industry,
    c.current_work, c.current_company, c.highest_education, c.college, c.city, c.location,
    c.languages, c.sessionTypes, c.session_types, c.tags, c.skills, c.categories,
    c.certs, c.certifications
  ].map(value => Array.isArray(value) ? value.join(' ') : String(value || '')).join(' ').toLowerCase();
}

function roleOf(c) {
  return c.role || c.specialty || c.category || c.profession || c.current_work || 'Consultant';
}

function priceOf(c) {
  return Number(c.price || c.rate || c.session_price || c.video_price || c.consultation_fee || 0) || 0;
}

function extractTerms(text, sector, stage) {
  const hay = norm([text, sector, stage].join(' '));
  let out = [];
  Object.keys(DICT).forEach(key => {
    if (hay.includes(key) || DICT[key].some(word => hay.includes(word))) out = out.concat(key, DICT[key]);
  });
  hay.split(/[^a-z0-9.+#]+/i).forEach(word => {
    if (word.length > 2) out.push(word);
  });
  const seen = new Set();
  return out.filter(term => {
    const clean = norm(term);
    if (!clean || seen.has(clean)) return false;
    seen.add(clean);
    return true;
  }).slice(0, 90);
}

function budgetLimit(value) {
  const v = norm(value);
  if (!v || v === 'custom') return 999999;
  if (v === 'free') return 0;
  const match = v.match(/\d+/);
  return match ? Number(match[0]) : 999999;
}

function scoreConsultants(consultants, intent, form) {
  const terms = (intent.terms || []).concat(extractTerms(form.goal, form.sector, form.stage));
  const categories = arr(intent.categories || form.sector);
  const limit = budgetLimit(form.budget);
  const lang = norm(form.language);
  const uniqueTerms = Array.from(new Set(terms.map(norm).filter(Boolean))).slice(0, 100);
  return (consultants || []).map(c => {
    const text = consultantText(c);
    let score = 0;
    const hits = [];
    uniqueTerms.forEach(term => {
      if (text.includes(term)) {
        score += 2;
        if (hits.length < 7 && !hits.includes(term)) hits.push(term);
      }
      if (norm(roleOf(c)).includes(term)) score += 4;
      if (norm(c.category).includes(term) || norm(c.specialty).includes(term)) score += 5;
    });
    categories.forEach(cat => {
      const clean = norm(cat);
      if (clean && text.includes(clean)) {
        score += 5;
        if (hits.length < 7 && !hits.includes(clean)) hits.push(clean);
      }
    });
    const price = priceOf(c);
    if (form.budget) {
      if (limit === 0) score += price === 0 ? 6 : -2;
      else if (price > 0 && price <= limit) score += 4;
      else if (price > limit) score -= 1;
    }
    if (lang) {
      const langs = [c.languages, c.language, c.preferred_language].map(v => Array.isArray(v) ? v.join(' ') : String(v || '')).join(' ').toLowerCase();
      if (langs.includes(lang)) {
        score += 3;
        hits.push(lang);
      }
    }
    if (norm(form.urgency).includes('today') && (c.is_available || c.available_today || c.instant_available)) {
      score += 3;
      hits.push('available today');
    }
    score += (Number(c.rating) || 0) * 0.25 + (Number(c.reviews || c.review_count) || 0) * 0.01;
    return { consultant: c, score, hits: Array.from(new Set(hits)).slice(0, 7) };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
}

function compactProfile(c) {
  return {
    id: c.id,
    name: c.name || c.full_name || 'Consultant',
    role: roleOf(c),
    category: c.category || c.specialty || '',
    bio: String(c.bio || c.about || c.description || '').replace(/\s+/g, ' ').slice(0, 420),
    expertise: arr(c.expertise || c.skills || c.tags || c.categories).slice(0, 10),
    current_work: c.current_work || '',
    current_company: c.current_company || '',
    education: [c.highest_education, c.college].filter(Boolean).join(', '),
    experience: c.exp || c.experience || '',
    languages: arr(c.languages || c.language || c.preferred_language).slice(0, 6),
    rating: c.rating || '',
    reviews: c.reviews || c.review_count || ''
  };
}

function profileFallbackReason(match, form) {
  const c = match.consultant || {};
  const name = c.name || c.full_name || 'This expert';
  const role = roleOf(c);
  const goal = norm(form.goal);
  const expertise = arr(c.expertise || c.skills || c.tags || c.categories).slice(0, 4).join(', ');
  const profileSignals = [
    role && role !== 'Consultant' ? `listed focus area: ${role}` : '',
    c.current_work && c.current_company ? `current work as ${c.current_work} at ${c.current_company}` : '',
    expertise ? `profile expertise in ${expertise}` : '',
    c.highest_education || c.college ? `academic background from ${[c.highest_education, c.college].filter(Boolean).join(', ')}` : '',
    c.bio || c.about ? `bio mentioning ${String(c.bio || c.about).replace(/\s+/g, ' ').slice(0, 120)}` : ''
  ].filter(Boolean).slice(0, 3);
  let focus = 'understanding your situation, narrowing the right direction, and turning it into practical next steps';
  if (/resume|cv|interview|job|placement|linkedin|salary/.test(goal)) focus = 'positioning your experience, improving your resume story, and preparing more confidently for interviews';
  else if (/startup|fund|pitch|investor|business|mvp/.test(goal)) focus = 'reviewing the business direction, sharpening the pitch, and identifying practical next actions';
  else if (/college|admission|course|study|degree|career/.test(goal)) focus = 'comparing options, clarifying fit, and choosing a realistic next academic or career path';
  const basis = profileSignals.length ? profileSignals.join('; ') : `${role} profile details`;
  return `Based on the registered profile, ${name} may be a useful match because it shows ${basis}. For your requirement, that background can help with ${focus}.`;
}

function parseJson(text, fallback) {
  const clean = String(text || '').replace(/```json|```/gi, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end < start) return fallback;
  try { return JSON.parse(clean.slice(start, end + 1)); } catch (_) { return fallback; }
}

async function supabaseRest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    method: options.method || 'GET',
    headers: Object.assign({
      apikey: SUPABASE_REST_KEY,
      Authorization: `Bearer ${SUPABASE_REST_KEY}`,
      'Content-Type': 'application/json'
    }, options.headers || {}),
    body: options.body
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!response.ok) {
    const message = typeof data === 'string' ? data : (data && (data.message || data.error?.message || data.error)) || 'Supabase request failed';
    throw Object.assign(new Error(message), { status: response.status, data });
  }
  return data;
}

async function fetchConsultants() {
  const rows = await supabaseRest('/rest/v1/consultants?select=*&limit=300');
  return Array.isArray(rows) ? rows.filter(row => row && row.id && row.name) : [];
}

async function ragContext(question) {
  try {
    const embedding = await createEmbedding(question, 'RETRIEVAL_QUERY');
    const matches = await supabaseRest('/rest/v1/rpc/match_rag_chunks', {
      method: 'POST',
      body: JSON.stringify({
        query_embedding: embedding,
        match_threshold: 0.12,
        match_count: 8,
        filter_source_type: null,
        filter_visibility: 'public'
      })
    });
    return Array.isArray(matches) ? matches : [];
  } catch (e) {
    console.warn('Expert match RAG context fallback:', e.message || e);
    return [];
  }
}

async function inferIntent(form, contextRows) {
  const fallback = {
    terms: extractTerms(form.goal, form.sector, form.stage),
    categories: arr(form.sector),
    summary: 'Keyword and profile based expert matching.'
  };
  const context = contextRows.map((row, index) => `Source ${index + 1}: ${row.title}\n${row.content}`).join('\n\n---\n\n').slice(0, 5000);
  try {
    const answer = await createChatCompletion([
      {
        role: 'system',
        content: 'You are Guidcy expert matching intelligence. Return ONLY valid JSON. Extract the user need, expert categories, and matching keywords. Do not mention internal provider names.'
      },
      {
        role: 'user',
        content: `User expert matching request:\n${JSON.stringify(form)}\n\nGuidcy retrieved context:\n${context || 'No vector context available.'}\n\nReturn JSON: {"summary":"one sentence","categories":["Career","Startup"],"terms":["resume","interview"],"ideal_expert":"short description"}`
      }
    ], { maxTokens: 600, temperature: 0.1 });
    const parsed = parseJson(answer, fallback);
    parsed.terms = Array.isArray(parsed.terms) && parsed.terms.length ? parsed.terms : fallback.terms;
    parsed.categories = Array.isArray(parsed.categories) ? parsed.categories : fallback.categories;
    return parsed;
  } catch (e) {
    console.warn('Expert match intent fallback:', e.message || e);
    return fallback;
  }
}

function reasonFor(match, intent, form) {
  return profileFallbackReason(match, form);
}

async function enrichReasons(matches, intent, form) {
  if (!matches.length) return matches;
  const fallback = matches.map(match => ({ id: match.consultant.id, reason: reasonFor(match, intent, form) }));
  try {
    const answer = await createChatCompletion([
      {
        role: 'system',
        content: [
          'You are Guidcy expert matching intelligence.',
          'Write personalised, profile-based reasons for why each consultant may be suitable.',
          'Use only the consultant profile fields provided.',
          'Never use the repeated phrase "matches your goal through".',
          'Return ONLY valid JSON. No markdown.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          user_requirement: form,
          inferred_intent: intent,
          consultants: matches.map(match => compactProfile(match.consultant))
        }) + '\n\nReturn JSON exactly as: {"reasons":[{"id":"consultant id","reason":"2 concise sentences explaining why this specific profile may fit the user requirement"}]}'
      }
    ], { maxTokens: 1200, temperature: 0.18 });
    const parsed = parseJson(answer, { reasons: fallback });
    const reasonMap = new Map((Array.isArray(parsed.reasons) ? parsed.reasons : fallback).map(item => [String(item.id), String(item.reason || '').trim()]));
    return matches.map(match => Object.assign({}, match, {
      reason: reasonMap.get(String(match.consultant.id)) || reasonFor(match, intent, form)
    }));
  } catch (e) {
    console.warn('Expert match reason fallback:', e.message || e);
    return matches.map(match => Object.assign({}, match, { reason: reasonFor(match, intent, form) }));
  }
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const form = {
      goal: validateQuestion(body.goal || body.query || body.question || ''),
      stage: body.stage || '',
      budget: body.budget || '',
      language: body.language || '',
      urgency: body.urgency || '',
      sector: body.sector || ''
    };
    const question = [form.goal, form.stage, form.sector, form.language].filter(Boolean).join(' ');
    const [consultants, contextRows] = await Promise.all([fetchConsultants(), ragContext(question)]);
    const intent = await inferIntent(form, contextRows);
    const ranked = scoreConsultants(consultants, intent, form).slice(0, 8);
    const matches = (await enrichReasons(ranked, intent, form)).map(match => ({
      consultant: match.consultant,
      score: Math.round(match.score),
      hits: match.hits,
      reason: match.reason || reasonFor(match, intent, form)
    }));
    return json(res, 200, {
      ok: true,
      intent,
      matches,
      sources: uniqueSources(contextRows)
    });
  } catch (e) {
    console.error('Expert match error:', e);
    return json(res, 200, {
      ok: false,
      error: e.message || 'Expert matching is temporarily unavailable.',
      matches: [],
      sources: []
    });
  }
};
