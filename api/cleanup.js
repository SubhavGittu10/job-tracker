/**
 * GET|POST /api/cleanup
 * Archives stale "New Lead" jobs: older than 7 days AND not starred.
 * Sets status → "Withdrawn" (preserves history, removes from active pipeline).
 *
 * Called by Vercel cron weekly, or manually from UI.
 * Returns { archived, kept, total }
 */

const BASE_ID    = process.env.AIRTABLE_BASE_ID  || 'app6LoOGhyUKDhp5p';
const JOBS_TABLE = process.env.AIRTABLE_TABLE_ID  || 'tblgMYxZWOnJAODDX';
const AT_KEY     = process.env.AIRTABLE_API_KEY;
const AT_URL     = `https://api.airtable.com/v0/${BASE_ID}/${JOBS_TABLE}`;

function atHeaders() {
  return { Authorization: `Bearer ${AT_KEY}`, 'Content-Type': 'application/json' };
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Returns YYYY-MM-DD string N days ago
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({ error: 'GET or POST only' });
  if (!AT_KEY) return res.status(500).json({ error: 'AIRTABLE_API_KEY not configured' });

  const cutoff    = daysAgo(7);   // records added before this date are stale
  const dryRun    = req.query?.dry === '1'; // ?dry=1 for preview without changes

  try {
    // Fetch all "New Lead" records that are NOT starred
    const filter = `AND({Status}="New Lead", NOT({Selected to Apply}=TRUE()))`;
    let records = [], offset;
    do {
      const qs = new URLSearchParams({ pageSize: '100', filterByFormula: filter });
      if (offset) qs.set('offset', offset);
      const r   = await fetch(`${AT_URL}?${qs}`, { headers: atHeaders() });
      const d   = await r.json();
      records   = records.concat(d.records || []);
      offset    = d.offset;
    } while (offset);

    // Filter: Date Added < cutoff (or no date at all = assume stale)
    const stale = records.filter(rec => {
      const dateAdded = rec.fields?.['Date Added'] || rec.fields?.['Date Applied'] || '';
      if (!dateAdded) return true;          // no date = treat as stale
      return dateAdded < cutoff;            // YYYY-MM-DD string comparison works correctly
    });

    const kept = records.length - stale.length;

    if (dryRun || stale.length === 0) {
      return res.status(200).json({
        archived: 0,
        would_archive: stale.length,
        kept,
        total: records.length,
        cutoff,
        dry_run: true,
        preview: stale.slice(0, 10).map(r => ({
          co:   r.fields?.['Company'] || '',
          role: r.fields?.['Role']    || '',
          date: r.fields?.['Date Added'] || 'no date',
        })),
      });
    }

    // Archive in batches of 10
    let archived = 0;
    let errors   = 0;
    const chunks = [];
    for (let i = 0; i < stale.length; i += 10) chunks.push(stale.slice(i, i + 10));

    for (const chunk of chunks) {
      const r = await fetch(AT_URL, {
        method: 'PATCH',
        headers: atHeaders(),
        body: JSON.stringify({
          records: chunk.map(rec => ({
            id:     rec.id,
            fields: { 'Status': 'Withdrawn' },
          })),
        }),
      });
      if (r.ok) {
        archived += chunk.length;
      } else {
        console.error('Cleanup batch failed:', await r.text());
        errors += chunk.length;
      }
    }

    res.status(200).json({
      archived,
      kept,
      errors,
      total:   records.length,
      cutoff,
      message: `Archived ${archived} stale New Leads older than ${cutoff}`,
    });
  } catch (err) {
    console.error('[api/cleanup]', err.message);
    res.status(500).json({ error: err.message });
  }
};
