const {
  json,
  readBody,
  setCors,
  supabaseFetch,
  validateQuestion
} = require('../lib/rag-utils');


const STOP_WORDS = new Set([
  'and','for','the','with','from','that','this','need','want','help','best','good','find','your','about','into',
  'after','before','work','role','page','guidcy','apply','make','show','tell','please','more','less','near'
]);


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
        description: item.description || item.summary || item.details || item.responsibilities || '',
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







/* Typos: "loigstics", "marketting", "startupp". Rather than ship a dictionary,
   correct against the words the profiles themselves use - so a correction can
   only ever move a term towards something a consultant actually wrote. Applied
   only to terms that appear nowhere, so a real word is never rewritten.
   Bounded: distance 1 for short words, 2 from seven characters up. */
function editDistanceWithin(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

function profileVocabulary(consultants) {
  const vocab = new Set();
  for (const c of consultants) {
    for (const word of consultantText(c).split(/[^a-z0-9+#.]+/)) {
      if (word.length >= 4 && word.length <= 24 && !STOP_WORDS.has(word)) vocab.add(word);
    }
    if (vocab.size > 6000) break;
  }
  return vocab;
}

function correctTerms(terms, vocab) {
  if (!vocab.size) return terms;
  const corrected = new Set(terms);
  for (const term of terms) {
    if (term.includes(' ') || term.length < 4 || vocab.has(term)) continue;
    const budget = term.length >= 7 ? 2 : 1;
    let best = '';
    let bestDistance = budget + 1;
    for (const word of vocab) {
      if (Math.abs(word.length - term.length) > budget) continue;
      if (word[0] !== term[0]) continue;
      for (let d = 1; d <= budget; d++) {
        if (editDistanceWithin(term, word, d)) {
          if (d < bestDistance) { bestDistance = d; best = word; }
          break;
        }
      }
      if (bestDistance === 1) break;
    }
    if (best) corrected.add(best);
  }
  return Array.from(corrected);
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




/* Was building its own base URL and only stripping a trailing slash. The
   SUPABASE_URL env carries a "/rest/v1" suffix - which is why razorpay-utils
   normalises it - so every call here asked for /rest/v1/rest/v1/... and Supabase
   answered "Invalid path specified in request URL". Zero consultants were ever
   fetched, so the matcher returned no matches and the browser quietly fell back
   to keyword ranking. supabaseFetch takes the URL's origin and is already the
   shared helper for these endpoints. */
const supabaseRest = supabaseFetch;

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




/* Words that genuinely mean the same work. Someone searching NPD wants the
   person who wrote "new product development" or "R&D"; someone searching R&D
   wants the PhD who runs a lab. This is a deliberate, readable list rather than
   an inferred expansion - the inferred one is exactly what put every consultant
   under every search. Each group is mutual: any word in it reaches the others.
   Related profiles are shown after the direct ones and never instead of them. */
const RELATED_GROUPS = [
  ['npd', 'new product development', 'product development', 'r&d', 'research and development', 'process development', 'innovation'],
  ['r&d', 'research', 'phd', 'doctorate', 'laboratory', 'patent', 'publication'],
  ['logistics', 'supply chain', 'warehousing', 'inventory', 'procurement', 'operations'],
  ['marketing', 'brand', 'branding', 'growth', 'seo', 'advertising', 'campaign'],
  ['finance', 'accounting', 'tax', 'investment', 'valuation', 'audit'],
  ['startup', 'founder', 'entrepreneur', 'incubation', 'fundraising', 'venture'],
  ['career', 'resume', 'cv', 'interview', 'placement', 'recruitment', 'hiring'],
  ['legal', 'contract', 'compliance', 'intellectual property', 'trademark'],
  ['event management', 'events', 'event planning', 'production', 'hospitality'],
  ['data', 'analytics', 'machine learning', 'artificial intelligence', 'data science'],
  ['product', 'ux', 'design', 'user research'],
  ['education', 'admission', 'college', 'university', 'mentoring', 'coaching'],
];

/* Terms that mean the same work as what was typed, minus the typed words
   themselves - those are the direct search. */
function relatedTerms(terms) {
  const typed = new Set(terms);
  const out = new Set();
  RELATED_GROUPS.forEach(group => {
    if (!group.some(word => typed.has(word) || terms.some(term => term.includes(word)))) return;
    group.forEach(word => { if (!typed.has(word)) out.add(word); });
  });
  return Array.from(out);
}

/* The reader's own words, nothing added. The whole phrase plus its individual
   words, so "event management" finds both the phrase and either word, and the
   typo pass can still nudge a misspelling onto a word the profiles use. */
function goalTerms(form, vocab) {
  const phrase = cleanPhrase(form.goal);
  if (!phrase) return [];
  const words = phrase.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  const wanted = Array.from(new Set([phrase.length >= 3 ? phrase : '', ...words].filter(Boolean)));
  return correctTerms(wanted, vocab);
}

/* Which of those words this profile actually contains - every field of it,
   including what they wrote about each role. */
function profileHits(c, terms) {
  const text = consultantText(c);
  return terms.filter(term => text.includes(term));
}

/* The reader's filters, applied only when they set one. */
function passesFilters(c, form) {
  const budget = Number(String(form.budget || '').replace(/[^\d]/g, '')) || 0;
  if (form.budget) {
    const price = priceOf(c);
    if (/free/i.test(String(form.budget))) { if (price > 0) return false; }
    else if (budget && price > budget) return false;
  }
  if (form.language) {
    const spoken = cleanPhrase(textOf([c.languages, c.language, c.preferred_language]));
    if (spoken && !spoken.includes(cleanPhrase(form.language))) return false;
  }
  return true;
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
    /* Search, plainly. The goal is the query: if a word the reader typed appears
       anywhere in a profile, that consultant is shown; if it does not, they are
       not. Their filters then narrow it, and the rating decides the order.

       Everything that used to sit here - a generous intent expansion, weighted
       signals, relevance tiers - kept deciding things the reader had not asked
       for. "event management" became logistics, budgeting and risk management,
       which matched nearly every profile, and the result was everybody, every
       time. The reader's own words are the whole query now. */
    const consultants = await fetchConsultants();
    const terms = goalTerms(form, profileVocabulary(consultants));
    if (!terms.length) {
      return json(res, 200, { ok: true, terms, matches: [], consultants: [], sources: [] });
    }

    const ratingOf = c => Number(c.rating || c.average_rating || 0) || 0;
    const reviewsOf = c => Number(c.reviews || c.review_count || 0) || 0;
    const ranked = consultants
      .map(c => ({ consultant: c, hits: profileHits(c, terms) }))
      .filter(item => item.hits.length && passesFilters(item.consultant, form))
      .sort((a, b) => {
        const byRating = ratingOf(b.consultant) - ratingOf(a.consultant);
        if (byRating) return byRating;
        const byReviews = reviewsOf(b.consultant) - reviewsOf(a.consultant);
        if (byReviews) return byReviews;
        /* Unrated consultants keep a stable order rather than shuffling between
           identical searches. */
        return String(a.consultant.name || '').localeCompare(String(b.consultant.name || ''));
      })
      .slice(0, form.limit);

    /* Then a few profiles that do the same work under another name, kept
       separate so the reader can see which is which, and only ever alongside a
       direct answer - never as a way to fill an empty page. */
    const alsoTerms = relatedTerms(terms);
    const shown = new Set(ranked.map(item => String(item.consultant.id)));
    const related = alsoTerms.length ? consultants
      .filter(c => !shown.has(String(c.id)))
      .map(c => ({ consultant: c, hits: profileHits(c, alsoTerms) }))
      .filter(item => item.hits.length && passesFilters(item.consultant, form))
      .sort((a, b) => (ratingOf(b.consultant) - ratingOf(a.consultant))
        || (reviewsOf(b.consultant) - reviewsOf(a.consultant))
        || String(a.consultant.name || '').localeCompare(String(b.consultant.name || '')))
      .slice(0, 4) : [];

    const shape = (match, isRelated) => ({
      consultant: publicConsultant(match.consultant),
      rating: ratingOf(match.consultant),
      reviews: reviewsOf(match.consultant),
      hits: match.hits.slice(0, 6),
      related: isRelated
    });
    const matches = ranked.map(m => shape(m, false));
    return json(res, 200, {
      ok: true,
      terms,
      relatedTerms: alsoTerms,
      matches,
      related: related.map(m => shape(m, true)),
      consultants: matches.map(match => match.consultant),
      sources: []
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
