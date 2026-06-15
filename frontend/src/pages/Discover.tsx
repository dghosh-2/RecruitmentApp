import { useCallback, useEffect, useRef, useState } from 'react';
import { companyApi, industryApi, searchApi } from '../api/endpoints';
import type { CompanySearch, Industry, SearchMode, SearchResultCompany } from '../api/types';

const EXAMPLES = [
  'Quant trading internships that do not require a high GPA',
  'Climate-tech startups hiring software engineers in Europe',
  'Fintech companies that sponsor visas for new grads',
];

const NEW_INDUSTRY = '__new__';

function AddToDashboard({
  company,
  industries,
  onIndustriesChanged,
}: {
  company: SearchResultCompany;
  industries: Industry[];
  onIndustriesChanged: () => Promise<Industry[]>;
}) {
  const [open, setOpen] = useState(false);
  const [industryId, setIndustryId] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default the picker to the first existing industry, or "new" when none exist.
  useEffect(() => {
    if (!industryId) setIndustryId(industries.length > 0 ? String(industries[0].id) : NEW_INDUSTRY);
  }, [industries, industryId]);

  async function onAdd() {
    setBusy(true);
    setError(null);
    try {
      let targetId: number;
      if (industryId === NEW_INDUSTRY) {
        if (!newName.trim()) {
          setError('Name the industry first');
          setBusy(false);
          return;
        }
        const { industry } = await industryApi.create(newName.trim());
        await onIndustriesChanged();
        targetId = industry.id;
      } else {
        targetId = Number(industryId);
      }
      await companyApi.create(company.name, targetId);
      setAdded(true);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add company');
    } finally {
      setBusy(false);
    }
  }

  if (added) {
    return <span className="discover-added">Added ✓</span>;
  }

  if (!open) {
    return (
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        + Add
      </button>
    );
  }

  return (
    <div className="discover-add-form">
      <select value={industryId} onChange={(e) => setIndustryId(e.target.value)}>
        {industries.map((ind) => (
          <option key={ind.id} value={String(ind.id)}>
            {ind.name}
          </option>
        ))}
        <option value={NEW_INDUSTRY}>+ New industry…</option>
      </select>
      {industryId === NEW_INDUSTRY && (
        <input
          placeholder="Industry name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          autoFocus
        />
      )}
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={onAdd}>
        {busy ? <span className="spinner" /> : 'Save'}
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </button>
      {error && <span className="discover-add-error">{error}</span>}
    </div>
  );
}

const MODE_HINT: Record<SearchMode, string> = {
  fast: 'A couple of agents, no extra planning — quick suggestions in seconds.',
  thorough: 'A planner spins up extra agents and ranks results — slower, deeper.',
};

export function Discover() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('fast');
  const [search, setSearch] = useState<CompanySearch | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const pollRef = useRef<number | null>(null);

  const loadIndustries = useCallback(async () => {
    const { industries: list } = await industryApi.list();
    setIndustries(list);
    return list;
  }, []);

  useEffect(() => {
    loadIndustries().catch(() => {});
  }, [loadIndustries]);

  // Poll the search while the multi-agent pipeline runs in the background.
  useEffect(() => {
    if (!search || (search.status !== 'pending' && search.status !== 'running')) return;
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
  }, [search]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setSubmitting(true);
    setError(null);
    setSearch(null);
    try {
      const { search: created } = await searchApi.create(query.trim(), mode);
      setSearch(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed to start');
    } finally {
      setSubmitting(false);
    }
  }

  const running = search?.status === 'pending' || search?.status === 'running';
  const agentCount = search?.plan?.tasks.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Discover Companies</h1>
          <p className="page-sub">
            Describe what you're looking for in plain English. A team of research agents will find
            companies worth adding to your dashboard.
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
          placeholder="e.g. Quant trading internships that do not require a high GPA"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
        />
        <div className="discover-form-foot">
          <div className="discover-examples">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="discover-chip"
                onClick={() => setQuery(ex)}
              >
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
                <span className="spinner" /> Researching…
              </>
            ) : (
              'Find companies'
            )}
          </button>
        </div>
      </form>

      {error && <div className="form-error" style={{ marginTop: 16 }}>{error}</div>}

      {search && (
        <div className="discover-results">
          {running && (
            <div className="card discover-status">
              <span className="spinner" style={{ color: 'var(--blue-500)' }} />
              <div>
                <strong>
                  {search.mode === 'fast' ? 'Quick search in progress…' : 'Researching companies…'}
                </strong>
                <div className="hint" style={{ marginTop: 4 }}>
                  {agentCount
                    ? `${agentCount} research agents are working in parallel.`
                    : search.mode === 'fast'
                      ? 'Dispatching a couple of agents.'
                      : 'Planning the research and dispatching agents.'}
                </div>
              </div>
            </div>
          )}

          {search.status === 'failed' && (
            <div className="form-error">{search.error ?? 'The search failed. Try again.'}</div>
          )}

          {search.status === 'success' && (
            <>
              <div className="discover-results-head">
                <h2>{search.results.length} companies found</h2>
                {search.plan?.intentSummary && (
                  <span className="page-sub" style={{ margin: 0 }}>
                    {search.plan.intentSummary}
                  </span>
                )}
              </div>
              {search.results.length === 0 ? (
                <div className="card empty">
                  No companies matched. Try rephrasing or broadening your query.
                </div>
              ) : (
                <div className="discover-grid">
                  {search.results.map((company) => (
                    <div key={company.name} className="card discover-card">
                      <div className="discover-card-head">
                        <h3>{company.name}</h3>
                        <AddToDashboard
                          company={company}
                          industries={industries}
                          onIndustriesChanged={loadIndustries}
                        />
                      </div>
                      <p className="discover-reason">{company.reason}</p>
                      {company.website && (
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noreferrer"
                          className="mono discover-link"
                        >
                          {hostnameOf(company.website)}
                        </a>
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

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
