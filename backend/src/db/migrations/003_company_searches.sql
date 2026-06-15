-- Natural-language company discovery searches. Each row is one user prompt
-- processed by the multi-agent pipeline (planner -> research agents -> aggregator).
-- Suggestions are ephemeral: plan_json and results_json store the agent plan and
-- the final ranked company list, so the UI can poll status and render results.
CREATE TABLE company_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'failed')),
  error TEXT,
  -- JSON: the orchestrator-1 research plan (standard + dynamic tasks).
  plan_json TEXT,
  -- JSON: the orchestrator-2 final ranked companies [{ name, website, reason }].
  results_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE INDEX idx_company_searches_user ON company_searches(user_id);
