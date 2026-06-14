-- Some companies host internships on a separate page from full-time roles
-- (e.g. a dedicated "students & grads" microsite or a filtered ATS view).
-- When set, an internship-only scrape uses this URL instead of careers_url.
ALTER TABLE companies ADD COLUMN intern_careers_url TEXT;
