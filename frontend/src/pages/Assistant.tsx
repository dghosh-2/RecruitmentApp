import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { searchApi } from '../api/endpoints';
import type { AutoPhase, CompanySearch, SearchMode } from '../api/types';

const EXAMPLES = [
  'Find me quant trading internships for 2027, excluding Point72 and Walleye',
  'Software engineering internships at climate-tech startups in Europe',
  'New-grad data science roles at fintechs that sponsor visas',
];

const MODE_HINT: Record<SearchMode, string> = {
  fast: 'Fewer research agents, quicker — good for a first pass.',
  thorough: 'A planner spins up extra agents and ranks deeper — slower, more complete.',
};

const PHASES: { id: AutoPhase; label: string }[] = [
  { id: 'planning', label: 'Planning' },
  { id: 'researching', label: 'Finding companies' },
  { id: 'scraping', label: 'Scraping internships' },
  { id: 'done', label: 'Done' },
];

function phaseIndex(phase: AutoPhase | null): number {
  if (!phase) return 0;
  return Math.max(0, PHASES.findIndex((p) => p.id === phase));
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function Assistant() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('thorough');
  const [search, setSearch] = useState<CompanySearch | null>(null);
  const [recent, setRecent] = useState<CompanySearch[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadRecent = useCallback(async () => {
    try {
      const { searches } = await searchApi.list();
      setRecent(searches.filter((s) => s.kind === 'auto'));
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const running = search?.status === 'pending' || search?.status === 'running';

  // Poll while the multi-phase run is in flight; refresh recent list when it settles.
  useEffect(() => {
    if (!search || (search.status !== 'pending' && search.status !== 'running')) {
      if (search && (search.status === 'success' || search.status === 'failed')) {
        loadRecent();
      }
      return;
    }
    pollRef.current = window.setTimeout(async () => {
      try {
        const { search: updated } = await searchApi.get(search.id);
        setSearch(updated);
      } catch {
        /* keep last state; next tick retries */
      }
    }, 2500);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [search, loadRecent]);

  const runQuery = useCallback(async (q: string, m: SearchMode) => {
    if (q.trim().length < 3) return;
    setSubmitting(true);
    setError(null);
    setSearch(null);
    try {
      const { search: created } = await searchApi.create(q.trim(), m, 'auto');
      setSearch(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The Assistant failed to start');
    } finally {
      setSubmitting(false);
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await runQuery(query, mode);
  }

  const activePhase = phaseIndex(search?.phase ?? null);
  const totalJobs = search?.jobs.reduce((sum, j) => sum + j.listings.length, 0) ?? 0;
  const companiesWithJobs = search?.jobs.filter((j) => j.listings.length > 0).length ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Assistant</h1>
          <p className="page-sub">
            Describe what you want in one sentence. The Assistant finds matching companies, scrapes
            each one for internships, and collects the openings — all in one shot. New companies are
            added to your dashboard under "AI Finds" and jobs land in your New Jobs inbox.
          </p>
        </div>
      </div>

      <form className="discover-form" onSubmit={onSubmit}>
        <div className="discover-modes">
          <div className="seg">
            <button
              type="button"
              className={mode === 'fast' ? 'active' : ''}
              onClick={() => setMode('fast')}
            >
              Fast
            </button>
            <button
              type="button"
              className={mode === 'thorough' ? 'active' : ''}
              onClick={() => setMode('thorough')}
            >
              Thorough
            </button>
          </div>
          <span className="discover-mode-hint">{MODE_HINT[mode]}</span>
        </div>
        <textarea
          className="discover-input"
          placeholder="e.g. Find me quant internships for 2027, excluding Point72 and Walleye"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
        />
        <div className="discover-form-foot">
          <div className="discover-examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="discover-chip" onClick={() => setQuery(ex)}>
                {ex}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary"
            disabled={submitting || running || query.trim().length < 3}
          >
            {submitting || running ? (
              <>
                <span className="spinner" /> Working…
              </>
            ) : (
              'Find internships'
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="form-error" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      {!search && recent.length > 0 && (
        <div className="assistant-recent">
          <h2>Recent prompts</h2>
          <div className="assistant-recent-list">
            {recent.map((r) => (
              <button
                key={r.id}
                type="button"
                className="assistant-recent-item"
                onClick={() => {
                  setQuery(r.query);
                  runQuery(r.query, r.mode);
                }}
                title="Run this prompt again"
              >
                <span className="assistant-recent-q">{r.query}</span>
                <span className="assistant-recent-meta mono">
                  {r.status === 'success'
                    ? `${r.jobs.reduce((s, j) => s + j.listings.length, 0)} jobs`
                    : r.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {search && (
        <div className="discover-results">
          {running && (
            <div className="card assistant-progress">
              <div className="assistant-steps">
                {PHASES.slice(0, 3).map((p, i) => (
                  <div
                    key={p.id}
                    className={`assistant-step${i < activePhase ? ' done' : ''}${
                      i === activePhase ? ' active' : ''
                    }`}
                  >
                    <span className="assistant-step-dot">
                      {i === activePhase ? <span className="spinner" /> : i < activePhase ? '✓' : i + 1}
                    </span>
                    <span>{p.label}</span>
                  </div>
                ))}
              </div>
              <div className="hint">
                {search.phase === 'scraping'
                  ? `Scraping ${search.results.length} companies for internships — this can take a few minutes.`
                  : search.phase === 'researching'
                    ? `${search.plan?.tasks.length ?? 'Several'} research agents are finding companies.`
                    : 'Planning the research…'}
              </div>
            </div>
          )}

          {search.status === 'failed' && (
            <div className="form-error">{search.error ?? 'The Assistant run failed. Try again.'}</div>
          )}

          {search.status === 'success' && (
            <>
              <div className="discover-results-head">
                <h2>
                  {totalJobs} internship{totalJobs === 1 ? '' : 's'} across {companiesWithJobs}{' '}
                  compan{companiesWithJobs === 1 ? 'y' : 'ies'}
                </h2>
                {search.plan?.exclusions && search.plan.exclusions.length > 0 && (
                  <span className="page-sub" style={{ margin: 0 }}>
                    Excluded: {search.plan.exclusions.join(', ')}
                  </span>
                )}
              </div>

              {search.jobs.length === 0 ? (
                <div className="card empty">
                  No companies matched. Try rephrasing or broadening your prompt.
                </div>
              ) : (
                <div className="assistant-companies">
                  {[...search.jobs]
                    .sort((a, b) => b.listings.length - a.listings.length)
                    .map((company) => (
                      <div key={company.companyId} className="card assistant-company">
                        <div className="assistant-company-head">
                          <div>
                            <Link to={`/companies/${company.companyId}`} className="assistant-company-name">
                              {company.companyName}
                            </Link>
                            {company.careersUrl && (
                              <a
                                href={company.careersUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mono discover-link"
                                style={{ marginLeft: 8 }}
                              >
                                {hostnameOf(company.careersUrl)}
                              </a>
                            )}
                          </div>
                          <span className="assistant-count">
                            {company.listings.length} intern{company.listings.length === 1 ? '' : 's'}
                          </span>
                        </div>

                        {company.listings.length > 0 ? (
                          <ul className="assistant-jobs">
                            {company.listings.map((job, i) => (
                              <li key={`${job.title}-${i}`} className="assistant-job">
                                {job.url ? (
                                  <a href={job.url} target="_blank" rel="noreferrer">
                                    {job.title}
                                  </a>
                                ) : (
                                  <span>{job.title}</span>
                                )}
                                {job.location && (
                                  <span className="assistant-job-loc mono">{job.location}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="assistant-empty-note hint">
                            {company.discoveryStatus === 'manual_needed'
                              ? 'Could not find a careers page automatically — open the company to paste one.'
                              : company.scrapeStatus === 'failed'
                                ? `Scrape failed: ${company.error ?? 'unknown error'}`
                                : 'No current internships found.'}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
