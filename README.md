# RecruiterPro Updated

Track internship and full-time openings at the companies you care about — organized by industry,
scraped on demand, deduped automatically.

Add a company by **name only**: the backend probes the major applicant-tracking systems
(Greenhouse, Lever, Ashby, SmartRecruiters, Workable) for the company's job board and falls back
to an OpenAI web search. ATS-hosted boards are read through their **public JSON APIs** (no HTML
parsing at all); everything else is rendered with Playwright and extracted by **OpenAI structured
outputs**, including multi-page boards (`?page=2`, "Next", "Load more").

## Features

- Industries -> companies -> listings hierarchy
- Preference filter: internships, full-time, or both
- One-click **Scrape** per company + **Scrape all**
- New-jobs inbox; delete listings after applying (they never come back on re-scrape)
- Automatic careers-page discovery with manual URL fallback
- Scrape audit log per company (method, pages crawled, found/new counts)

## Quick start

Requirements: Node.js 20+

```bash
cd recruiterproupdated
npm install
npx playwright install chromium   # one-time; needed for non-ATS career pages
```

Open `.env` and set your OpenAI key:

```
OPENAI_API_KEY=sk-...
```

Then:

```bash
npm run dev
```

- Web app: http://localhost:5173
- API: http://localhost:4000 (proxied at /api by the dev server)

The SQLite database is created and migrated automatically on first boot
(`backend/data/recruiterpro.db`). No database server needed.

> Without an OpenAI key the app still runs: companies hosted on Greenhouse/Lever/Ashby/
> SmartRecruiters/Workable scrape fine via slug probing; other companies need a manually
> pasted careers URL and will report that AI extraction is disabled.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Backend (tsx watch, :4000) + frontend (Vite, :5173) |
| `npm run typecheck` | TypeScript checks for both workspaces |
| `npm run migrate` | Apply migrations manually (also runs on boot) |
| `npm run setup` | `npm install` + Playwright Chromium |

## Architecture

See [AGENTS.md](AGENTS.md) for the full architecture, data model, API surface, and extension
points (email notifications, scheduled scraping, new ATS adapters). Coding conventions live in
[.cursorrules](.cursorrules).
