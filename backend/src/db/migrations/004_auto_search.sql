-- All-in-one "Assistant" runs reuse the company_searches table. A run with
-- kind='auto' goes beyond company discovery: it persists the discovered
-- companies, scrapes each for internships via the normal pipeline, and stores an
-- aggregated per-company job snapshot in jobs_json so the UI can render results
-- without re-querying. kind='discover' preserves the existing Discover behavior.
ALTER TABLE company_searches ADD COLUMN kind TEXT NOT NULL DEFAULT 'discover';

-- Granular progress for the multi-phase auto run: planning -> researching ->
-- scraping -> done. Null for plain discover runs.
ALTER TABLE company_searches ADD COLUMN phase TEXT;

-- JSON: [{ companyId, companyName, careersUrl, discoveryStatus, scrapeStatus,
--         error, listings: [{ title, url, location }] }] for auto runs.
ALTER TABLE company_searches ADD COLUMN jobs_json TEXT;
