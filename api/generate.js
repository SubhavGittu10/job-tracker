/**
 * POST /api/generate
 * Generates AI content via Claude API.
 * Body: { type: "cover_letter" | "referral", job: {...}, bio?: string }
 *
 * If `bio` is not provided in the body, fetches it dynamically from Airtable Preferences.
 */

const BASE_ID      = process.env.AIRTABLE_BASE_ID || 'app6LoOGhyUKDhp5p';
const PREFS_TABLE  = 'tblPRl3eSfiokDsFz';
const AT_KEY       = process.env.AIRTABLE_API_KEY;

// Fallback BIO if Airtable is unreachable
const FALLBACK_BIO = `Subhav Malhotra — Product Manager with 4.5+ years experience.
Current: PM2 at Spyne.ai (Conversational AI/Automotive) — $2M+ ARR pipeline, 35% token reduction, 78% agent resolution rate.
Previous: PM at Miko.ai (29× subscription revenue to ₹29cr FY24).
Previous: PM at SIXT R&D (0→45% adoption across 100+ countries).
Education: BITS Pilani Hyderabad. Salary target: ₹38–50 LPA.`;

async function getBioFromAirtable() {
  try {
    const url = `https://api.airtable.com/v0/${BASE_ID}/${PREFS_TABLE}?filterByFormula={Key}="bio"&maxRecords=1`;
    const r   = await fetch(url, { headers: { Authorization: `Bearer ${AT_KEY}` } });
    const d   = await r.json();
    return d.records?.[0]?.fields?.['Value'] || FALLBACK_BIO;
  } catch {
    return FALLBACK_BIO;
  }
}

function buildPrompt(type, job, bio) {
  if (type === 'cover_letter') {
    return `Write a concise, punchy cover email for the candidate applying to ${job.role} at ${job.co}.

Candidate background: ${bio}

Role context: ${job.notes || 'No additional context.'}

Instructions:
- Subject line that stands out (not generic)
- Opening hook specific to ${job.co}'s product/business
- 2 sentences on most relevant achievement (pick the ONE most applicable to this role)
- 1 sentence on what they'd bring to ${job.co} specifically
- Clear CTA to schedule a call
- Total body under 150 words. Tone: confident, direct, no fluff.

Format:
SUBJECT: [subject line]

[email body]`;
  }

  if (type === 'referral') {
    return `Generate referral outreach documents for the candidate who applied to ${job.role} at ${job.co} on ${job.da}.

Candidate background: ${bio}

Produce THREE sections:

**1. LINKEDIN CONNECTION REQUEST** (max 250 characters)
Warm, specific to ${job.co}. Do not mention applying for a job.

**2. REFERRAL ASK MESSAGE** (after they accept — max 130 words)
Reference the role. Mention 1 specific achievement relevant to ${job.co}'s domain. Ask if they'd be comfortable referring or sharing 15 min. Keep it human.

**3. LINKEDIN SEARCH QUERY**
One-line search string to find the right person at ${job.co} to approach.

Use the exact headers above.`;
  }

  if (type === 'linkedin_search') {
    return `Generate the optimal LinkedIn search strategy to find 1st and 2nd degree connections at ${job.co} who can provide a referral for the ${job.role} position.

Candidate background: ${bio}

Provide:
1. SEARCH QUERY: Exact LinkedIn People search query (keywords, company filter, degree filter)
2. TARGET TITLES: 3-5 ideal job titles to look for (e.g., "Product Manager", "Engineering Manager", "HR Recruiter")
3. OUTREACH PRIORITY: Which degree connections to prioritize and why
4. ICE-BREAKER: A 1-line personalized opener based on ${job.co}'s recent news or product

Keep it actionable and specific to ${job.co}.`;
  }

  throw new Error(`Unknown type: ${type}`);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { type, job, bio: bodyBio } = req.body || {};
  if (!type || !job) return res.status(400).json({ error: 'type and job required' });

  try {
    // Use BIO from request body (already fetched by client) or fall back to Airtable
    const bio    = bodyBio || await getBioFromAirtable();
    const prompt = buildPrompt(type, job, bio);

    const Anthropic = require('@anthropic-ai/sdk');
    const client    = new (Anthropic.default || Anthropic)({ apiKey });

    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages:   [{ role: 'user', content: prompt }],
    });

    const text = message.content?.[0]?.text || '';
    res.status(200).json({ text, tokens_used: message.usage?.output_tokens });
  } catch (err) {
    console.error('[api/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
};
