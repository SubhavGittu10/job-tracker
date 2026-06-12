/**
 * POST /api/generate
 * Generates AI content via Claude API.
 * Body: { type: "cover_letter" | "referral", job: { co, role, notes, da, src } }
 */

const BIO = `Subhav Malhotra — Product Manager with 4.5+ years experience.
Current: PM2 at Spyne.ai (Conversational AI/Automotive) — $2M+ ARR pipeline, 35% token reduction, 78% agent resolution rate, 550+ calls/day AI evaluation.
Previous: PM at Miko.ai (29× subscription revenue to ₹29cr FY24, improved trial signups 48%→75%, cancellations 25%→17%).
Previous: PM at SIXT R&D (scaled self-service from 0→45% adoption across 100+ countries, €340k+/mo upsell, 90% self-resolution).
Education: BITS Pilani Hyderabad — B.E. Chemical Engineering + Finance Minor (CGPA 7.73).
Salary target: ₹38–50 LPA. Looking for: AI/FinTech/Consumer/SaaS product roles, preferably Bengaluru/Mumbai/Remote.`;

const PROMPTS = {
  cover_letter: (job) => `Write a concise, punchy cover email for Subhav Malhotra applying to ${job.role} at ${job.co}.

Background: ${BIO}

Role context: ${job.notes || 'No additional context.'}

Instructions:
- Subject line that stands out (not generic)
- Opening hook specific to ${job.co}'s product/business
- 2 sentences on most relevant achievement (pick the ONE most applicable to this role)
- 1 sentence on what you'd bring to ${job.co} specifically
- Clear CTA to schedule a call
- Total body under 150 words
- Tone: confident, direct, no fluff

Format:
SUBJECT: [subject line]

[email body]`,

  referral: (job) => `Generate referral outreach documents for Subhav Malhotra who applied to ${job.role} at ${job.co} on ${job.da}.

Background: ${BIO}

Instructions — produce THREE sections:

**1. LINKEDIN CONNECTION REQUEST** (max 250 characters)
Warm, specific to ${job.co}. Do not say "I applied for a job." Just express genuine interest in connecting.

**2. REFERRAL ASK MESSAGE** (after they accept — max 130 words)
Reference the role. Mention 1 specific achievement relevant to ${job.co}'s domain. Ask if they'd be comfortable referring or sharing 15 min of their time. Keep it human, not salesy.

**3. LINKEDIN SEARCH QUERY**
One-line search string to find the right person at ${job.co} to approach.

Use the exact headers above.`,
};

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

  const { type, job } = req.body || {};
  if (!type || !job)  return res.status(400).json({ error: 'type and job required' });
  if (!PROMPTS[type]) return res.status(400).json({ error: `Unknown type: ${type}` });

  try {
    // Dynamic require — works with both ESM and CJS Anthropic SDK builds
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey });

    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages:   [{ role: 'user', content: PROMPTS[type](job) }],
    });

    const text = message.content?.[0]?.text || '';
    res.status(200).json({ text, tokens_used: message.usage?.output_tokens });
  } catch (err) {
    console.error('[api/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
};
