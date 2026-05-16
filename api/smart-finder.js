// Vercel Serverless Function: /api/smart-finder
// Purpose: Smart Finder recommendations using OpenAI.
// Security: Keep OPENAI_API_KEY only in Vercel Environment Variables.
// Never expose the key in index.html or any frontend JavaScript.

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function safeText(value, maxLength = 3000) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, maxLength);
}

function buildPrompt(mode, profile) {
  const cleanedProfile = Object.fromEntries(
    Object.entries(profile || {}).map(([key, value]) => [safeText(key, 80), safeText(value, 1200)])
  );

  if (mode === 'education') {
    return `You are Guidcy Smart Finder, an expert education counsellor for Indian and international students.
Return only valid JSON. No markdown. No explanation outside JSON.

Student profile:
${JSON.stringify(cleanedProfile, null, 2)}

Create a practical recommendation response using this exact JSON schema:
{
  "summary": "short personalised assessment",
  "programs": [
    {
      "category": "Safe Pick | Good Fit | Stretch Goal",
      "name": "program/course name",
      "institution": "college/university/provider",
      "location": "city/country or online",
      "duration": "duration",
      "fees": "estimated fee range or N/A",
      "eligibility": "eligibility requirements",
      "entranceRequired": "exam/score requirement or Not mandatory",
      "deadline": "application timeline/deadline if generally known, otherwise Check official website",
      "whyFit": "why this is suitable for the user",
      "admissionTips": ["specific tip 1", "specific tip 2"],
      "applyLink": "official homepage URL or search URL"
    }
  ],
  "actionPlan": ["step 1", "step 2", "step 3"],
  "scholarships": ["scholarship/funding option 1", "scholarship/funding option 2"],
  "warnings": ["important caution 1"]
}

Rules:
- Give 6 to 8 programs.
- Be realistic for score, budget, destination, and field.
- Prefer official institution links where you are confident; otherwise use a safe search URL.
- Do not invent precise deadlines; say Check official website when uncertain.`;
  }

  return `You are Guidcy Smart Finder, an expert career advisor for India-focused job seekers.
Return only valid JSON. No markdown. No explanation outside JSON.

Candidate profile:
${JSON.stringify(cleanedProfile, null, 2)}

Create a practical recommendation response using this exact JSON schema:
{
  "summary": "short personalised assessment",
  "jobs": [
    {
      "category": "Safe Pick | Good Fit | Stretch Goal",
      "title": "job title",
      "company": "company type or example company",
      "location": "city/remote/hybrid",
      "salary": "estimated salary range or N/A",
      "jobType": "Full-time/Internship/Remote/etc.",
      "whyFit": "why this matches the user profile",
      "skillsToImprove": ["skill 1", "skill 2"],
      "applyLink": "official careers page URL or search URL"
    }
  ],
  "actionPlan": ["step 1", "step 2", "step 3"],
  "skillGaps": ["gap 1", "gap 2"],
  "warnings": ["important caution 1"]
}

Rules:
- Give 6 to 8 job recommendations.
- Be realistic for experience, skills, location, and salary.
- Do not claim live job availability unless you have an official URL.
- Prefer official career pages where you are confident; otherwise use a safe search URL.`;
}

function extractJsonText(openAiData) {
  if (typeof openAiData.output_text === 'string' && openAiData.output_text.trim()) {
    return openAiData.output_text.trim();
  }

  const chunks = [];
  for (const item of openAiData.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
      if (content.type === 'text' && content.text) chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

function normaliseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '#';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
}

function normaliseResponse(mode, data) {
  const output = data && typeof data === 'object' ? data : {};

  if (mode === 'education') {
    output.programs = Array.isArray(output.programs) ? output.programs.slice(0, 8) : [];
    output.programs = output.programs.map((program) => ({
      category: safeText(program.category || 'Good Fit', 40),
      name: safeText(program.name || 'Program recommendation', 160),
      institution: safeText(program.institution || 'Institution', 160),
      location: safeText(program.location || 'N/A', 120),
      duration: safeText(program.duration || 'N/A', 80),
      fees: safeText(program.fees || 'N/A', 100),
      eligibility: safeText(program.eligibility || 'Check official website', 300),
      entranceRequired: safeText(program.entranceRequired || 'Check official website', 160),
      deadline: safeText(program.deadline || 'Check official website', 120),
      whyFit: safeText(program.whyFit || '', 500),
      admissionTips: Array.isArray(program.admissionTips) ? program.admissionTips.map((x) => safeText(x, 220)).slice(0, 5) : [],
      applyLink: normaliseUrl(program.applyLink || `${program.name || ''} ${program.institution || ''} official admissions`)
    }));
    output.actionPlan = Array.isArray(output.actionPlan) ? output.actionPlan.map((x) => safeText(x, 240)).slice(0, 6) : [];
    output.scholarships = Array.isArray(output.scholarships) ? output.scholarships.map((x) => safeText(x, 220)).slice(0, 6) : [];
  } else {
    output.jobs = Array.isArray(output.jobs) ? output.jobs.slice(0, 8) : [];
    output.jobs = output.jobs.map((job) => ({
      category: safeText(job.category || 'Good Fit', 40),
      title: safeText(job.title || 'Job recommendation', 160),
      company: safeText(job.company || 'Relevant employer', 160),
      location: safeText(job.location || 'N/A', 120),
      salary: safeText(job.salary || 'N/A', 100),
      jobType: safeText(job.jobType || 'Full-time', 80),
      whyFit: safeText(job.whyFit || '', 500),
      skillsToImprove: Array.isArray(job.skillsToImprove) ? job.skillsToImprove.map((x) => safeText(x, 120)).slice(0, 5) : [],
      applyLink: normaliseUrl(job.applyLink || `${job.title || ''} ${job.company || ''} careers`)
    }));
    output.actionPlan = Array.isArray(output.actionPlan) ? output.actionPlan.map((x) => safeText(x, 240)).slice(0, 6) : [];
    output.skillGaps = Array.isArray(output.skillGaps) ? output.skillGaps.map((x) => safeText(x, 160)).slice(0, 6) : [];
  }

  output.summary = safeText(output.summary || 'Here are your personalised Smart Finder recommendations.', 800);
  output.warnings = Array.isArray(output.warnings) ? output.warnings.map((x) => safeText(x, 220)).slice(0, 5) : [];
  return output;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return sendJson(res, 500, { error: 'OPENAI_API_KEY is missing. Add it in Vercel Environment Variables and redeploy.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const mode = body.mode === 'education' ? 'education' : 'jobs';
    const profile = body.profile && typeof body.profile === 'object' ? body.profile : {};

    const prompt = buildPrompt(mode, profile);

    const openAiResponse = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt,
        temperature: 0.4,
        max_output_tokens: 4500,
        text: {
          format: { type: 'json_object' }
        }
      })
    });

    const raw = await openAiResponse.text();
    let openAiData;
    try {
      openAiData = JSON.parse(raw);
    } catch (_) {
      openAiData = { raw };
    }

    if (!openAiResponse.ok) {
      const message = openAiData?.error?.message || `OpenAI request failed with status ${openAiResponse.status}`;
      return sendJson(res, openAiResponse.status, { error: message });
    }

    const text = extractJsonText(openAiData);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      return sendJson(res, 502, { error: 'OpenAI returned invalid JSON. Please try again.' });
    }

    return sendJson(res, 200, normaliseResponse(mode, parsed));
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Smart Finder failed. Please try again.' });
  }
}
