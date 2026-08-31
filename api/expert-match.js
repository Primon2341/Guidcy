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

const STOP_WORDS = new Set([
  'and','for','the','with','from','that','this','need','want','help','best','good','find','your','about','into',
  'after','before','work','role','page','guidcy','apply','make','show','tell','please','more','less','near'
]);

const DOMAIN_TERMS = {
  startup: ['startup','founder','funding','grant','pitch','investor','incubator','accelerator','mvp','business plan','entrepreneur'],
  career: ['career','resume','cv','interview','linkedin','placement','job search','salary','switch','hr','recruiter','recruitment'],
  education: ['college','university','admission','degree','btech','b.tech','mba','phd','gate','cat','jee','neet','scholarship'],
  technology: ['software','technology','developer','engineering','ai','machine learning','data','cloud','react','python','product'],
  research: ['research','r&d','polymer','optical fiber','fiber','chemistry','patent','publication','scientist','phd'],
  finance: ['finance','tax','investment','banking','funding','valuation','accounting','cfa','ca'],
  legal: ['legal','law','contract','compliance','company registration','ip','trademark','patent'],
  marketing: ['marketing','seo','brand','content','growth','sales','ads','social media'],
  business: ['business','strategy','operations','management','consulting','market','customer']
};

const COMPANY_SUFFIXES = /\b(private|pvt|limited|ltd|incorporated|inc|llc|llp|corp|corporation|company|co|technologies|technology|systems|solutions|services|india|global|international|labs|lab)\b/g;

function norm(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function cleanPhrase(value) {
  return norm(value).replace(/[^\w.+#& ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeCompany(value) {
  return cleanPhrase(value).replace(COMPANY_SUFFIXES, ' ').replace(/\s+/g, ' ').trim();
}

function acronymAll(value) {
  return cleanPhrase(value).split(/\s+/).filter(Boolean).map(word => word[0]).join('');
}

function safeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  if (typeof value === 'object') return [value];
  return String(value).split(/[,|;\n]/).map(item => item.trim()).filter(Boolean);
}

function maybeJson(value) {
  if (!value) return null;
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) return value;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return null; }
}

function textOf(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  if (typeof value === 'object') return Object.keys(value).map(key => `${key} ${textOf(value[key])}`).join(' ');
  return '';
}

function experienceEntries(c) {
  const fields = [
    c.previous_companies, c.previous_company_experience, c.company_experience, c.work_experience,
    c.experience_history, c.employment_history, c.experiences, c.experience
  ];
  const out = [];
  fields.forEach(value => {
    const parsed = maybeJson(value);
    const list = Array.isArray(parsed) ? parsed : safeArray(parsed);
    list.forEach(item => {
      if (typeof item === 'string') {
        out.push({ company_name: item });
        return;
      }
      if (!item || typeof item !== 'object') return;
      out.push({
        company_name: item.company_name || item.company || item.organization || item.organisation || item.employer || '',
        designation: item.designation || item.job_title || item.title || item.role || item.position || '',
        department: item.department || item.industry || item.function || '',
        start_date: item.start_date || item.startDate || item.from || '',
        end_date: item.end_date || item.endDate || item.to || '',
        currently_working: item.currently_working === true || item.current === true || item.present === true || /present|current/i.test(String(item.end_date || item.to || ''))
      });
    });
  });
  ['current_company','current_company_college','current_company_normalized','company','company_name','organization','employer_name'].forEach(field => {
    if (c[field]) out.push({
      company_name: c[field],
      designation: c.current_position || c.current_work || c.professional_title || c.role || '',
      department: c.department || c.industry || '',
      currently_working: true
    });
  });
  safeArray(c.experience_companies_normalized).forEach(companyName => {
    if (companyName) out.push({ company_name: companyName });
  });
  const seen = new Set();
  return out.map(item => Object.assign({}, item, {
    company_name: String(item.company_name || '').trim(),
    designation: String(item.designation || '').trim(),
    department: String(item.department || '').trim()
  })).filter(item => {
    if (!item.company_name) return false;
    const key = [normalizeCompany(item.company_name), cleanPhrase(item.designation), item.start_date || '', item.end_date || ''].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function educationEntries(c) {
  const raw = [
    c.highest_education, c.education, c.degree, c.qualification, c.college, c.university,
    c.institute, c.institution, c.current_company_college
  ];
  return raw.concat(safeArray(c.education_history)).map(textOf).filter(Boolean);
}

function consultantText(c) {
  return cleanPhrase([
    c.name, c.full_name, c.role, c.current_position, c.professional_title, c.current_work, c.specialty,
    c.category, c.categories, c.skills, c.expertise, c.tags, c.bio, c.about, c.description, c.industry,
    c.department, c.languages, c.services, c.services_offered, c.grants, c.projects, c.publications,
    educationEntries(c).join(' '), experienceEntries(c).map(textOf).join(' ')
  ].map(textOf).join(' '));
}

function roleOf(c) {
  return c.current_position || c.current_work || c.professional_title || c.role || c.specialty || c.category || 'Consultant';
}

function priceOf(c) {
  return Number(c.video_price || c.price || c.rate || c.session_price || c.consultation_fee || 0) || 0;
}

function isApproved(c) {
  const status = norm(c.approval_status || c.profile_status || c.consultant_status || c.status);
  if (/reject|pending|suspend|hidden|inactive|draft/.test(status)) return false;
  if (c.is_active === false || c.hidden === true || c.is_hidden === true) return false;
  return c.is_approved === true || c.approved === true || status === 'approved' || status === 'verified' || status === '';
}

function extractTerms(text, sector, stage) {
  const input = cleanPhrase([text, sector, stage].join(' '));
  const terms = [];
  Object.keys(DOMAIN_TERMS).forEach(key => {
    if (input.includes(key) || DOMAIN_TERMS[key].some(term => input.includes(term))) terms.push(key, ...DOMAIN_TERMS[key]);
  });
  const quoted = input.match(/"([^"]+)"/g) || [];
  quoted.forEach(q => terms.push(q.replace(/"/g, '')));
  input.split(/[^a-z0-9.+#&]+/i).forEach(word => {
    if (word.length > 2 && !STOP_WORDS.has(word)) terms.push(word);
  });
  return Array.from(new Set(terms.map(cleanPhrase).filter(Boolean))).slice(0, 120);
}

function phraseCandidates(form) {
  const raw = cleanPhrase([form.goal, form.sector, form.stage].filter(Boolean).join(' '));
  const parts = [];
  raw.split(/\b(?:at|in|with|from|for|near|by|after|before)\b/i).forEach(piece => {
    const clean = cleanPhrase(piece);
    if (clean.length > 3) parts.push(clean);
  });
  const caps = String([form.goal, form.sector, form.stage].filter(Boolean).join(' ')).match(/\b[A-Z][A-Za-z0-9&.+]*(?:\s+[A-Z][A-Za-z0-9&.+]*){0,4}\b/g) || [];
  caps.forEach(value => {
    const clean = cleanPhrase(value);
    if (clean.length > 2 && !STOP_WORDS.has(clean)) parts.push(clean);
  });
  return Array.from(new Set(parts.concat(extractTerms(raw, '', '')).filter(Boolean))).slice(0, 80);
}

function fieldMatchScore(fieldText, term, exactScore, broadScore) {
  const hay = cleanPhrase(fieldText);
  const needle = cleanPhrase(term);
  if (!hay || !needle) return 0;
  if (hay === needle) return exactScore;
  if (hay.includes(needle)) return broadScore;
  const words = needle.split(/\s+/).filter(w => w.length > 2);
  if (words.length > 1 && words.every(word => hay.includes(word))) return Math.max(2, broadScore - 3);
  return 0;
}

function companyMatches(query, company) {
  const a = normalizeCompany(query);
  const b = normalizeCompany(company);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && b.includes(a)) return true;
  if (b.length >= 3 && a.includes(b)) return true;
  if (a.length >= 2 && acronymAll(company) === a) return true;
  if (b.length >= 2 && acronymAll(query) === b) return true;
  const aw = a.split(/\s+/).filter(w => w.length > 2);
  return aw.length > 1 && aw.every(w => b.includes(w));
}

function yearsBetween(start, end, current) {
  const startYear = Number(String(start || '').match(/\b(19|20)\d{2}\b/)?.[0] || 0);
  const endYear = current ? new Date().getFullYear() : Number(String(end || '').match(/\b(19|20)\d{2}\b/)?.[0] || 0);
  return startYear && endYear && endYear >= startYear ? endYear - startYear + 1 : 0;
}

function addSignal(signals, type, label, score, exact) {
  if (!label || !score) return;
  const key = `${type}:${cleanPhrase(label)}`;
  if (signals.some(s => s.key === key)) return;
  signals.push({ key, type, label: String(label).trim(), score, exact: !!exact });
}

function scoreConsultant(c, form, intent) {
  const terms = Array.from(new Set([...(intent.terms || []), ...phraseCandidates(form)].map(cleanPhrase).filter(Boolean)));
  const profile = consultantText(c);
  const role = roleOf(c);
  const experiences = experienceEntries(c);
  const education = educationEntries(c);
  const skills = safeArray(c.skills || c.expertise || c.tags || c.categories).map(textOf).filter(Boolean);
  const signals = [];
  let score = 0;

  terms.forEach(term => {
    experiences.forEach(exp => {
      if (companyMatches(term, exp.company_name)) {
        const add = exp.currently_working ? 70 : 56;
        score += add + yearsBetween(exp.start_date, exp.end_date, exp.currently_working) * 3;
        addSignal(signals, 'company', `${exp.currently_working ? 'Current' : 'Previous'} ${exp.company_name}${exp.designation ? ` ${exp.designation}` : ''}`, add, true);
      }
      const roleHit = fieldMatchScore(exp.designation, term, 38, 22);
      if (roleHit) { score += roleHit; addSignal(signals, 'role', exp.designation, roleHit, roleHit >= 38); }
      const deptHit = fieldMatchScore(exp.department, term, 28, 16);
      if (deptHit) { score += deptHit; addSignal(signals, 'field', exp.department, deptHit, deptHit >= 28); }
    });
    education.forEach(ed => {
      const edScore = fieldMatchScore(ed, term, 44, 27);
      if (edScore) { score += edScore; addSignal(signals, 'education', ed, edScore, edScore >= 44); }
    });
    skills.forEach(skill => {
      const skillScore = fieldMatchScore(skill, term, 34, 20);
      if (skillScore) { score += skillScore; addSignal(signals, 'skill', skill, skillScore, skillScore >= 34); }
    });
    const roleScore = fieldMatchScore(role, term, 42, 24);
    if (roleScore) { score += roleScore; addSignal(signals, 'role', role, roleScore, roleScore >= 42); }
    if (profile.includes(term)) {
      score += term.length > 5 ? 8 : 3;
      addSignal(signals, 'profile', term, term.length > 5 ? 8 : 3, false);
    }
  });

  if (form.budget) {
    const price = priceOf(c);
    const budget = Number(String(form.budget).replace(/[^\d]/g, '')) || 0;
    if (budget && price && price <= budget) score += 8;
  }
  const rating = Number(c.rating || c.average_rating || 0) || 0;
  score += rating * 3 + (Number(c.response_rate || c.response_time_score || 0) || 0) / 20;
  const completion = ['bio','about','avatar_url','current_position','current_work','highest_education','college','skills','category'].reduce((n, key) => n + (c[key] ? 1 : 0), 0);
  score += completion;

  signals.sort((a, b) => (b.exact - a.exact) || b.score - a.score);
  return { consultant: c, score, signals: signals.slice(0, 8), hits: signals.map(s => s.label).slice(0, 7) };
}

function compactProfile(c, signals) {
  return {
    id: c.id,
    name: c.name || c.full_name || 'Consultant',
    role: roleOf(c),
    category: c.category || c.specialty || '',
    bio: String(c.bio || c.about || c.description || '').replace(/\s+/g, ' ').slice(0, 420),
    expertise: safeArray(c.expertise || c.skills || c.tags || c.categories).map(textOf).slice(0, 10),
    current_work: c.current_work || c.current_position || '',
    current_company: c.current_company || c.current_company_college || '',
    education: educationEntries(c).slice(0, 4).join(', '),
    experience: experienceEntries(c).slice(0, 5),
    languages: safeArray(c.languages || c.language || c.preferred_language).map(textOf).slice(0, 6),
    rating: c.rating || c.average_rating || '',
    reviews: c.reviews || c.review_count || '',
    match_signals: signals
  };
}

function publicConsultant(c) {
  return {
    id: c.id,
    profile_id: c.profile_id || c.user_id || '',
    name: c.name || c.full_name || 'Consultant',
    full_name: c.full_name || c.name || 'Consultant',
    avatar_initials: c.avatar_initials || '',
    avatar_bg: c.avatar_bg || '',
    avatar_color: c.avatar_color || '',
    avatar_url: c.avatar_url || '',
    role: roleOf(c),
    current_position: c.current_position || c.current_work || c.professional_title || '',
    current_work: c.current_work || c.current_position || '',
    current_company: c.current_company || c.current_company_college || '',
    specialty: c.specialty || '',
    category: c.category || '',
    categories: safeArray(c.categories).map(textOf).slice(0, 8),
    bio: String(c.bio || c.about || c.description || '').replace(/\s+/g, ' ').slice(0, 520),
    about: String(c.about || c.bio || '').replace(/\s+/g, ' ').slice(0, 520),
    skills: safeArray(c.skills || c.expertise || c.tags).map(textOf).slice(0, 10),
    tags: safeArray(c.tags || c.skills || c.expertise).map(textOf).slice(0, 10),
    expertise: safeArray(c.expertise || c.skills || c.tags).map(textOf).slice(0, 10),
    highest_education: c.highest_education || c.degree || c.qualification || '',
    college: c.college || c.university || c.institute || '',
    languages: safeArray(c.languages || c.language || c.preferred_language).map(textOf).slice(0, 6),
    badge: c.badge || c.verification_badge || '',
    rating: c.rating || c.average_rating || 0,
    review_count: c.review_count || c.reviews || 0,
    total_sessions: c.total_sessions || 0,
    rate: priceOf(c),
    price: priceOf(c),
    video_price: c.video_price || c.price || c.rate || c.session_price || 0,
    session_types: safeArray(c.session_types || c.sessionTypes).map(textOf).slice(0, 5)
  };
}

function reasonFallback(match, form) {
  const c = match.consultant;
  const signals = match.signals || [];
  const name = c.name || c.full_name || 'This consultant';
  const goal = cleanPhrase(form.goal || 'your requirement');
  const primary = signals[0];
  const second = signals[1];
  if (primary) {
    const detail = [primary.label, second && second.label].filter(Boolean).join(' and ');
    if (primary.type === 'company') return `${name} is relevant because their approved profile includes ${detail}. That experience can help you understand expectations, preparation steps, and practical next moves for ${goal}.`;
    if (primary.type === 'education') return `${name} has an education background connected to ${detail}. That makes the profile useful for comparing options and planning realistic next steps for ${goal}.`;
    if (primary.type === 'skill') return `${name} lists skills connected to ${detail}. Those skills are directly useful for turning ${goal} into an actionable plan.`;
    return `${name}'s profile shows ${detail}, which connects with ${goal}. The match is based on approved profile data, not a generic recommendation.`;
  }
  return `${name}'s approved profile has relevant background for this request. Review the profile details before booking to confirm fit.`;
}

function badgesFromSignals(signals) {
  return (signals || []).filter(s => s && s.label).slice(0, 3).map(signal => {
    if (signal.type === 'company') return signal.label.replace(/^Current /, 'Currently at ').replace(/^Previous /, 'Previously at ');
    if (signal.type === 'education') return signal.label;
    if (signal.type === 'skill') return signal.label;
    return signal.label;
  });
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
  const attempts = [
    '/rest/v1/consultants?select=*&approval_status=eq.approved&is_active=eq.true&limit=1000',
    '/rest/v1/consultants?select=*&is_approved=eq.true&is_active=eq.true&limit=1000',
    '/rest/v1/consultants?select=*&approval_status=eq.approved&limit=1000',
    '/rest/v1/consultants?select=*&limit=1000'
  ];
  for (const path of attempts) {
    try {
      const rows = await supabaseRest(path);
      if (Array.isArray(rows) && rows.length) return rows.filter(row => row && row.id && isApproved(row));
    } catch (e) {
      console.warn('Expert match consultant fetch attempt failed:', e.message || e);
    }
  }
  return [];
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
    categories: [],
    summary: 'Profile-data based consultant recommendation.'
  };
  const context = contextRows.map((row, index) => `Source ${index + 1}: ${row.title}\n${row.content}`).join('\n\n---\n\n').slice(0, 5000);
  try {
    const answer = await createChatCompletion([
      {
        role: 'system',
        content: 'You are Guidcy matching intelligence. Return ONLY valid JSON. Extract specific organizations, colleges, degrees, fields, skills, roles, grants, jobs, and advisory needs from the user request.'
      },
      {
        role: 'user',
        content: `Request:\n${JSON.stringify(form)}\n\nRetrieved context:\n${context || 'No vector context available.'}\n\nReturn JSON: {"summary":"one sentence","categories":["Career"],"terms":["Google","resume","IIT","polymer"],"ideal_expert":"short description"}`
      }
    ], { maxTokens: 700, temperature: 0.08 });
    const parsed = parseJson(answer, fallback);
    parsed.terms = Array.isArray(parsed.terms) && parsed.terms.length ? parsed.terms.concat(fallback.terms) : fallback.terms;
    parsed.terms = Array.from(new Set(parsed.terms.map(cleanPhrase).filter(Boolean))).slice(0, 120);
    parsed.categories = Array.isArray(parsed.categories) ? parsed.categories : [];
    return parsed;
  } catch (e) {
    console.warn('Expert match intent fallback:', e.message || e);
    return fallback;
  }
}

async function enrichReasons(matches, intent, form) {
  if (!matches.length) return matches;
  const fallback = matches.map(match => ({ id: match.consultant.id, reason: reasonFallback(match, form) }));
  try {
    const answer = await createChatCompletion([
      {
        role: 'system',
        content: [
          'You write short Guidcy consultant recommendation reasons.',
          'Use only the provided profile fields and match_signals.',
          'Do not invent achievements, company history, ratings, education, or private information.',
          'Never use the phrase "matches your goal through".',
          'Return ONLY valid JSON.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          user_requirement: form,
          inferred_intent: intent,
          consultants: matches.map(match => compactProfile(match.consultant, match.signals))
        }) + '\nReturn JSON exactly as: {"reasons":[{"id":"consultant id","reason":"2 concise sentences explaining why this profile is relevant to the request"}]}'
      }
    ], { maxTokens: 1300, temperature: 0.22 });
    const parsed = parseJson(answer, { reasons: fallback });
    const reasonMap = new Map((Array.isArray(parsed.reasons) ? parsed.reasons : fallback).map(item => [String(item.id), String(item.reason || '').trim()]));
    return matches.map(match => Object.assign({}, match, {
      reason: reasonMap.get(String(match.consultant.id)) || reasonFallback(match, form)
    }));
  } catch (e) {
    console.warn('Expert match reason fallback:', e.message || e);
    return matches.map(match => Object.assign({}, match, { reason: reasonFallback(match, form) }));
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
      sector: body.sector || body.context || '',
      page_context: body.page_context || body.context || '',
      limit: Math.max(1, Math.min(Number(body.limit || 8) || 8, 12))
    };
    const question = [form.goal, form.stage, form.sector, form.page_context].filter(Boolean).join(' ');
    const [consultants, contextRows] = await Promise.all([fetchConsultants(), ragContext(question)]);
    const intent = await inferIntent(form, contextRows);
    const allRanked = consultants
      .map(c => scoreConsultant(c, form, intent))
      .filter(item => item.score > 0)
      .sort((a, b) => {
        const ax = (a.signals || []).some(s => s.exact) ? 1 : 0;
        const bx = (b.signals || []).some(s => s.exact) ? 1 : 0;
        return (bx - ax) || b.score - a.score;
      });
    const exactCompanyRanked = allRanked.filter(item => (item.signals || []).some(signal => signal.type === 'company' && signal.exact));
    const ranked = (exactCompanyRanked.length ? exactCompanyRanked : allRanked).slice(0, form.limit);
    const matches = (await enrichReasons(ranked, intent, form)).map(match => ({
      consultant: publicConsultant(match.consultant),
      score: Math.round(match.score),
      hits: match.hits,
      badges: badgesFromSignals(match.signals),
      signals: match.signals,
      reason: match.reason || reasonFallback(match, form)
    }));
    return json(res, 200, {
      ok: true,
      intent,
      matches,
      consultants: matches.map(match => match.consultant),
      sources: uniqueSources(contextRows)
    });
  } catch (e) {
    console.error('Expert match error:', e);
    return json(res, 200, {
      ok: false,
      error: e.message || 'Expert matching is temporarily unavailable.',
      matches: [],
      consultants: [],
      sources: []
    });
  }
};
