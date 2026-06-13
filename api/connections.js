/**
 * GET  /api/connections              — fetch all LinkedIn connections
 * POST /api/connections              — add a new connection
 * PATCH /api/connections             — update connection status / outreach message
 * Body for POST: { name, linkedinUrl, company, title, degree, jobId, outreachMessage }
 * Body for PATCH: { id, status?, outreachMessage?, notes? }
 */

const BASE_ID  = process.env.AIRTABLE_BASE_ID || 'app6LoOGhyUKDhp5p';
const TABLE_ID = 'tblv2uCdpG4SF2qjr'; // Connections table
const AT_KEY   = process.env.AIRTABLE_API_KEY;
const AT_URL   = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function atHeaders() {
  return { Authorization: `Bearer ${AT_KEY}`, 'Content-Type': 'application/json' };
}

function transform(rec) {
  const f = rec.fields || {};
  const pick = v => (typeof v === 'object' && v !== null ? v.name : v) || '';
  return {
    id:              rec.id,
    name:            f['Name']             || '',
    linkedinUrl:     f['LinkedIn URL']     || '',
    company:         f['Company']          || '',
    title:           f['Title']            || '',
    degree:          pick(f['Degree'])     || '',
    status:          pick(f['Status'])     || 'Not Reached',
    jobId:           (f['Linked Job'] || [])[0] || '',
    outreachMessage: f['Outreach Message'] || '',
    notes:           f['Notes']            || '',
    dateAdded:       f['Date Added']       || '',
  };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!AT_KEY) return res.status(500).json({ error: 'AIRTABLE_API_KEY not configured' });

  // GET — all connections, optionally filter by company
  if (req.method === 'GET') {
    try {
      const company = req.query?.company;
      const qs = new URLSearchParams({ pageSize: '100' });
      if (company) qs.set('filterByFormula', `FIND("${company}", {Company})`);
      const r    = await fetch(`${AT_URL}?${qs}`, { headers: atHeaders() });
      const data = await r.json();
      const connections = (data.records || []).map(transform);
      return res.status(200).json({ connections, total: connections.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — create new connection (from LinkedIn MCP lookup)
  if (req.method === 'POST') {
    const { name, linkedinUrl, company, title, degree, jobId, outreachMessage, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
      const fields = {
        'Name':             name,
        'LinkedIn URL':     linkedinUrl || '',
        'Company':          company     || '',
        'Title':            title       || '',
        'Degree':           degree      || '2nd',
        'Status':           'Not Reached',
        'Outreach Message': outreachMessage || '',
        'Notes':            notes       || '',
        'Date Added':       new Date().toISOString().split('T')[0],
      };
      if (jobId) fields['Linked Job'] = [jobId];

      const r = await fetch(AT_URL, {
        method: 'POST',
        headers: atHeaders(),
        body: JSON.stringify({ fields }),
      });
      if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
      const data = await r.json();
      return res.status(201).json({ id: data.id, ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PATCH — update status or outreach message
  if (req.method === 'PATCH') {
    const { id, status, outreachMessage, notes } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const fields = {};
    if (status)          fields['Status']           = status;
    if (outreachMessage) fields['Outreach Message'] = outreachMessage;
    if (notes)           fields['Notes']            = notes;
    try {
      const r = await fetch(`${AT_URL}/${id}`, {
        method: 'PATCH',
        headers: atHeaders(),
        body: JSON.stringify({ fields }),
      });
      if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
