/**
 * GET  /api/preferences  — fetch all preferences from Airtable
 * PATCH /api/preferences  — update a single preference by key
 * Body for PATCH: { key: "bio", value: "new value" }
 */

const BASE_ID  = process.env.AIRTABLE_BASE_ID || 'app6LoOGhyUKDhp5p';
const TABLE_ID = 'tblPRl3eSfiokDsFz'; // Preferences table
const AT_KEY   = process.env.AIRTABLE_API_KEY;
const AT_URL   = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function headers() {
  return { Authorization: `Bearer ${AT_KEY}`, 'Content-Type': 'application/json' };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!AT_KEY) return res.status(500).json({ error: 'AIRTABLE_API_KEY not configured' });

  // GET — return all prefs as a key→value map
  if (req.method === 'GET') {
    try {
      const r    = await fetch(`${AT_URL}?pageSize=100`, { headers: headers() });
      const data = await r.json();
      const prefs = {};
      for (const rec of (data.records || [])) {
        const f = rec.fields || {};
        prefs[f['Key']] = {
          id:       rec.id,
          key:      f['Key']        || '',
          label:    f['Label']      || '',
          value:    f['Value']      || '',
          category: f['Category']   || '',
        };
      }
      return res.status(200).json({ prefs });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PATCH — update a pref's Value field by record id
  if (req.method === 'PATCH') {
    const { id, value } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Record id required' });
    try {
      const r = await fetch(`${AT_URL}/${id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({
          fields: {
            'Value':      value,
            'Updated At': new Date().toISOString(),
          },
        }),
      });
      if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
      const data = await r.json();
      return res.status(200).json({ id: data.id, ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
