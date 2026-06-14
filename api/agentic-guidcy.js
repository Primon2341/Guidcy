const {
  createChatCompletion,
  json,
  readBody,
  setCors
} = require('../lib/rag-utils');

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lsthngfxehayeqyctkla.supabase.co').replace(/\/$/, '');
const GUIDCY_PUBLIC_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzdGhuZ2Z4ZWhheWVxeWN0a2xhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMTgyNzcsImV4cCI6MjA5MjY5NDI3N30.kKTzunZl1JGLNswkPZUBOy9xD8G9FyIGbx0Oh6msIo4';
const SUPABASE_REST_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || GUIDCY_PUBLIC_ANON_KEY;

const INTENTS = [
  'expert_booking',
  'marketplace_notes',
  'webinar',
  'career_guidance',
  'job_search',
  'funding_grant',
  'support_issue',
  'general_guidance'
];

const KEYWORDS = {
  expert_booking: ['expert','consultant','mentor','guidance','session','book','advisor','advice','help'],
  marketplace_notes: ['note','notes','pdf','study material','gate','cat','jee','neet','download','resource','material'],
  webinar: ['webinar','workshop','session','placement webinar','attend','event','seminar','class'],
  career_guidance: ['career','confused','b.tech','btech','college','resume','cv','interview','linkedin','placement','course','degree','mba'],
  job_search: ['job','internship','apply','hiring','work','fresher','opening','remote'],
  funding_grant: ['funding','grant','fund','startup','investor','pitch','incubator','accelerator','scholarship','competition'],
  support_issue: ['payment','paid','not downloaded','download issue','refund','failed','support','complaint','ticket','problem','issue'],
  general_guidance: ['plan','roadmap','next step','guide','confusion','help']
};

function clean(value, max = 500) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function low(value) {
  return clean(value, 2000).toLowerCase();
}

function array(value) {
  if (Array.isArray(value)) return value.map(item => clean(item, 80)).filter(Boolean);
  if (!value) return [];
  return String(value).split(/[,|;\n]/).map(item => clean(item, 80)).filter(Boolean);
}

function money(value) {
  const n = Number(value || 0) || 0;
  return n ? `₹${n.toLocaleString('en-IN')}` : 'Free';
}

function parseJson(text, fallback) {
  const raw = String(text || '').replace(/```json|```/gi, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) return fallback;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) { return fallback; }
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.map(message => ({
    role: clean(message && message.role, 20) === 'assistant' ? 'assistant' : 'user',
    content: clean(message && message.content, 1200)
  })).filter(message => message.content).slice(-12);
}

function conversationGoal(messages, fallback) {
  const lastUser = [...(messages || [])].reverse().find(message => message.role === 'user' && message.content);
  const combined = (messages || []).filter(message => message.role === 'user').map(message => message.content).join(' | ');
  return clean(combined || (lastUser && lastUser.content) || fallback || '', 1200);
}

function profileSummary(profile) {
  profile = safeObject(profile);
  const allowed = {
    name: clean(profile.name || profile.full_name || profile.first_name || '', 80),
    role: clean(profile.role || profile.user_role || '', 80),
    education: clean(profile.education || profile.highest_education || '', 120),
    college: clean(profile.college || profile.current_company_college || '', 120),
    current_work: clean(profile.current_work || profile.profession || '', 120),
    company: clean(profile.company || profile.current_company || '', 120),
    dashboard_role: clean(profile.dashboard_role || '', 80)
  };
  Object.keys(allowed).forEach(key => { if (!allowed[key]) delete allowed[key]; });
  return allowed;
}

function meaningfulTokens(value) {
  const stop = new Set(['i','me','my','need','want','help','guidance','please','for','with','about','the','a','an','to','in','on','and','or']);
  return low(value).split(/[^a-z0-9.+#]+/i).filter(word => word.length > 2 && !stop.has(word));
}

function isBroadRequest(form, messages, profile) {
  const text = conversationGoal(messages, form.goal);
  if (/payment|paid|download|refund|failed|support|issue|problem|gate|cat|jee|neet|resume|webinar|job|startup|fund|grant|career|college|btech|b\.tech/i.test(text)) return false;
  const tokens = meaningfulTokens(text);
  const hasProfileSignal = Object.keys(profileSummary(profile)).length >= 2;
  return tokens.length < 3 && !hasProfileSignal;
}

function normalizeUuid(value) {
  const v = clean(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : null;
}

function termsFrom(form, intents) {
  const base = low([form.goal, form.stage, form.budget, form.language, form.urgency, form.sector].filter(Boolean).join(' '));
  const terms = [];
  (intents || []).forEach(intent => terms.push(...(KEYWORDS[intent] || [])));
  base.split(/[^a-z0-9.+#]+/i).forEach(word => {
    if (word.length > 2) terms.push(word);
  });
  const seen = new Set();
  return terms.map(low).filter(term => {
    if (!term || seen.has(term)) return false;
    seen.add(term);
    return true;
  }).slice(0, 80);
}

function ruleClassify(form) {
  const hay = low([form.goal, form.stage, form.sector].join(' '));
  const intents = [];
  Object.entries(KEYWORDS).forEach(([intent, words]) => {
    if (words.some(word => hay.includes(word))) intents.push(intent);
  });
  if (/gate|cat|jee|neet|notes?|pdf|material/.test(hay) && !intents.includes('marketplace_notes')) intents.unshift('marketplace_notes');
  if (/payment|paid|download|refund|failed|support|issue|problem/.test(hay)) {
    return {
      intents: ['support_issue'],
      summary: 'You need help with a Guidcy payment or access issue.',
      extracted_profile: { urgency: form.urgency || '', sector: form.sector || '', stage: form.stage || '' },
      follow_up_questions: ['Which payment/order ID is linked to this issue?', 'Was this for notes, webinar registration, or consultant booking?']
    };
  }
  if (!intents.length) intents.push('general_guidance');
  return {
    intents: Array.from(new Set(intents)).filter(intent => INTENTS.includes(intent)).slice(0, 4),
    summary: `You want guidance for: ${clean(form.goal, 160)}.`,
    extracted_profile: { urgency: form.urgency || '', sector: form.sector || '', stage: form.stage || '', budget: form.budget || '', language: form.language || '' },
    follow_up_questions: hay.split(/\s+/).filter(Boolean).length < 5 ? ['What outcome do you want in the next 30 days?', 'Are you looking for learning material, expert help, or opportunities first?'] : []
  };
}

async function inferWithGroq(form) {
  const fallback = ruleClassify(form);
  try {
    const answer = await createChatCompletion([
      {
        role: 'system',
        content: 'You are Guidcy AI planning intelligence. Return ONLY valid JSON. Classify the user need into the allowed intents and write a concise helpful summary. Do not make bookings, payments, approvals, refunds, or admin actions.'
      },
      {
        role: 'user',
        content: JSON.stringify({ form, allowed_intents: INTENTS }) + '\nReturn JSON exactly as {"summary":"one sentence","intents":["expert_booking"],"extracted_profile":{"goal_type":"","audience":"","constraints":[]},"follow_up_questions":["question if broad"]}'
      }
    ], { maxTokens: 700, temperature: 0.12 });
    const parsed = parseJson(answer, fallback);
    const intents = Array.isArray(parsed.intents) ? parsed.intents.filter(intent => INTENTS.includes(intent)) : fallback.intents;
    return {
      intents: intents.length ? Array.from(new Set(intents)).slice(0, 5) : fallback.intents,
      summary: clean(parsed.summary || fallback.summary, 260),
      extracted_profile: parsed.extracted_profile && typeof parsed.extracted_profile === 'object' ? parsed.extracted_profile : fallback.extracted_profile,
      follow_up_questions: Array.isArray(parsed.follow_up_questions) ? parsed.follow_up_questions.map(q => clean(q, 160)).filter(Boolean).slice(0, 4) : fallback.follow_up_questions,
      ai_used: true
    };
  } catch (error) {
    console.warn('Agentic Guidcy Groq fallback:', error.message || error);
    return Object.assign({}, fallback, { ai_used: false });
  }
}

async function supabaseRest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    method: options.method || 'GET',
    headers: Object.assign({
      apikey: SUPABASE_REST_KEY,
      Authorization: `Bearer ${SUPABASE_REST_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation'
    }, options.headers || {}),
    body: options.body
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!response.ok) throw Object.assign(new Error(typeof data === 'string' ? data : (data && (data.message || data.error)) || 'Supabase request failed'), { status: response.status, data });
  return data;
}

const LIVE_DEBUG = process.env.GUIDCY_AGENT_DEBUG === '1';

async function readTable(table, query = 'select=*&limit=200') {
  try {
    const rows = await supabaseRest(`/rest/v1/${table}?${query}`);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn(`Guidcy AI live data skipped ${table}:`, error.message || error);
    return [];
  }
}

async function readFirstWorking(table, queries) {
  const errors = [];
  for (const query of queries) {
    try {
      const rows = await supabaseRest(`/rest/v1/${table}?${query}`);
      return { table, rows: Array.isArray(rows) ? rows : [], error: '' };
    } catch (error) {
      errors.push(`${query}: ${error.message || error}`);
    }
  }
  console.warn(`Guidcy AI live data skipped ${table}:`, errors[0] || 'no query worked');
  return { table, rows: [], error: errors[0] || 'no query worked' };
}

async function readTableGroup(label, tables, queries) {
  const results = await Promise.all(tables.map(table => readFirstWorking(table, queries)));
  const rows = [];
  const diagnostics = {};
  results.forEach(result => {
    diagnostics[result.table] = result.rows.length || (result.error ? `0 (${result.error.slice(0, 100)})` : 0);
    result.rows.forEach(row => {
      if (row && typeof row === 'object') rows.push(Object.assign({ __guidcy_source_table: result.table }, row));
    });
  });
  if (LIVE_DEBUG) console.warn(`Guidcy AI ${label} live rows:`, diagnostics);
  return { rows, diagnostics };
}

function approvedConsultant(row) {
  const statusText = low([row.status, row.approval_status, row.verification_status, row.publish_status, row.profile_status].join(' '));
  const hasStatus = ['status','approval_status','verification_status','publish_status','profile_status','is_approved','approved','is_active','active'].some(key => Object.prototype.hasOwnProperty.call(row, key));
  if (row.is_approved === true || row.approved === true) return true;
  if (row.is_active === false || row.active === false) return false;
  if (/approved|verified|active|published|live/.test(statusText) && !/pending|rejected|blocked|draft|inactive/.test(statusText)) return true;
  return !hasStatus;
}

function publicNote(row) {
  const status = low([row.status, row.approval_status, row.publish_status].join(' '));
  if (row.removed_at || row.deleted_at) return false;
  if (!status) return true;
  return /active|approved|published|live/.test(status) && !/pending|rejected|removed|deleted|draft/.test(status);
}

function publicWebinar(row) {
  const status = low([row.status, row.publish_status, row.registration_status].join(' '));
  if (!status) return true;
  return /active|approved|published|live|upcoming|open/.test(status) && !/draft|rejected|deleted|cancelled/.test(status);
}

function publicJob(row) {
  const status = low([row.status, row.approval_status, row.publish_status].join(' '));
  if (!status) return true;
  return /active|approved|published|open|live/.test(status) && !/pending|rejected|closed|deleted|draft/.test(status);
}

function textFor(row, fields) {
  return fields.map(field => Array.isArray(row[field]) ? row[field].join(' ') : String(row[field] || '')).join(' ').toLowerCase();
}

function scoreRow(row, terms, fields) {
  const text = textFor(row, fields);
  let score = 0;
  const hits = [];
  terms.forEach(term => {
    if (term && text.includes(term)) {
      score += term.length > 4 ? 2 : 1;
      if (hits.length < 5 && !hits.includes(term)) hits.push(term);
    }
  });
  return { row, score, hits };
}

function rankRows(rows, terms, fields, fallbackCount = 3) {
  const ranked = rows.map(row => scoreRow(row, terms, fields)).sort((a, b) => b.score - a.score);
  const positive = ranked.filter(item => item.score > 0);
  return (positive.length ? positive : ranked.slice(0, fallbackCount)).slice(0, 5);
}

function isUsableId(value) {
  return clean(value, 120).length > 0;
}

function consultantReason(c, form, hits) {
  const role = clean(c.role || c.specialty || c.category || c.current_work || 'consultant');
  const expertise = array(c.expertise || c.skills || c.tags || c.categories).slice(0, 3).join(', ');
  const signals = [role !== 'consultant' ? role : '', expertise, c.current_company ? `experience connected with ${clean(c.current_company, 80)}` : '', c.highest_education ? clean(c.highest_education, 80) : ''].filter(Boolean);
  return `${clean(c.name || c.full_name || 'This expert', 80)} is recommended because the registered profile shows ${signals.slice(0, 3).join(', ') || 'relevant consulting background'}${hits && hits.length ? `, matching ${hits.slice(0, 3).join(', ')}` : ''}. This can help you turn "${clean(form.goal, 90)}" into clearer next actions.`;
}

function itemReason(item, type, form, hits) {
  const title = clean(item.title || item.name || item.job_title || item.webinar_title || 'this item', 100);
  if (type === 'note') return `This resource is relevant because "${title}" matches the topic or learning material you requested${hits && hits.length ? `, especially ${hits.slice(0, 3).join(', ')}` : ''}.`;
  if (type === 'webinar') return `This webinar can help you learn from a live Guidcy session related to your goal${hits && hits.length ? ` around ${hits.slice(0, 3).join(', ')}` : ''}.`;
  if (type === 'job') return `This opportunity appears related to your career or job-search goal${hits && hits.length ? ` through ${hits.slice(0, 3).join(', ')}` : ''}.`;
  return `This funding or grant item appears related to your startup, scholarship, or funding requirement${hits && hits.length ? ` through ${hits.slice(0, 3).join(', ')}` : ''}.`;
}

function nextStep(intents) {
  if (intents.includes('support_issue')) return { title: 'Contact Guidcy support with payment/order details', description: 'Do not make another payment. Share your registered email, transaction ID, and whether it was notes, webinar, or booking.', action_label: 'Open Help Center', route: '/help-center' };
  if (intents.includes('marketplace_notes')) return { title: 'Start with relevant notes, then use experts/webinars if needed', description: 'Preview or buy the most relevant notes first, then book a session for doubts or strategy.', action_label: 'Open Marketplace', route: '/marketplace' };
  if (intents.includes('funding_grant')) return { title: 'Check grants and speak with a startup/funding expert', description: 'Prepare a clear pitch, eligibility checklist, and documents before applying.', action_label: 'Open Funds & Grants Finder', route: '/funds-grants' };
  if (intents.includes('job_search')) return { title: 'Shortlist jobs and improve your application material', description: 'Save matching roles, then refine resume, LinkedIn, and interview preparation.', action_label: 'Open Jobs', route: '/find-jobs' };
  if (intents.includes('career_guidance')) return { title: 'Build a career direction plan before booking', description: 'Use the Career & College AI Finder and compare expert guidance, resources, and webinars.', action_label: 'Open Career AI Finder', route: '/career-ai-finder' };
  return { title: 'Review the recommendations and refine your goal', description: 'Use the sections below to choose whether you need expert help, resources, webinars, jobs, or grants.', action_label: 'Refine Search', route: '/' };
}

function genericPlanSeed(form, intents, counts) {
  const goal = clean(form.goal, 180);
  if (intents.includes('support_issue')) {
    return {
      title: 'Support and resolution plan',
      objective: `Resolve the issue: ${goal}`,
      suggested_order: ['Collect proof', 'Open support/dispute flow', 'Wait for verification', 'Avoid duplicate payment'],
      phases: [
        {
          title: 'Step 1: Collect payment and order details',
          timeframe: 'Now',
          actions: ['Keep your registered email ready.', 'Copy the PayU transaction ID, order ID, or payment screenshot.', 'Mention whether this was marketplace notes, webinar registration, or consultant booking.'],
          outcome: 'Guidcy support can identify the exact transaction without guessing.'
        },
        {
          title: 'Step 2: Raise the issue through Guidcy support',
          timeframe: 'Today',
          actions: ['Open Help Center or Dispute Resolution.', 'Submit one clear message with transaction proof.', 'Do not create a second payment while the first transaction is being checked.'],
          outcome: 'Your issue enters the proper support flow instead of random expert matching.'
        }
      ],
      checklist: ['Registered email', 'Transaction ID/order ID', 'Screenshot if available', 'Exact product/session/webinar name'],
      success_signal: 'You receive access, refund/update information, or a clear support response.'
    };
  }

  const phases = [
    {
      title: 'Step 1: Define the exact outcome',
      timeframe: 'Today',
      actions: [
        `Write one sentence for the goal: "${goal}".`,
        'Decide what success should look like in the next 7 to 30 days.',
        form.budget ? `Keep the selected budget in mind: ${form.budget}.` : 'Decide whether you want free resources first or paid expert help.'
      ],
      outcome: 'Your goal becomes specific enough to choose the right Guidcy tool.'
    }
  ];

  if (intents.includes('marketplace_notes')) {
    phases.push({
      title: 'Step 2: Start with notes/resources',
      timeframe: 'Today or this week',
      actions: [
        counts.notes ? `Review the recommended marketplace notes first (${counts.notes} live match${counts.notes === 1 ? '' : 'es'} found).` : 'Check Marketplace for the closest subject/exam/resource match.',
        'Preview the available pages before buying.',
        'Use the notes to list doubts or weak areas before booking any session.'
      ],
      outcome: 'You get study material first, then use expert help only where needed.'
    });
  }

  if (intents.includes('career_guidance')) {
    phases.push({
      title: 'Step 2: Build your career direction map',
      timeframe: 'This week',
      actions: [
        'Use Career & College AI Finder to compare roles, courses, and next-step options.',
        counts.jobs ? `Shortlist relevant jobs or opportunities (${counts.jobs} live match${counts.jobs === 1 ? '' : 'es'} found).` : 'If jobs are relevant, check Find Jobs after clarifying your direction.',
        'Prepare resume, skills, and interview questions before expert booking.'
      ],
      outcome: 'You know which direction to pursue and what gaps to fix.'
    });
  }

  if (intents.includes('funding_grant')) {
    phases.push({
      title: 'Step 2: Prepare funding readiness',
      timeframe: 'This week',
      actions: [
        'Create a one-page startup/problem summary.',
        'Prepare pitch deck, traction, target customer, and funding requirement.',
        counts.grants ? `Review matching grants/funding items (${counts.grants} live match${counts.grants === 1 ? '' : 'es'} found).` : 'Use Funds & Grants Finder to watch for live programs that fit your stage.'
      ],
      outcome: 'You know what to apply for and what documents are missing.'
    });
  }

  if (intents.includes('webinar')) {
    phases.push({
      title: 'Step 3: Learn from webinars',
      timeframe: 'Upcoming sessions',
      actions: [
        counts.webinars ? `Open the recommended webinar section (${counts.webinars} live match${counts.webinars === 1 ? '' : 'es'} found).` : 'Check Webinars for any relevant upcoming sessions.',
        'Register or view details for the session closest to your goal.',
        'Note questions to ask before or after the webinar.'
      ],
      outcome: 'You get low-friction learning before spending on a one-to-one session.'
    });
  }

  if (intents.includes('expert_booking') || counts.experts > 0) {
    phases.push({
      title: 'Step 4: Book targeted expert help',
      timeframe: 'After reviewing resources',
      actions: [
        counts.experts ? `Compare the recommended experts (${counts.experts} live match${counts.experts === 1 ? '' : 'es'} found).` : 'Open Find Experts and search with your refined goal.',
        'Read why each expert was recommended before booking.',
        'Book only the profile whose background matches your exact current blocker.'
      ],
      outcome: 'The session becomes focused and action-oriented instead of generic advice.'
    });
  }

  phases.push({
    title: 'Step 5: Convert guidance into action',
    timeframe: 'Next 7 days',
    actions: [
      'Pick one primary next action from the plan.',
      'Save or open the most useful resource/job/webinar/expert.',
      'Return to Guidcy AI and refine the goal if recommendations feel too broad.'
    ],
    outcome: 'You leave with a practical sequence, not just recommendations.'
  });

  return {
    title: 'Complete Guidcy Guidance Plan',
    objective: `Create a practical path for: ${goal}`,
    suggested_order: phases.map(phase => phase.title),
    phases,
    checklist: [
      'Clarified goal and stage',
      'Relevant notes/resources reviewed',
      'Webinar or learning option checked',
      'Expert shortlisted only after reviewing context',
      intents.includes('job_search') || intents.includes('career_guidance') ? 'Jobs/opportunities saved if relevant' : '',
      intents.includes('funding_grant') ? 'Funding documents and grant eligibility checked' : ''
    ].filter(Boolean),
    success_signal: 'You know the next action, the right resource, and when expert support is actually needed.'
  };
}

function recommendationContext(response) {
  return {
    experts: (response.experts || []).slice(0, 4).map(item => ({ name: item.name, role: item.role, price: item.price, reason: item.reason })),
    notes: (response.notes || []).slice(0, 4).map(item => ({ title: item.title, category: item.category, price: item.price, reason: item.reason })),
    webinars: (response.webinars || []).slice(0, 4).map(item => ({ title: item.title, date: item.date, price: item.price, reason: item.reason })),
    jobs: (response.jobs || []).slice(0, 4).map(item => ({ title: item.title, company: item.company, location: item.location, reason: item.reason })),
    grants: (response.grants || []).slice(0, 4).map(item => ({ title: item.title, provider: item.provider, reason: item.reason }))
  };
}

function guidanceSeed(form, intent, response) {
  const recs = recommendationContext(response);
  const counts = {
    experts: recs.experts.length,
    notes: recs.notes.length,
    webinars: recs.webinars.length,
    jobs: recs.jobs.length,
    grants: recs.grants.length
  };
  return {
    goal: form.goal,
    messages: form.messages,
    safe_profile_context: profileSummary(form.profile_context),
    detected_intents: intent.intents || [],
    understood_summary: intent.summary,
    recommended_next_step: response.recommended_next_step,
    available_live_recommendations: counts,
    live_recommendations: recs
  };
}

function fallbackChatPlan(form, intent, response, missingQuestions) {
  const intents = intent.intents || ['general_guidance'];
  const goal = clean(form.goal, 180);
  const profile = profileSummary(form.profile_context);
  const firstName = profile.name ? profile.name.split(/\s+/)[0] : '';
  const prefix = firstName ? `${firstName}, ` : '';
  if (missingQuestions && missingQuestions.length) {
    return {
      assistant_message: `${prefix}I can create the guidance plan, but I need a little more context so it does not become generic. ${missingQuestions[0]}`,
      needs_more_info: true,
      question_suggestions: missingQuestions,
      plan_ready: false,
      download_title: '',
      ai_used: false
    };
  }
  if (intents.includes('support_issue')) {
    return {
      assistant_message: `${prefix}this looks like a payment or access issue, so the right plan is not to book an expert. I will keep this focused on proof collection, support escalation, and avoiding duplicate payment.`,
      needs_more_info: false,
      question_suggestions: response.support ? response.support.required_details || [] : [],
      plan_ready: true,
      download_title: `Guidcy support plan - ${goal || 'issue'}`,
      ai_used: false
    };
  }
  let lead = 'I built a practical sequence for your goal using live Guidcy recommendations.';
  if (intents.includes('marketplace_notes')) lead = 'For this study-material request, I would start with relevant notes first, then add expert/webinar support only if you still need clarification.';
  else if (intents.includes('funding_grant')) lead = 'For funding, the plan should first sharpen your startup story and documents, then move into grants and founder-facing expert help.';
  else if (intents.includes('career_guidance')) lead = 'For career confusion, the plan should reduce options first, then match learning resources, roles, and experts around the strongest direction.';
  else if (intents.includes('webinar')) lead = 'For a webinar-led goal, the plan should identify the right session, prepare questions, then use expert support only for remaining blockers.';
  return {
    assistant_message: `${prefix}${lead} I also considered ${profile.role ? `your profile role as ${profile.role}` : 'the context you shared'} and kept the next steps action-oriented.`,
    needs_more_info: false,
    question_suggestions: response.follow_up_questions || [],
    plan_ready: true,
    download_title: `Guidcy guidance plan - ${goal || 'goal'}`,
    ai_used: false
  };
}

function sanitizePhase(phase) {
  return {
    title: clean(phase && phase.title || 'Next step', 140),
    timeframe: clean(phase && phase.timeframe || 'Next', 80),
    actions: array(phase && phase.actions).slice(0, 6),
    outcome: clean(phase && phase.outcome || '', 260)
  };
}

function coerceAiPlan(parsed, response, minPhases = 3) {
  const plan = response.guidance_plan || {};
  const gp = safeObject(parsed && parsed.guidance_plan);
  if (!Array.isArray(gp.phases) || !gp.phases.length) return false;
  const aiPhases = gp.phases.slice(0, 6).map(sanitizePhase).filter(phase => phase.title && phase.actions.length);
  const seedPhases = Array.isArray(plan.phases) ? plan.phases.map(sanitizePhase).filter(phase => phase.title && phase.actions.length) : [];
  const seen = new Set(aiPhases.map(phase => low(phase.title)));
  seedPhases.forEach(phase => {
    if (aiPhases.length >= minPhases) return;
    const key = low(phase.title);
    if (!seen.has(key)) {
      aiPhases.push(phase);
      seen.add(key);
    }
  });
  if (aiPhases.length < minPhases) return false;
  response.guidance_plan = {
    title: clean(gp.title || plan.title || 'Complete Guidcy Guidance Plan', 120),
    objective: clean(gp.objective || plan.objective || '', 320),
    phases: aiPhases.slice(0, 6),
    checklist: array(gp.checklist || plan.checklist).slice(0, 10),
    success_signal: clean(gp.success_signal || plan.success_signal || '', 260)
  };
  return response.guidance_plan.phases.length > 0;
}

async function createPlanWithGroq(form, intent, response) {
  const payload = guidanceSeed(form, intent, response);
  const answer = await createChatCompletion([
    {
      role: 'system',
      content: [
        'You are Guidcy AI Driven Guidance, a ChatGPT-like planning assistant inside Guidcy.',
        'Create a fresh, personalized guidance plan for the exact user conversation.',
        'Do not reuse generic step names unless they genuinely fit.',
        'Use the live Guidcy recommendations provided in the payload. Do not invent item IDs or fake listings.',
        'If no live item exists for a category, say what to do next instead of pretending one exists.',
        'If this is a support/payment/access issue, do not recommend random experts, notes, jobs, grants, or webinars.',
        'AI can guide and recommend only. It must not book, pay, refund, approve, delete, or perform admin actions.',
        'Return ONLY valid compact JSON.'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify(payload) + '\nReturn JSON exactly shaped as {"title":"","objective":"","phases":[{"title":"","timeframe":"","actions":[""],"outcome":""}],"checklist":[""],"success_signal":""}. Write 3-6 phases. Make the phase titles and actions specific to this user goal, not boilerplate.'
    }
  ], { maxTokens: 1400, temperature: 0.72 });
  const parsed = parseJson(answer, null);
  if (!parsed || typeof parsed !== 'object') throw new Error('Groq did not return a JSON plan');
  const wrapped = { guidance_plan: parsed };
  if (!coerceAiPlan(wrapped, response, 3)) throw new Error('Groq plan JSON did not contain enough usable phases');
}

async function enrichChatWithGroq(form, intent, response, missingQuestions) {
  const fallback = fallbackChatPlan(form, intent, response, missingQuestions);
  if (missingQuestions && missingQuestions.length) return fallback;
  try {
    const payload = Object.assign({ existing_plan: response.guidance_plan || {} }, guidanceSeed(form, intent, response));
    const answer = await createChatCompletion([
      {
        role: 'system',
        content: 'You are Guidcy AI Driven Guidance, a warm ChatGPT-like guidance planner for the Guidcy website. Return ONLY compact valid JSON. Write a personalized answer and improve the plan wording for the exact user goal. Use live recommendations only as suggestions. Never claim you booked, paid, approved, refunded, deleted, or completed an admin action. If the user has a support/payment issue, guide them to support and do not recommend random experts. Avoid repeated boilerplate.'
      },
      {
        role: 'user',
        content: JSON.stringify(payload) + '\nReturn JSON exactly shaped as {"assistant_message":"conversational response in 2-4 sentences","guidance_plan":{"title":"","objective":"","phases":[{"title":"","timeframe":"","actions":[""],"outcome":""}],"checklist":[""],"success_signal":""},"question_suggestions":["optional follow-up questions"],"download_title":"short filename title"}. Make the plan wording specific and varied. Keep phases 3-6 and actions practical.'
      }
    ], { maxTokens: 1400, temperature: 0.45 });
    const parsed = parseJson(answer, null);
    if (!parsed || typeof parsed !== 'object') return fallback;
    coerceAiPlan(parsed, response, (intent.intents || []).includes('support_issue') ? 2 : 3);
    return {
      assistant_message: clean(parsed.assistant_message || fallback.assistant_message, 900),
      needs_more_info: false,
      question_suggestions: Array.isArray(parsed.question_suggestions) ? parsed.question_suggestions.map(q => clean(q, 160)).filter(Boolean).slice(0, 4) : fallback.question_suggestions,
      plan_ready: true,
      download_title: clean(parsed.download_title || fallback.download_title, 120),
      ai_used: true
    };
  } catch (error) {
    console.warn('Agentic Guidcy chat fallback:', error.message || error);
    return fallback;
  }
}

async function fetchLiveData() {
  const basicQueries = ['select=*&limit=300', 'select=*&order=created_at.desc&limit=300', 'select=*&order=updated_at.desc&limit=300'];
  const [consultants, notes, webinars, jobs, grants] = await Promise.all([
    readTableGroup('consultants', ['consultants'], basicQueries),
    readTableGroup('notes', ['marketplace_notes', 'notes', 'resources'], basicQueries),
    readTableGroup('webinars', ['webinars', 'webinar_events'], basicQueries),
    readTableGroup('jobs', ['job_posts', 'jobs'], basicQueries),
    readTableGroup('grants', ['funding_opportunities', 'grant_opportunities', 'opportunities', 'funds_grants'], basicQueries)
  ]);
  const cleanById = rows => {
    const seen = new Set();
    return rows.filter(row => {
      const key = String(row.id || row.uuid || row.slug || JSON.stringify(row).slice(0, 120));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  return {
    consultants: cleanById(consultants.rows).filter(approvedConsultant),
    notes: cleanById(notes.rows).filter(publicNote),
    webinars: cleanById(webinars.rows).filter(publicWebinar),
    jobs: cleanById(jobs.rows).filter(publicJob),
    grants: cleanById(grants.rows).filter(Boolean),
    diagnostics: {
      consultants: consultants.diagnostics,
      notes: notes.diagnostics,
      webinars: webinars.diagnostics,
      jobs: jobs.diagnostics,
      grants: grants.diagnostics
    }
  };
}

async function insertConversation(form, intent, response) {
  try {
    await supabaseRest('/rest/v1/guidcy_agent_conversations', {
      method: 'POST',
      body: JSON.stringify({
        user_id: normalizeUuid(form.user_id),
        session_id: clean(form.session_id, 160) || null,
        user_message: clean(form.goal, 1200),
        detected_intent: (intent.intents || []).join(','),
        extracted_profile: intent.extracted_profile || {},
        agent_response: response
      })
    });
  } catch (error) {
    console.warn('Agent conversation tracking skipped:', error.message || error);
  }
}

async function trackEvent(body) {
  const itemId = normalizeUuid(body.item_id);
  try {
    await supabaseRest('/rest/v1/guidcy_agent_events', {
      method: 'POST',
      body: JSON.stringify({
        user_id: normalizeUuid(body.user_id),
        session_id: clean(body.session_id, 160) || null,
        goal: clean(body.goal, 1200),
        intent: clean(body.intent, 120),
        event_type: clean(body.event_type, 120) || 'unknown',
        item_type: clean(body.item_type, 80) || null,
        item_id: itemId,
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
      })
    });
    return { ok: true };
  } catch (error) {
    console.warn('Agent event tracking skipped:', error.message || error);
    return { ok: true, skipped: true };
  }
}

async function projectPlan(form, intent, live) {
  const intents = intent.intents || ['general_guidance'];
  const terms = termsFrom(form, intents);
  const expertRank = intents.includes('support_issue') ? [] : rankRows(live.consultants, terms, ['name','full_name','role','specialty','category','bio','about','expertise','skills','tags','current_work','current_company','highest_education','college','languages'], 4);
  const noteRank = intents.includes('support_issue') ? [] : rankRows(live.notes, terms, ['title','name','category','subject','description','tags','exam','course','uploader_name'], 4);
  const webinarRank = intents.includes('support_issue') ? [] : rankRows(live.webinars, terms, ['title','webinar_title','topic','category','description','details','speaker','host_name','presenter'], 4);
  const jobRank = intents.includes('job_search') || intents.includes('career_guidance') ? rankRows(live.jobs, terms, ['title','job_title','company_name','category','description','responsibilities','required_skills','location']) : [];
  const grantRank = intents.includes('funding_grant') ? rankRows(live.grants, terms, ['title','name','category','description','eligibility','provider','organization','tags']) : [];
  const guidancePlan = genericPlanSeed(form, intents, {
    experts: expertRank.length,
    notes: noteRank.length,
    webinars: webinarRank.length,
    jobs: jobRank.length,
    grants: grantRank.length
  });

  const response = {
    ok: true,
    session_id: form.session_id,
    understood: {
      summary: intent.summary,
      intents,
      profile: intent.extracted_profile || {},
      confidence: intent.ai_used ? 'ai-assisted' : 'rule-based'
    },
    recommended_next_step: nextStep(intents),
    guidance_plan: guidancePlan,
    experts: expertRank.slice(0, 4).map(item => ({
      id: item.row.id,
      name: item.row.name || item.row.full_name || 'Guidcy Expert',
      role: item.row.role || item.row.specialty || item.row.category || item.row.current_work || 'Consultant',
      price: Number(item.row.price || item.row.rate || item.row.session_price || item.row.video_price || item.row.consultation_fee || 0) || 0,
      rating: item.row.rating || '',
      avatar_url: item.row.avatar_url || item.row.photo_url || item.row.image_url || '',
      reason: consultantReason(item.row, form, item.hits),
      action: { view: `/consultant/${item.row.id}`, book: `/book/${item.row.id}` }
    })),
    notes: noteRank.slice(0, intents.includes('marketplace_notes') ? 5 : 3).map(item => ({
      id: item.row.id,
      title: item.row.title || item.row.name || 'Guidcy Notes',
      category: item.row.category || item.row.subject || '',
      price: Number(item.row.price || item.row.amount || 0) || 0,
      preview_pages: item.row.preview_pages || item.row.preview_page_count || '',
      reason: itemReason(item.row, 'note', form, item.hits),
      action: { view: `/marketplace?note=${item.row.id}` }
    })),
    webinars: webinarRank.slice(0, intents.includes('webinar') ? 5 : 3).map(item => ({
      id: item.row.id || item.row.webinar_id,
      title: item.row.title || item.row.webinar_title || item.row.name || 'Guidcy Webinar',
      date: item.row.date || item.row.webinar_date || item.row.session_date || item.row.start_time || item.row.starts_at || '',
      time: item.row.time || item.row.webinar_time || item.row.session_time || '',
      price: Number(item.row.price_amount || item.row.price || item.row.amount || 0) || 0,
      reason: itemReason(item.row, 'webinar', form, item.hits),
      action: { view: `/webinars?webinar=${item.row.id || item.row.webinar_id}` }
    })),
    jobs: jobRank.slice(0, 4).map(item => ({
      id: item.row.id,
      title: item.row.title || item.row.job_title || 'Guidcy Job',
      company: item.row.company_name || item.row.company || item.row.employer_name || '',
      location: item.row.location || item.row.work_mode || '',
      reason: itemReason(item.row, 'job', form, item.hits),
      action: { view: '/find-jobs' }
    })),
    grants: grantRank.slice(0, 4).map(item => ({
      id: item.row.id,
      title: item.row.title || item.row.name || 'Funding opportunity',
      provider: item.row.provider || item.row.organization || item.row.company || '',
      reason: itemReason(item.row, 'grant', form, item.hits),
      action: { view: '/funds-grants' }
    })),
    follow_up_questions: intent.follow_up_questions || []
  };

  if (LIVE_DEBUG) {
    response.live_debug = {
      fetched: {
        consultants: live.consultants.length,
        notes: live.notes.length,
        webinars: live.webinars.length,
        jobs: live.jobs.length,
        grants: live.grants.length
      },
      ranked: {
        experts: expertRank.length,
        notes: noteRank.length,
        webinars: webinarRank.length,
        jobs: jobRank.length,
        grants: grantRank.length
      },
      diagnostics: live.diagnostics || {}
    };
  }

  if (intents.includes('support_issue')) {
    response.support = {
      title: 'Support flow recommended',
      message: 'This looks like a payment or access issue. Guidcy AI will guide you to support instead of recommending random experts.',
      required_details: ['Registered email', 'Transaction ID or order ID', 'Whether it was notes, webinar, or consultant booking']
    };
  }
  if (form.mode === 'chat_guidance') {
    const missingQuestions = isBroadRequest(form, form.messages, form.profile_context)
      ? [
          'What outcome do you want in the next 30 days?',
          'Are you looking for learning material, expert help, opportunities, or support?',
          'What is your current stage or background?'
        ]
      : [];
    const chat = await enrichChatWithGroq(form, intent, response, missingQuestions);
    response.assistant_message = chat.assistant_message;
    response.needs_more_info = chat.needs_more_info;
    response.question_suggestions = chat.question_suggestions || [];
    response.plan_ready = chat.plan_ready;
    response.download_title = chat.download_title || (response.guidance_plan && response.guidance_plan.title) || 'Guidcy guidance plan';
    if (chat.ai_used) response.understood.confidence = 'ai-assisted';
    if (chat.needs_more_info) {
      response.follow_up_questions = response.question_suggestions;
    }
  } else {
    response.assistant_message = response.understood.summary;
    response.needs_more_info = false;
    response.question_suggestions = response.follow_up_questions || [];
    response.plan_ready = true;
    response.download_title = response.guidance_plan && response.guidance_plan.title;
  }
  return response;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    if (body.action === 'track' || body.event_type) return json(res, 200, await trackEvent(body));
    const form = {
      goal: clean(body.goal || body.query || body.question || '', 1200),
      messages: safeMessages(body.messages),
      stage: clean(body.stage || '', 120),
      budget: clean(body.budget || '', 120),
      language: clean(body.language || '', 120),
      urgency: clean(body.urgency || '', 120),
      sector: clean(body.sector || '', 120),
      profile_context: profileSummary(body.profile_context),
      mode: clean(body.mode || '', 40),
      user_id: normalizeUuid(body.user_id),
      session_id: clean(body.session_id || `guidcy-agent-${Date.now()}`, 160)
    };
    if (!form.goal && form.messages.length) form.goal = conversationGoal(form.messages, '');
    if (!form.goal) return json(res, 200, { ok: false, error: 'Please share your goal first.' });
    const [intent, live] = await Promise.all([inferWithGroq(form), fetchLiveData()]);
    const response = await projectPlan(form, intent, live);
    await Promise.all([
      insertConversation(form, intent, response),
      trackEvent({ user_id: form.user_id, session_id: form.session_id, goal: form.goal, intent: (intent.intents || []).join(','), event_type: 'create_guidance_plan', metadata: { stage: form.stage, budget: form.budget, language: form.language, urgency: form.urgency, sector: form.sector } })
    ]);
    return json(res, 200, response);
  } catch (error) {
    console.error('Agentic Guidcy error:', error);
    return json(res, 200, {
      ok: false,
      error: 'Guidcy AI is temporarily unavailable. Please try again.',
      understood: { summary: '', intents: ['general_guidance'], profile: {}, confidence: 'fallback' },
      recommended_next_step: nextStep(['general_guidance']),
      experts: [],
      notes: [],
      webinars: [],
      jobs: [],
      grants: [],
      follow_up_questions: ['Can you share your goal in one sentence?']
    });
  }
};
