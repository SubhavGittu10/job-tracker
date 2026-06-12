/**
 * PATCH /api/update
 * Updates a single Airtable record.
 * Body: { id: "recXXX", fields: { status: "Applied", ... } }
 */

const BASE_ID  = process.env.AIRTABLE_BASE_ID  || 'app6LoOGhyUKDhp5p';
const TABLE_ID = process.env.AIRTABLE_TABLE_ID || 'tblgMYxZWOnJAODDX';
const AT_KEY   = process.env.AIRTABLE_API_KEY;

const FIELD_MAP = {
  status: 'Status',
  sel:    'Selected to Apply',
  notes:  'Notes',
  score:  'Match Score',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH')   return res.status(405).json({ error: 'Method not allowed' });
  if (!AT_KEY)                  return res.status(500).json({ error: 'AIRTABLE_API_KEY not configured' });

  const { id, fields = {} } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Record id required' });

  const atFields = {};
  for (const [k, v] of Object.entries(fields)) {
    atFields[FIELD_MAP[k] || k] = v;
  }

  try {
    const url  = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${id}`;
    const res2 = await fetch(url, {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${AT_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields: atFields }),
    });
    if (!res2.ok) throw new Error(`Airtable ${res2.status}: ${await res2.text()}`);
    const data = await res2.json();
    res.status(200).json({ id: data.id, ok: true });
  } catch (err) {
    console.error('[api/update]', err.message);
    res.status(500).json({ error: err.message });
  }
};
