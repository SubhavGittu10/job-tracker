# 💼 Job Tracker — Personal PM Job Search Intelligence System

A full-stack Node.js + Vercel application that turns Airtable into a live job tracking dashboard, with an AI-powered **Nurture Agent** that auto-drafts cover letters and referral outreach using Claude API.

## What it does

| Feature | How |
|---------|-----|
| Live job board | Fetches all records from Airtable on load via `/api/jobs` |
| Status management | Update job status inline → syncs back to Airtable via `/api/update` |
| AI cover letters | One-click draft tailored cover email per company via Claude API |
| AI referral ask | Generates LinkedIn connection request + referral message + search tip |
| Pipeline view | Kanban-style: Applied → Interview → Offer → Rejected |
| Email sync | Claude Cowork reads Gmail and updates Airtable (separate workflow) |

## Architecture

```
Browser (SPA)
  ├── GET  /api/jobs      → Airtable REST API (fetch all records)
  ├── PATCH /api/update   → Airtable REST API (update single record)
  └── POST  /api/generate → Anthropic Claude API (generate content)

Hosted on Vercel (serverless functions, edge CDN, auto HTTPS)
```

## Project structure

```
job-tracker/
├── index.html          # Main SPA shell
├── style.css           # All styles
├── app.js              # Frontend logic (fetches from /api/*)
├── api/
│   ├── jobs.js         # GET  /api/jobs    — fetch from Airtable
│   ├── update.js       # PATCH /api/update — write back to Airtable
│   └── generate.js     # POST  /api/generate — Claude API call
├── package.json
├── vercel.json
├── .env.example
└── README.md
```

## Prerequisites

- [Node.js 18+](https://nodejs.org/)
- [Vercel CLI](https://vercel.com/docs/cli) — `npm i -g vercel`
- Airtable account with your job tracker base (base ID: `app6LoOGhyUKDhp5p`)
- Anthropic API key — [console.anthropic.com](https://console.anthropic.com)

## Setup

### 1. Clone / download this project

```bash
cd job-tracker
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env`:
```
AIRTABLE_API_KEY=your_airtable_personal_access_token
AIRTABLE_BASE_ID=app6LoOGhyUKDhp5p
AIRTABLE_TABLE_ID=tblgMYxZWOnJAODDX
ANTHROPIC_API_KEY=your_anthropic_api_key
```

**Getting your Airtable token:**
1. Go to [airtable.com/create/tokens](https://airtable.com/create/tokens)
2. Create a Personal Access Token
3. Scopes: `data.records:read`, `data.records:write`
4. Access: your Job Tracking base

**Getting your Anthropic API key:**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. API Keys → Create Key

### 3. Run locally

```bash
npm run dev
# Opens at http://localhost:3000
```

## Deploy to Vercel

### Option A — Vercel CLI (fastest)

```bash
vercel login
vercel

# Set environment variables
vercel env add AIRTABLE_API_KEY
vercel env add AIRTABLE_BASE_ID
vercel env add AIRTABLE_TABLE_ID
vercel env add ANTHROPIC_API_KEY

# Deploy to production
vercel --prod
```

### Option B — Vercel Dashboard (no CLI)

1. Push this folder to a GitHub repo
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your GitHub repo
4. In **Environment Variables**, add all four keys from `.env.example`
5. Click **Deploy**

Your tracker will be live at `https://job-tracker-xxx.vercel.app` in ~30 seconds.

## Airtable field mapping

The app reads these field names from Airtable:

| Airtable Field | Frontend key | Notes |
|---------------|-------------|-------|
| `Company` | `co` | |
| `Role` | `role` | |
| `Status` | `status` | Single select: New Lead, Applied, Interview, Offer, Rejected |
| `Source` | `src` | Single select: IIMJobs, Hirist, etc. |
| `Location` | `loc` | |
| `Match Score` | `score` | Number 0–100 |
| `Date Applied` | `da` | Date field |
| `Date Added` | `da` | Fallback if Date Applied is empty |
| `Selected to Apply` | `sel` | Checkbox |
| `Gmail Thread ID` | `gm` | Links to Gmail thread |
| `Apply Link` | `lnk` | URL |
| `Notes` | `notes` | Long text |

## How the Nurture Agent works

### Lead → Applied

1. Filters `New Lead` records with score ≥ 70, sorted by score
2. Click **Draft Application** → `POST /api/generate` with `type: "cover_letter"`
3. Serverless function calls Claude (Haiku model) with structured prompt + your resume context
4. Returns subject line + 3-paragraph email (~150 words) tailored to that company
5. Copy to clipboard → apply → click **Mark Applied** to update Airtable

### Applied → Referral

1. Shows all `Applied` records sorted by score
2. Click **Get Referral Ask** → `POST /api/generate` with `type: "referral"`
3. Claude generates:
   - LinkedIn connection request (under 250 chars)
   - Referral ask message (under 150 words)
   - LinkedIn search query to find the right person
4. Copy and send on LinkedIn

## Email sync workflow (Claude Cowork)

The email-to-Airtable sync runs separately via Claude Cowork (desktop app):

1. Open Claude Cowork
2. Say: *"Update the latest rejections and interview invites from my email on the tracker"*
3. Claude reads Gmail → identifies rejections, interviews, new applications → updates Airtable

This is the "agentic" layer — Claude parses unstructured email content and maps it to structured Airtable records with zero manual input.

## Interview talking points

**"What did you build this with?"**
> Node.js serverless functions on Vercel, Airtable as the database (no backend infra to manage), Claude API for AI generation. Total infra cost: ~$0/month on free tiers.

**"Why not use a job tracking app?"**
> Off-the-shelf tools don't have my resume context, can't read my email, and can't generate personalised outreach. Building it myself meant I could embed my actual background into every generated document.

**"What's the most interesting engineering decision?"**
> Keeping the AI generation server-side. The Claude API key is never exposed to the browser — all generation goes through `/api/generate`. The frontend just shows a loading state and renders the result.

**"How does the email sync work?"**
> Claude Cowork (Anthropic's desktop agent) has access to both Gmail MCP and Airtable MCP. When I ask it to sync, it reads the last 30 days of job-related emails, identifies the signal (rejection, interview, application confirmation), and patches the corresponding Airtable record. No webhook, no cron — pure on-demand agentic workflow.

## Customising for yourself

To adapt this tracker for your own job search:

1. **Update the bio in `api/generate.js`** — Replace the `BIO` constant with your own background
2. **Update your Airtable base ID** — Set `AIRTABLE_BASE_ID` in your env vars
3. **Adjust the match scoring** — Edit `locPts` / `rolePts` logic in `app.js` to match your preferences
4. **Add/remove status options** — The `Status` single select in Airtable drives everything

## License

MIT — build and adapt freely.
