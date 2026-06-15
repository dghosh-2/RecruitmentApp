-- Two discovery depths share one page/pipeline:
--   'thorough' (default): planner LLM + standard & dynamic agents + ranking LLM.
--   'fast': a small fixed fan-out, no planner/ranking LLM calls — quick results.
ALTER TABLE company_searches
  ADD COLUMN mode TEXT NOT NULL DEFAULT 'thorough'
  CHECK (mode IN ('fast', 'thorough'));
