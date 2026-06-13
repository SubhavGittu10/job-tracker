/**
 * GET /api/jobs
 * Fetches all records from Airtable and returns them in frontend-friendly shape.
 */

const BASE_ID  = process.env.AIRTABLE_BASE_ID  || 'app6LoOGhyUKDhp5p';
const TABLE_ID = process.env.AIRTABLE_TABLE_ID || 'tblgMYxZWOnJAODDX';
const AT_KEY   = process.env.AIRTABLE_API_KEY;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function transform(r) {
  const f = r.fields || {};
  const pick = v => (typeof v === 'object' && v !== null ? v.name : v) || '';
  return {
    id:     r.id,
    co:     f['Company']           || '',
    role:   f['Role']              || '',
    status: pick(f['Status'])      || 'New Lead',
    src:    pick(f['Source'])      || '',
    loc:    f['Location']          || '',
    score:  f['Match Score']       || 0,
    da:     f['Date Applied'] || f['Date Added'] || '',
    sel:    !!f['Selected to Apply'],
    gm:     f['Gmail Thread ID']   || '',
    lnk:    f['Apply Link']        || '',
    notes:  f['Notes']             || '',
  };
}

async function fetchAll() {
  const url     = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
  const headers = { Authorization: `Bearer ${AT_KEY}` };
  let records = [], offset;

  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (offset) params.set('offset', offset);
    const res = await fetch(`${url}?${params}`, { headers });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    const data = await res.json();
    records = records.concat(data.records || []);
    offset = data.offset;
  } while (offset);

  return records;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });
  if (!AT_KEY)                  return res.status(500).json({ error: 'AIRTABLE_API_KEY not configured' });

  try {
    const raw  = await fetchAll();
    const jobs = raw.map(transform).filter(j => j.co || j.role);
    res.status(200).json({ jobs, total: jobs.length });
  } catch (err) {
    console.error('[api/jobs]', err.message);
    res.status(500).json({ error: err.message });
  }
};
