CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  preference TEXT NOT NULL DEFAULT 'both' CHECK (preference IN ('internship', 'full_time', 'both')),
  notify_email INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE industries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name)
);

CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  industry_id INTEGER NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  careers_url TEXT,
  ats_type TEXT,
  ats_slug TEXT,
  -- pending: discovery not yet attempted; searching: in progress;
  -- found: careers source resolved; manual_needed: user must paste a URL
  discovery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (discovery_status IN ('pending', 'searching', 'found', 'manual_needed')),
  discovery_method TEXT,
  last_scrape_status TEXT CHECK (last_scrape_status IN ('running', 'success', 'failed')),
  last_scraped_at TEXT,
  last_scrape_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_companies_user ON companies(user_id);
CREATE INDEX idx_companies_industry ON companies(industry_id);

CREATE TABLE listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  location TEXT,
  employment_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (employment_type IN ('internship', 'full_time', 'part_time', 'contract', 'unknown')),
  team TEXT,
  -- sha1(lower(title) | lower(url or location)); dedupe key per company.
  -- Deleted listings keep their row so a re-scrape cannot resurrect them.
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'deleted')),
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, fingerprint)
);

CREATE INDEX idx_listings_user_status ON listings(user_id, status);
CREATE INDEX idx_listings_company ON listings(company_id);

CREATE TABLE scrape_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  method TEXT,
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  listings_found INTEGER NOT NULL DEFAULT 0,
  listings_new INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE INDEX idx_scrape_runs_company ON scrape_runs(company_id);
