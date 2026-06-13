/**
 * POST /api/rescore
 * Re-calculates match score for ALL jobs based on current Airtable Preferences.
 * Runs in batches of 10 updates. Returns { updated, skipped, errors }.
 *
 * Trigger manually: curl -X POST https://your-app.vercel.app/api/rescore
 * Or add a button in the UI that calls fetch('/api/rescore', { method: 'POST' })
 */

const BASE_ID      = process.env.AIRTABLE_BASE_ID  || 'app6LoOGhyUKDhp5p';
const JOBS_TABLE   = process.env.AIRTABLE_TABLE_ID  || 'tblgMYxZWOnJAODDX';
const PREFS_TABLE  = 'tblPRl3eSfiokDsFz';
const AT_KEY       = process.env.AIRTABLE_API_KEY;
const AT_BASE      = `https://api.airtable.com/v0/${BASE_ID}`;

function atHeaders() {
  return { Authorization: `Bearer ${AT_KEY}`, 'Content-Type': 'application/json' };
}

// ── Fetch all preferences as key→value map ─────────────────
async function getPrefs() {
  const r    = await fetch(`${AT_BASE}/${PREFS_TABLE}?pageSize=100`, { headers: atHeaders() });
  const data = await r.json();
  const map  = {};
  for (const rec of (data.records || [])) {
    map[rec.fields?.['Key']] = rec.fields?.['Value'] || '';
  }
  return map;
}

// ── Fetch all job records ───────────────────────────────────
async function getAllJobs() {
  const url = `${AT_BASE}/${JOBS_TABLE}`;
  let records = [], offset;
  do {
    const qs  = new URLSearchParams({ pageSize: '100' });
    if (offset) qs.set('offset', offset);
    const r   = await fetch(`${url}?${qs}`, { headers: atHeaders() });
    const d   = await r.json();
    records   = records.concat(d.records || []);
    offset    = d.offset;
  } while (offset);
  return records;
}

// ── Core scoring algorithm ──────────────────────────────────
function scoreJob(fields, prefs) {
  // Load weights from preferences (fallback to defaults)
  let weights = { location: 40, role_level: 15, domain: 15, company: 10, salary: 10, source: 5, specificity: 5 };
  try { Object.assign(weights, JSON.parse(prefs.score_weights || '{}')); } catch(e) {}

  // Target lists
  let targetLocs = ['bengaluru','bangalore','mumbai','remote'];
  let targetIndustries = ['ai','llm','fintech','saas','payment'];
  try { targetLocs       = JSON.parse(prefs.target_locations || '[]').map(l => l.toLowerCase()); } catch(e) {}
  try { targetIndustries = JSON.parse(prefs.target_industries || '[]').map(i => i.toLowerCase()); } catch(e) {}

  const loc    = (fields['Location']    || '').toLowerCase();
  const role   = (fields['Role']        || '').toLowerCase();
  const co     = (fields['Company']     || '').toLowerCase();
  const src    = (fields['Source']?.name || fields['Source'] || '').toLowerCase();
  const notes  = (fields['Notes']       || '').toLowerCase();
  const corpus = `${co} ${role} ${notes}`;

  // 1. Location (40 pts)
  let locScore = 0;
  if (!loc) {
    locScore = Math.round(weights.location * 0.5); // unknown
  } else if (targetLocs.some(t => loc.includes(t))) {
    // Rank by preference order
    if (loc.includes('bengaluru') || loc.includes('bangalore')) locScore = weights.location;
    else if (loc.includes('mumbai'))                             locScore = Math.round(weights.location * 0.8);
    else if (loc.includes('remote'))                             locScore = Math.round(weights.location * 0.7);
    else                                                         locScore = Math.round(weights.location * 0.6);
  } else if (loc.includes('hyderabad'))                         locScore = Math.round(weights.location * 0.55);
  else if (loc.includes('gurgaon') || loc.includes('gurugram')) locScore = Math.round(weights.location * 0.45);
  else                                                           locScore = Math.round(weights.location * 0.3);

  // 2. Role level (15 pts)
  let roleScore = 0;
  if (role.includes('principal') || role.includes('staff') || role.includes('vp') || role.includes('director')) {
    roleScore = weights.role_level; // senior band
  } else if (role.includes('senior') || role.includes('sr.') || role.includes('lead')) {
    roleScore = weights.role_level;
  } else if (role.includes('pm 2') || role.includes('pm2') || role.includes('pm ii') || role.includes('product manager 2')) {
    roleScore = Math.round(weights.role_level * 0.9);
  } else if (role.includes('product manager') || role.includes('product owner')) {
    roleScore = Math.round(weights.role_level * 0.75);
  } else {
    roleScore = Math.round(weights.role_level * 0.5);
  }

  // 3. Domain match (15 pts)
  let domainScore = 0;
  const aiTerms     = ['ai', 'llm', 'genai', 'genaitive', 'generative', 'agentic', 'machine learning', 'ml', 'nlp', 'conversational'];
  const fintechTerms = ['fintech', 'payment', 'finance', 'banking', 'lending', 'wealth', 'insurance', 'crypto', 'neobank'];
  const saasTerms   = ['saas', 'b2b', 'platform', 'enterprise', 'api', 'workflow', 'automation'];
  const consumerTerms = ['consumer', 'growth', 'mobile', 'edtech', 'healthtech', 'd2c'];

  if (aiTerms.some(t => corpus.includes(t)))       domainScore = weights.domain;
  else if (fintechTerms.some(t => corpus.includes(t))) domainScore = Math.round(weights.domain * 0.87);
  else if (saasTerms.some(t => corpus.includes(t)))    domainScore = Math.round(weights.domain * 0.7);
  else if (consumerTerms.some(t => corpus.includes(t))) domainScore = Math.round(weights.domain * 0.65);
  else                                                   domainScore = Math.round(weights.domain * 0.4);

  // 4. Company tier (10 pts)
  const tier1 = ['amazon','google','microsoft','meta','jpmorgan','jp morgan','american express','wells fargo','sprinklr','docusign','uipath','razorpay','paytm','swiggy','zomato','flipkart','cred','zepto'];
  const tier2 = ['whatfix','moengage','freshworks','chargebee','postman','browserstack','lenskart','healthifyme','leap finance','harness','glean','aspire','habuild','nanonets','onetrust','merge money','univest','niyo'];
  let companyScore = 0;
  if (tier1.some(t => co.includes(t)))   companyScore = weights.company;
  else if (tier2.some(t => co.includes(t))) companyScore = Math.round(weights.company * 0.7);
  else                                   companyScore = Math.round(weights.company * 0.4);

  // 5. Salary fit (10 pts) — assume in range unless explicitly excluded
  const salaryScore = Math.round(weights.salary * 0.8);

  // 6. Source quality (5 pts)
  let srcScore = 0;
  if (src === 'direct' || src === 'linkedin' || src === 'referral') srcScore = weights.source;
  else if (src === 'indeed')                                        srcScore = Math.round(weights.source * 0.8);
  else                                                              srcScore = Math.round(weights.source * 0.6);

  // 7. Role specificity (5 pts) — named domain area = better
  let specScore = 0;
  const specTerms = ['ai','growth','payments','platform','data','mobile','api','analytics','search','recommendation'];
  if (specTerms.some(t => role.includes(t)))   specScore = weights.specificity;
  else if (role.includes('product manager'))   specScore = Math.round(weights.specificity * 0.6);
  else                                         specScore = Math.round(weights.specificity * 0.4);

  const total = locScore + roleScore + domainScore + companyScore + salaryScore + srcScore + specScore;
  return Math.min(100, Math.max(0, total));
}

// ── Batch update Airtable (max 10 per request to stay safe) ─
async function batchUpdate(updates) {
  const url    = `${AT_BASE}/${JOBS_TABLE}`;
  const chunks = [];
  for (let i = 0; i < updates.length; i += 10) chunks.push(updates.slice(i, i + 10));

  let errors = 0;
  for (const chunk of chunks) {
    const r = await fetch(url, {
      method: 'PATCH',
      headers: atHeaders(),
      body: JSON.stringify({
        records: chunk.map(u => ({ id: u.id, fields: { 'Match Score': u.score } })),
      }),
    });
    if (!r.ok) { console.error('Batch update failed:', await r.text()); errors += chunk.length; }
  }
  return errors;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'POST only' });
  if (!AT_KEY)                  return res.status(500).json({ error: 'AIRTABLE_API_KEY not configured' });

  try {
    const [prefs, jobs] = await Promise.all([getPrefs(), getAllJobs()]);

    const updates  = [];
    let   skipped  = 0;
    let   unchanged = 0;

    for (const job of jobs) {
      const f      = job.fields || {};
      const status = f['Status']?.name || f['Status'] || '';
      // Don't touch Rejected/Withdrawn scores
      if (status === 'Rejected' || status === 'Withdrawn') { skipped++; continue; }

      const newScore = scoreJob(f, prefs);
      const oldScore = f['Match Score'] || 0;

      if (newScore === oldScore) { unchanged++; continue; }
      updates.push({ id: job.id, score: newScore });
    }

    const errors = await batchUpdate(updates);

    res.status(200).json({
      updated:   updates.length - errors,
      unchanged: unchanged,
      skipped:   skipped,
      errors:    errors,
      total:     jobs.length,
    });
  } catch (err) {
    console.error('[api/rescore]', err.message);
    res.status(500).json({ error: err.message });
  }
};
