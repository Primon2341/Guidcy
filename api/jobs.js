module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end(JSON.stringify({ error: 'Method not allowed' }));

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    return res.status(500).end(JSON.stringify({
      error: 'Missing RAPIDAPI_KEY environment variable. Add it in Vercel Project Settings → Environment Variables, then redeploy.'
    }));
  }

  const q = String(req.query.q || '').trim();
  const location = String(req.query.location || 'India').trim();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const datePosted = String(req.query.date_posted || 'all').trim();
  const employmentTypes = String(req.query.employment_types || '').trim();
  const remoteJobsOnly = String(req.query.remote_jobs_only || '').trim();

  if (!q) return res.status(400).end(JSON.stringify({ error: 'Search query is required.' }));

  const blocked = ['casino','gambling','betting','weapon','gun','firearm','ammo','knife','tobacco','vape','nicotine','alcohol','liquor','porn','adult entertainment','cannabis','marijuana','weed','thc'];
  const qLower = q.toLowerCase();
  if (blocked.some((term) => qLower.includes(term))) {
    return res.status(400).end(JSON.stringify({ error: 'This job search category is not supported on Guidcy.' }));
  }

  const params = new URLSearchParams({
    query: `${q} in ${location}`,
    page: String(page),
    num_pages: '1',
    country: 'in',
    date_posted: datePosted
  });

  if (employmentTypes) params.set('employment_types', employmentTypes);
  if (remoteJobsOnly === 'true') params.set('remote_jobs_only', 'true');

  try {
    const response = await fetch(`https://jsearch.p.rapidapi.com/search?${params.toString()}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      }
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      return res.status(502).end(JSON.stringify({
        error: 'RapidAPI returned a non-JSON response.',
        detail: text.slice(0, 300)
      }));
    }

    if (!response.ok) {
      return res.status(response.status).end(JSON.stringify({
        error: payload.message || payload.error || 'Job API request failed.',
        detail: payload
      }));
    }

    const jobs = (payload.data || []).map((job) => {
      const applyLink =
        job.job_apply_link ||
        job.job_google_link ||
        (Array.isArray(job.apply_options) && job.apply_options[0] ? job.apply_options[0].apply_link : '') ||
        '';

      return {
        id: job.job_id || `${job.employer_name || ''}-${job.job_title || ''}-${job.job_city || ''}`,
        title: job.job_title || 'Job opening',
        company: job.employer_name || 'Company not specified',
        location: [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', ') || job.job_location || location,
        employmentType: Array.isArray(job.job_employment_types) ? job.job_employment_types.join(', ') : (job.job_employment_type || ''),
        postedAt: job.job_posted_at_datetime_utc || job.job_posted_at_timestamp || job.job_posted_at || '',
        description: job.job_description || '',
        source: job.job_publisher || job.job_source || 'Original website',
        applyLink,
        salary: job.job_min_salary && job.job_max_salary
          ? `${job.job_salary_currency || ''} ${job.job_min_salary} - ${job.job_max_salary}`
          : (job.job_salary || '')
      };
    });

    return res.status(200).end(JSON.stringify({ jobs, page, total: jobs.length }));
  } catch (error) {
    return res.status(500).end(JSON.stringify({ error: 'Server error while fetching jobs.', detail: error.message }));
  }
};
