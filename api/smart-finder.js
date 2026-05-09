/* ─────────────────────────────────────────────────────────────────
   Guidcy Smart Finder API  —  /api/smart-finder
   Uses Groq (FREE) — console.groq.com → API Keys (no card needed)

   ENV vars needed:
     GROQ_API_KEY    (free at console.groq.com)
     RAPIDAPI_KEY    (for live job listings)
─────────────────────────────────────────────────────────────────── */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).end(JSON.stringify({ error: 'Method not allowed' }));

  const GROQ_KEY     = process.env.GROQ_API_KEY;
  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

  if (!GROQ_KEY)
    return res.status(500).end(JSON.stringify({
      error: 'GROQ_API_KEY not set. Sign up free at console.groq.com → API Keys → create a key → add it in Vercel Project Settings → Environment Variables as GROQ_API_KEY.'
    }));

  let body;
  try { body = typeof req.body === 'object' ? req.body : JSON.parse(req.body); }
  catch (_) { return res.status(400).end(JSON.stringify({ error: 'Invalid JSON body' })); }

  const { mode, profile } = body;
  if (!mode || !profile)
    return res.status(400).end(JSON.stringify({ error: '"mode" and "profile" are required' }));

  /* ── Groq helper (OpenAI-compatible, free) ─────────────────── */
  async function callGroq(systemMsg, userMsg, maxTokens = 2000) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: maxTokens,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user',   content: userMsg   }
        ]
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'Groq API error');
    return d.choices?.[0]?.message?.content || '';
  }

  /* ── Parse JSON from LLM response ─────────────────────────── */
  function parseJSON(text) {
    const clean = text.replace(/```json|```/gi, '').trim();
    const arrIdx = clean.indexOf('['), objIdx = clean.indexOf('{');
    const isArr  = arrIdx !== -1 && (objIdx === -1 || arrIdx < objIdx);
    const start  = isArr ? arrIdx : objIdx;
    const end    = isArr ? clean.lastIndexOf(']') : clean.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON in response');
    return JSON.parse(clean.slice(start, end + 1));
  }

  /* ── JSearch live jobs ─────────────────────────────────────── */
  async function searchJobs(query, location = 'India', pages = 2) {
    if (!RAPIDAPI_KEY) return [];
    const all = [];
    for (let pg = 1; pg <= pages; pg++) {
      try {
        const params = new URLSearchParams({
          query: `${query} in ${location}`, page: String(pg),
          num_pages: '1', country: 'in', date_posted: 'month'
        });
        const r = await fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
          headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' }
        });
        const d = await r.json();
        (d.data || []).forEach(j => all.push({
          title:          j.job_title || '',
          company:        j.employer_name || '',
          location:       [j.job_city, j.job_state].filter(Boolean).join(', ') || location,
          employmentType: (Array.isArray(j.job_employment_types) ? j.job_employment_types[0] : j.job_employment_type) || '',
          description:    (j.job_description || '').slice(0, 400),
          applyLink:      j.job_apply_link || j.job_google_link || '',
          postedAt:       j.job_posted_at_datetime_utc || '',
          salary:         j.job_min_salary && j.job_max_salary
                            ? `${j.job_salary_currency || 'INR'} ${j.job_min_salary}–${j.job_max_salary}` : '',
          source:         j.job_publisher || ''
        }));
      } catch (_) {}
    }
    const seen = new Set();
    return all.filter(j => {
      const k = `${j.title}-${j.company}`.toLowerCase();
      if (seen.has(k)) return false; seen.add(k); return true;
    });
  }

  /* ════════════════════════════════════════════════════════════
     JOBS MODE
  ════════════════════════════════════════════════════════════ */
  if (mode === 'jobs') {
    const p = profile;
    const profileText = [
      `Current/Last role: ${p.currentRole || 'N/A'}`,
      `Years of experience: ${p.experience || '0'}`,
      `Skills: ${p.skills || 'N/A'}`,
      `Degree: ${p.degree || 'N/A'} in ${p.fieldOfStudy || 'N/A'}`,
      `College: ${p.college || 'N/A'}`,
      `Job type: ${p.jobType || 'Full-time'}`,
      `Location preference: ${p.location || 'India'}`,
      `Industry preference: ${p.industry || 'Any'}`,
      `Expected salary: ${p.salary || 'N/A'}`,
      `Certifications: ${p.certifications || 'None'}`,
      `Languages: ${p.languages || 'N/A'}`,
      `Career goal: ${p.careerGoal || 'N/A'}`
    ].join('\n');

    /* Step 1 — generate targeted search queries */
    let queries = ['professional jobs India', 'engineer India', 'executive jobs India'];
    try {
      const raw = await callGroq(
        'You are a career expert. Return ONLY a valid JSON array of strings. No explanation, no markdown.',
        `Generate exactly 3 highly specific job search queries (4-8 words each) to find the most relevant openings for this candidate:\n\n${profileText}\n\nReturn ONLY a JSON array of 3 strings like: ["Senior React Developer Bangalore","Frontend Engineer fintech India","Full Stack JavaScript remote"]`,
        250
      );
      const parsed = parseJSON(raw);
      if (Array.isArray(parsed) && parsed.length) queries = parsed.slice(0, 3);
    } catch (_) {}

    /* Step 2 — fetch live jobs */
    const loc = (p.location && p.location.toLowerCase() !== 'any') ? p.location : 'India';
    const rawJobs = [];
    for (const q of queries) rawJobs.push(...await searchJobs(q, loc));
    const seen = new Set();
    const allJobs = rawJobs.filter(j => {
      const k = `${j.title}-${j.company}`.toLowerCase();
      if (seen.has(k)) return false; seen.add(k); return true;
    }).slice(0, 30);

    /* Step 3 — rank, score, explain */
    let rankedJobs = allJobs.slice(0, 8), aiSummary = '', topTips = [];

    if (allJobs.length > 0) {
      try {
        const raw = await callGroq(
          'You are a career counsellor. Return ONLY valid JSON. No markdown, no explanation.',
          `Score each job 1-100 for fit with this candidate and write a specific "whyFit" explanation.

CANDIDATE:
${profileText}

JOBS:
${allJobs.slice(0, 20).map((j, i) => `[${i}] ${j.title} at ${j.company} (${j.location}): ${j.description.slice(0, 150)}`).join('\n')}

Return ONLY this JSON:
{"jobs":[{"index":0,"score":85,"whyFit":"1-2 sentences specific to THIS candidate"}],"summary":"2-sentence personalised job search strategy","tips":["specific actionable tip","tip 2","tip 3"]}
Include top 8 jobs by score.`,
          1500
        );
        const parsed = parseJSON(raw);
        if (parsed.jobs && Array.isArray(parsed.jobs)) {
          rankedJobs = parsed.jobs
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 8)
            .map(r => ({ ...allJobs[r.index], score: r.score, whyFit: r.whyFit }))
            .filter(j => j && j.title);
        }
        if (parsed.summary) aiSummary = parsed.summary;
        if (Array.isArray(parsed.tips)) topTips = parsed.tips.slice(0, 3);
      } catch (_) {}
    } else {
      /* Groq fallback — generate from knowledge */
      try {
        const raw = await callGroq(
          'You are a career expert. Return ONLY a valid JSON array. No markdown.',
          `Generate 6 realistic job recommendations for this candidate. Return ONLY a JSON array:\n[{"title":"...","company":"...","location":"...","employmentType":"Full-time","description":"...","applyLink":"https://linkedin.com/jobs","salary":"","score":85,"whyFit":"2 sentences specific to this candidate"}]\n\n${profileText}`,
          1200
        );
        rankedJobs = parseJSON(raw).slice(0, 6);
      } catch (_) {}
      try {
        const raw = await callGroq(
          'Career advisor. Return ONLY valid JSON.',
          `Job search strategy and tips for:\n${profileText}\nReturn: {"summary":"2 sentences","tips":["tip1","tip2","tip3"]}`,
          350
        );
        const p2 = parseJSON(raw);
        aiSummary = p2.summary || ''; topTips = p2.tips || [];
      } catch (_) {}
    }

    return res.status(200).end(JSON.stringify({
      mode: 'jobs', queries, totalFound: allJobs.length,
      jobs: rankedJobs, summary: aiSummary, tips: topTips
    }));
  }

  /* ════════════════════════════════════════════════════════════
     EDUCATION MODE
  ════════════════════════════════════════════════════════════ */
  if (mode === 'education') {
    const p = profile;
    let result;
    try {
      const raw = await callGroq(
        'You are an expert academic counsellor with deep knowledge of Indian and international universities, programs, eligibility criteria, fees, and admission processes. Always use real institution names and accurate information. Return ONLY valid JSON. No markdown, no explanation.',
        `Analyse this student's profile and provide personalised program recommendations.

STUDENT PROFILE:
- Current qualification: ${p.qualification || 'N/A'}
- Score/CGPA/Percentage: ${p.score || 'N/A'}
- Stream/Subjects: ${p.stream || 'N/A'}
- Field of interest: ${p.fieldOfInterest || 'N/A'}
- Career goal: ${p.careerGoal || 'N/A'}
- Study destination: ${p.destination || 'India'}
- Budget per year: ${p.budget || 'N/A'}
- Course duration preference: ${p.duration || 'Any'}
- Entrance exam scores: ${p.entranceScores || 'None'}
- Extracurriculars/achievements: ${p.extracurriculars || 'None'}
- Work experience: ${p.workExperience || 'None'}
- Financial aid needed: ${p.financialAid || 'No'}

Return ONLY this JSON structure:
{
  "summary": "2-3 sentence personalised assessment of this student's profile and realistic prospects",
  "programs": [
    {
      "name": "Exact program name",
      "institution": "Real institution name",
      "location": "City, Country",
      "duration": "e.g. 4 years",
      "fees": "e.g. Rs 2-4 Lakh/year",
      "category": "Safe Pick",
      "eligibility": "Specific eligibility for this student",
      "entranceRequired": "e.g. JEE Main / Direct / CAT 70%ile / IELTS 6.5",
      "whyFit": "2 sentences explaining why this fits THIS student specifically",
      "admissionTips": ["specific tip 1", "tip 2", "tip 3"],
      "applyLink": "https://official-website.edu",
      "deadline": "e.g. January 2026"
    }
  ],
  "actionPlan": ["Step to take this week", "Step 2 this month", "Step 3 in 3 months", "Step 4 before deadline"],
  "warnings": ["Important concern this student must be aware of"],
  "scholarships": ["Scholarship name: brief description and who it is for"]
}

Include 6-8 programs mixing Safe Pick, Good Fit, and Stretch Goal categories. Be specific with real universities and accurate requirements.`,
        3000
      );
      result = parseJSON(raw);
    } catch (e) {
      return res.status(500).end(JSON.stringify({
        error: 'Could not generate recommendations — please try again in a moment.',
        detail: e.message
      }));
    }

    return res.status(200).end(JSON.stringify({ mode: 'education', ...result }));
  }

  return res.status(400).end(JSON.stringify({ error: 'mode must be "jobs" or "education"' }));
};
