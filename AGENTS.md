# AGENTS.md — RecruiterPro Updated

Context document for AI agents and engineers working on this codebase. Read `.cursorrules` for
hard conventions; this file explains what the app is and how it works.

## Current implementation status

This is a working from-scratch rebuild in `recruiterproupdated/`, not just a scaffold.

- Root `npm run dev` boots the Express API on `localhost:4000` and the Vite app on
  `localhost:5173`.
- SQLite migrations run automatically on backend boot; the local DB is
  `backend/data/recruiterpro.db` and is gitignored.
- `.env` exists at the repo root and may contain a real OpenAI key. Do not print secrets. Use
  `/api/health` or server logs to check `openaiConfigured`, not by echoing the key.
- Verified examples after fixes:
  - SIG: `https://careers.sig.com/jobs` extracted 215 listings across 22 pages with
    `SCRAPE_MAX_PAGES=30`.
  - Belvedere Trading: `https://www.belvederetrading.com/open-positions-1` extracted 15 listings.
  - Google: discovery should resolve to `https://careers.google.com/jobs/results/`, not a
    SmartRecruiters URL.
- Major recent fixes that must be preserved: verified ATS probing, async scrape endpoints,
  truncation warnings, SVG-safe link extraction, interrupted-scrape recovery, and the New Jobs
  internships/full-time filter.

## What this app does

RecruiterPro helps students and professionals track job openings at companies they care about.

- Users register and pick a preference: **internships**, **full-time**, or **both**.
- They organize **companies under industries** (e.g. Fintech -> Stripe, Ramp).
- Adding a company requires **only its name** — the backend discovers the careers page
  automatically. If discovery fails, the UI asks for a manually pasted URL.
- A **Scrape** button (per company, or "Scrape all") pulls current openings. Net-new listings
  land in the **New Jobs** inbox.
- Users **delete** listings after applying (or to dismiss them). Deleted listings never
  reappear, even after re-scraping.

## Why this is version 2

The previous app (sibling folder `../RecruiterPro`) parsed career pages with Cheerio CSS
selectors and keyword regexes, with OpenAI as a fallback. Career pages vary too much for
heuristics: different markup, client-side rendering, pagination (`?page=2`...), etc. It produced
inaccurate listings. This rebuild inverts the strategy — structured data first, AI for everything
else, heuristics never.

## The scraping architecture (the core of the app)

```
Company name
   |
   v
[1] ATS slug probing (free, verified)
    slugCandidates("Acme Robotics") -> ["acmerobotics", "acme-robotics", "acme"]
    Probed concurrently against: Greenhouse, Lever, Ashby, SmartRecruiters, Workable
    Hit -> verify board belongs to company -> store ats_type + ats_slug -> use ATS JSON API
   |  miss
   v
[2] OpenAI web search (Responses API + web_search_preview tool)
    Finds the careers URL; if it matches an ATS pattern, upgrade to path [1]
   |  miss
   v
[3] Manual: UI shows "paste careers URL" on the company card
    Pasted URLs are also checked against ATS patterns (detectAtsFromUrl)
```

Extraction then takes one of two paths:

1. **ATS adapter** (`backend/src/scraping/ats/*.ts`): public JSON APIs — perfect titles,
   locations, URLs, employment types. No HTML involved. Pagination per each API (Lever skip,
   SmartRecruiters offset; others return all jobs in one call). Adapter `probe()` methods return
   `ProbeResult` evidence (`boardName`, `jobCount`, `sampleTitles`), not booleans.
2. **AI extractor** (`backend/src/scraping/aiExtractor.ts`): Playwright renders the page
   (handles JS-hydrated boards), then OpenAI with a **strict JSON schema** extracts listings AND
   a `next_page_url`. The loop follows pagination up to `SCRAPE_MAX_PAGES`, stops on repeat URLs
   or pages yielding nothing new. It returns `truncated=true` if it hits the page cap while another
   page still exists; the pipeline stores that as a visible warning.

Both paths converge in `pipeline.ts`: normalize -> fingerprint -> upsert -> audit -> notify.

### Pipeline guarantees

- **Single-flight per company**: concurrent scrape requests for the same company await one run.
- **Dedupe**: `fingerprint = sha1(lower(title) | lower(url or location))`, UNIQUE per company.
- **Soft delete**: `status='deleted'` rows persist; upsert only refreshes `last_seen_at`, so
  deleted jobs never resurface. New rows get `status='new'`.
- **Audit**: every attempt writes a `scrape_runs` row (method, pages, counts, error).
- **Self-healing**: scraping a company with no careers source re-attempts discovery first.
- **No silent truncation**: if the AI path hits `SCRAPE_MAX_PAGES` while pagination continues,
  `last_scrape_error` gets a warning telling the user to raise the cap.
- **Restart recovery**: `server.ts` calls `recoverInterruptedScrapes()` on boot, so companies or
  scrape runs left `running` by a restart are marked failed instead of spinning forever.

### Discovery verification details

Do not weaken these checks. They were added after real failures:

- **SmartRecruiters false positives**: its postings endpoint can return 200 with
  `totalFound=0` for arbitrary slugs (`google`, `susquehannainternationalgroup`, etc.). The adapter
  must call the company details endpoint too and reject empty boards and name mismatches.
- **Board-name matching**: `boardNameMatches()` compares normalized tokens so
  "Susquehanna International Group, LLP" matches "susquehanna international group", but unrelated
  businesses with the same or similar slug do not.
- **Lever/Ashby lack company names**: if OpenAI is configured, `confirmBoardWithAI()` verifies
  sample titles and the board URL before accepting a probe hit. Without OpenAI, only the exact
  full-name slug is trusted.
- **OpenAI search cleanup**: `searchCareersUrlWithOpenAI()` strips `utm_*` params from discovered
  URLs before storing them.

### Known real-world cases

- **Google**: should not be accepted as `jobs.smartrecruiters.com/google`; discovery should fall
  through to OpenAI and find `https://careers.google.com/jobs/results/`.
- **Susquehanna International Group / SIG**: should not be accepted as a SmartRecruiters board.
  OpenAI discovery finds `https://careers.sig.com/jobs`. The site has ~210+ jobs across ~22 pages
  at 10 jobs/page; with `SCRAPE_MAX_PAGES=30`, the AI extractor verified 215 listings.
- **Belvedere Trading**: discovery finds `https://www.belvederetrading.com/open-positions-1`.
  Its page includes SVG links; `browser.ts` must use `getAttribute('href')` and `new URL(...)`
  rather than `(a as HTMLAnchorElement).href`, because SVG `href` is not a string.
- **Apple-scale boards**: can contain thousands of jobs. Scrapes are intentionally asynchronous.
  For mega-companies, prefer manually setting a filtered careers URL (e.g. intern search results)
  so the app does not spend minutes crawling irrelevant pages.

## Repo layout

```
recruiterproupdated/
  package.json          npm workspaces; `npm run dev` boots api+web via concurrently
  .env / .env.example   root env, loaded by backend
  backend/src/
    config/env.ts       all env access; hot-reloads .env changes; page-cap defaults
    db/                 better-sqlite3 + sequential SQL migrations (auto-applied on boot)
    middleware/         JWT auth, zod validation, error formatter
    routes/             auth, industries, companies, listings (thin HTTP layer)
    services/           business logic + SQL (auth, industry, company, listing, scrapeRun)
    scraping/
      types.ts          AtsAdapter interface, RawListing/NormalizedListing
      ats/              greenhouse, lever, ashby, smartrecruiters, workable + registry
      discovery.ts      name -> ATS probe -> OpenAI web search -> DiscoveryResult
      browser.ts        shared headless Chromium (Playwright), renderPage(), robust link extraction
      aiExtractor.ts    OpenAI structured-output extraction + pagination loop + truncation flag
      normalize.ts      title cleanup, URL resolution, employment-type classification
      pipeline.ts       orchestrator: scrapeCompany, discoverForCompany, queue helpers
    jobs/queue.ts       in-process bounded-concurrency queue (seam for BullMQ/cron)
    email/index.ts      EmailProvider interface; console provider default (seam for Resend)
    app.ts / server.ts  express wiring; migrations run on boot
  frontend/src/
    api/                fetch client (JWT header), typed endpoint wrappers, shared types
    context/            AuthContext (token in localStorage, /auth/me hydration)
    components/         Layout (topbar + nav badge), CompanyCard, ListingRow, Badge
    pages/              Login, Register, Dashboard, CompanyDetail, Inbox, Settings
    styles/global.css   white/blue theme; Space Grotesk + JetBrains Mono
```

## Data model (SQLite)

| Table | Notes |
|-------|-------|
| `users` | email, bcrypt hash, `preference` (internship/full_time/both), `notify_email` |
| `industries` | per-user, unique name per user |
| `companies` | `careers_url`, `ats_type`/`ats_slug`, `discovery_status` (pending/searching/found/manual_needed), last scrape status/error |
| `listings` | title/url/location/`employment_type`/team, `fingerprint` (UNIQUE with company), `status` (new/seen/deleted) |
| `scrape_runs` | per-attempt audit: method (`ats:greenhouse` / `ai`), pages, found/new counts, error |

Preference filtering happens at query time (`listingService.listListings`): "internship" shows
internships + unknowns (so AI-extracted listings without a confident type aren't hidden);
"full_time" shows full-time + contract + unknowns.

## API surface

```
GET    /api/health
POST   /api/auth/register | /api/auth/login
GET    /api/auth/me            PATCH /api/auth/me        (preference, notifyEmail)
GET/POST /api/industries       PATCH/DELETE /api/industries/:id
GET/POST /api/companies        GET/PATCH/DELETE /api/companies/:id
POST   /api/companies/:id/rediscover  (clear careers source, discover + scrape in background)
POST   /api/companies/:id/scrape      (async; queues scrape and returns 202 immediately)
POST   /api/companies/scrape-all      (enqueues all; UI polls)
GET    /api/listings?companyId=&status=&applyPreference=&employmentType=
PATCH  /api/listings/:id       (status)   DELETE /api/listings/:id  (soft delete)
POST   /api/listings/mark-seen
```

Auth: `Authorization: Bearer <jwt>`. Errors: `{ error: { code, message } }`.

Async UX contract: POST /companies returns immediately with `discovery_status='pending'`; a
background job (JobQueue) discovers + first-scrapes. Manual scrape endpoints also return
immediately (202) and queue work. The dashboard and company detail page poll while any company is
pending/searching/running.

## OpenAI usage (intentionally liberal)

- **Discovery**: Responses API with `web_search_preview` tool; prompt returns a bare URL or NONE.
- **Extraction**: Chat Completions with `response_format: json_schema (strict)`; temperature 0.
  Schema: `{ listings: [{title,url,location,employment_type,team}], next_page_url }`.
- Model from `OPENAI_MODEL` (default gpt-4o). Without an API key the server still runs:
  ATS adapters work, discovery falls back to manual URLs, AI extraction errors clearly.
- `.env` hot reloads via `fs.watchFile(...).unref()`. The OpenAI client rebuilds if the key changes.

## Extension points (designed-in seams)

- **Email on async scrape results**: implement `EmailProvider` (e.g. Resend) in `backend/src/email/`,
  branch in `getEmailProvider()`. `pipeline.ts` already calls `sendNewListingsDigest` for users
  with `notify_email=1` when a scrape finds new listings.
- **Scheduled scraping**: add node-cron (or similar) calling `enqueueScrape(companyId)` per
  company. The queue bounds concurrency via `SCRAPE_CONCURRENCY`.
- **Distributed queue**: replace JobQueue internals with BullMQ; the `enqueue(name, task)`
  contract keeps callers unchanged.
- **New ATS**: one adapter file + registry entry (see `.cursorrules`).
- **Postgres migration**: services isolate SQL; swap better-sqlite3 calls per service.

## Commands

```bash
npm install                       # all workspaces
npx playwright install chromium   # one-time, for the AI extraction path
npm run dev                       # api on :4000, web on :5173 (proxied /api)
npm run migrate                   # usually unnecessary — migrations run on boot
npm run typecheck                 # both workspaces
cd backend && npx tsx scripts/testDiscovery.ts "Company Name"
cd backend && npx tsx scripts/testExtraction.ts "https://careers.example.com/jobs"
```

## Gotchas

1. Playwright Chromium must be installed once or AI-path scrapes fail with a clear launch error.
2. better-sqlite3 is synchronous by design — don't `await` DB calls, and keep transactions in
   `db.transaction()` wrappers.
3. The SQLite file lives at `backend/data/recruiterpro.db` (gitignored). Delete it to reset.
4. Timestamps are stored as UTC `datetime('now')` strings; the frontend appends 'Z' when parsing.
5. Scrape-all and per-company scrape responses return before scraping finishes — by design; poll
   `GET /api/companies` or `GET /api/companies/:id`.
6. `SCRAPE_MAX_PAGES` defaults to 30. Missing jobs are worse than extra runtime in this app. If
   a scrape warns that it hit the cap, increase the env value or use a more specific careers URL.
7. The New Jobs page has an All / Internships / Full-time filter. Internships are exact
   `employment_type='internship'`; full-time includes `unknown` because custom sites often omit
   employment type and hiding unknowns would miss real jobs.
