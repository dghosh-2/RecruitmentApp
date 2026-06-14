import { useCallback, useEffect, useRef, useState } from 'react';
import { companyApi, industryApi } from '../api/endpoints';
import type { Company, Industry } from '../api/types';
import { CompanyCard } from '../components/CompanyCard';

function AddCompanyForm({
  industryId,
  onAdded,
}: {
  industryId: number;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await companyApi.create(name.trim(), industryId);
      setName('');
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add company');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        + Company
      </button>
    );
  }

  return (
    <form className="inline-form" onSubmit={onSubmit}>
      <input
        placeholder="Company name (e.g. Stripe)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        required
      />
      <button className="btn btn-primary btn-sm" disabled={busy}>
        {busy ? <span className="spinner" /> : 'Add'}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <span style={{ fontSize: 12.5, color: 'var(--red-600)', alignSelf: 'center' }}>{error}</span>}
    </form>
  );
}

export function Dashboard() {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newIndustry, setNewIndustry] = useState('');
  const [scrapingAll, setScrapingAll] = useState(false);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const [ind, comp] = await Promise.all([industryApi.list(), companyApi.list()]);
    setIndustries(ind.industries);
    setCompanies(comp.companies);
    return comp.companies;
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  // Poll while any company is still discovering or scraping in the background.
  useEffect(() => {
    const busy = companies.some(
      (c) =>
        c.discoveryStatus === 'pending' ||
        c.discoveryStatus === 'searching' ||
        c.lastScrapeStatus === 'running'
    );
    if (!busy && !scrapingAll) return;

    pollRef.current = window.setTimeout(() => {
      load().catch(() => {});
    }, 2500);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [companies, scrapingAll, load]);

  async function onAddIndustry(e: React.FormEvent) {
    e.preventDefault();
    if (!newIndustry.trim()) return;
    await industryApi.create(newIndustry.trim());
    setNewIndustry('');
    await load();
  }

  async function onDeleteIndustry(industry: Industry) {
    const count = companies.filter((c) => c.industryId === industry.id).length;
    if (!confirm(`Delete "${industry.name}"${count ? ` and its ${count} companies` : ''}?`)) return;
    await industryApi.remove(industry.id);
    await load();
  }

  async function onScrapeAll(mode: 'all' | 'internship' = 'all') {
    setScrapingAll(true);
    try {
      await companyApi.scrapeAll(mode);
      // Polling picks up status changes; stop the "queued" state after a beat.
      setTimeout(() => setScrapingAll(false), 4000);
      await load();
    } catch {
      setScrapingAll(false);
    }
  }

  const totalNew = companies.reduce((sum, c) => sum + c.newListingCount, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">
            {companies.length} companies tracked
            {totalNew > 0 && (
              <>
                {' '}
                · <strong style={{ color: 'var(--blue-600)' }}>{totalNew} new openings</strong>
              </>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost"
            onClick={() => onScrapeAll('internship')}
            disabled={scrapingAll || companies.length === 0}
            title="Scrape only internships / early-career roles across all companies"
          >
            {scrapingAll ? 'Scraping…' : 'Scrape interns'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onScrapeAll('all')}
            disabled={scrapingAll || companies.length === 0}
          >
            {scrapingAll ? (
              <>
                <span className="spinner" /> Scraping all…
              </>
            ) : (
              'Scrape all'
            )}
          </button>
        </div>
      </div>

      <form className="inline-form" style={{ marginBottom: 28 }} onSubmit={onAddIndustry}>
        <input
          placeholder="Add an industry (e.g. Fintech, Aerospace)"
          value={newIndustry}
          onChange={(e) => setNewIndustry(e.target.value)}
          style={{ width: 300 }}
        />
        <button className="btn btn-ghost">+ Industry</button>
      </form>

      {industries.length === 0 && (
        <div className="card empty">
          Start by adding an industry above.
          <div className="hint">Then add companies inside it — we'll find their careers pages automatically.</div>
        </div>
      )}

      {industries.map((industry) => {
        const industryCompanies = companies.filter((c) => c.industryId === industry.id);
        return (
          <section key={industry.id} className="industry-block">
            <div className="industry-head">
              <h2>{industry.name}</h2>
              <span className="count">{industryCompanies.length}</span>
              <div className="industry-actions">
                <AddCompanyForm industryId={industry.id} onAdded={() => load()} />
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => onDeleteIndustry(industry)}
                  title="Delete industry"
                >
                  ✕
                </button>
              </div>
            </div>
            {industryCompanies.length === 0 ? (
              <div className="card empty" style={{ padding: 24 }}>
                No companies yet — add one with “+ Company”.
              </div>
            ) : (
              <div className="company-grid">
                {industryCompanies.map((company) => (
                  <CompanyCard key={company.id} company={company} onChanged={() => load()} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
