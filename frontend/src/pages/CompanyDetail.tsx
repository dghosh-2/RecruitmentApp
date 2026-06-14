import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { companyApi, listingApi } from '../api/endpoints';
import type { Company, Listing, ScrapeRun } from '../api/types';
import { Badge } from '../components/Badge';
import { ListingRow } from '../components/ListingRow';

type Tab = 'new' | 'all';

export function CompanyDetail() {
  const { id } = useParams();
  const companyId = Number(id);

  const [company, setCompany] = useState<Company | null>(null);
  const [runs, setRuns] = useState<ScrapeRun[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [applyPreference, setApplyPreference] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [internUrlDraft, setInternUrlDraft] = useState('');

  const load = useCallback(async () => {
    const [detail, list] = await Promise.all([
      companyApi.get(companyId),
      listingApi.list({
        companyId,
        status: tab === 'new' ? 'new' : 'active',
        applyPreference,
      }),
    ]);
    setCompany(detail.company);
    setRuns(detail.scrapeRuns);
    setListings(list.listings);
  }, [companyId, tab, applyPreference]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  // Scrapes run in the background — poll while one is in flight.
  useEffect(() => {
    if (company?.lastScrapeStatus !== 'running') return;
    const timer = setTimeout(() => {
      load().catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [company, load]);

  async function onScrape(mode: 'all' | 'internship' = 'all') {
    setScraping(true);
    setError(null);
    try {
      await companyApi.scrape(companyId, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scrape failed');
    } finally {
      setScraping(false);
      load().catch(() => {});
    }
  }

  async function onSaveUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!urlDraft) return;
    await companyApi.update(companyId, { careersUrl: urlDraft });
    setUrlDraft('');
    await load();
  }

  async function onSaveInternUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!internUrlDraft) return;
    await companyApi.update(companyId, { internCareersUrl: internUrlDraft });
    setInternUrlDraft('');
    await load();
  }

  if (!company) {
    return (
      <div className="empty">
        <span className="spinner" style={{ color: 'var(--blue-500)' }} />
      </div>
    );
  }

  const lastRun = runs[0];

  return (
    <>
      <p style={{ marginBottom: 14 }}>
        <Link to="/" className="mono" style={{ fontSize: 13 }}>
          ← dashboard
        </Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{company.name}</h1>
          <p className="page-sub" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {company.atsType ? (
              <Badge tone="blue">{company.atsType} API</Badge>
            ) : company.careersUrl ? (
              <Badge tone="gray">AI scrape</Badge>
            ) : (
              <Badge tone="amber">careers URL needed</Badge>
            )}
            {company.careersUrl && (
              <a href={company.careersUrl} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 12.5 }}>
                {company.careersUrl}
              </a>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost"
            title="Wrong careers page? Throw it away and search again"
            onClick={async () => {
              await companyApi.rediscover(companyId);
              await load();
            }}
          >
            ↻ Re-find page
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => onScrape('internship')}
            disabled={
              scraping ||
              company.lastScrapeStatus === 'running' ||
              (!company.careersUrl && !company.atsType && !company.internCareersUrl)
            }
            title="Scrape only internships / early-career roles"
          >
            Scrape interns
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onScrape('all')}
            disabled={
              scraping ||
              company.lastScrapeStatus === 'running' ||
              (!company.careersUrl && !company.atsType)
            }
          >
            {scraping || company.lastScrapeStatus === 'running' ? (
              <>
                <span className="spinner" /> Scraping…
              </>
            ) : (
              'Scrape now'
            )}
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {!error && company.lastScrapeError && (
        <div className="manual-url-box" style={{ marginBottom: 16 }}>
          {company.lastScrapeError}
        </div>
      )}

      <form className="inline-form" style={{ marginBottom: 10 }} onSubmit={onSaveUrl}>
        <input
          type="url"
          placeholder={company.careersUrl ?? 'Set careers page URL manually'}
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          style={{ width: 380 }}
        />
        <button className="btn btn-ghost btn-sm" disabled={!urlDraft}>
          Update URL
        </button>
      </form>

      <form className="inline-form" style={{ marginBottom: 20 }} onSubmit={onSaveInternUrl}>
        <input
          type="url"
          placeholder={company.internCareersUrl ?? 'Optional: dedicated internships page URL'}
          value={internUrlDraft}
          onChange={(e) => setInternUrlDraft(e.target.value)}
          style={{ width: 380 }}
        />
        <button className="btn btn-ghost btn-sm" disabled={!internUrlDraft}>
          Set intern URL
        </button>
        {company.internCareersUrl && (
          <span className="mono" style={{ fontSize: 12, color: 'var(--ink-400)', alignSelf: 'center' }}>
            intern scrapes use this page
          </span>
        )}
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="seg">
          <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
            All
          </button>
          <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
            New
          </button>
        </div>
        <label style={{ fontSize: 13.5, color: 'var(--ink-600)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={applyPreference}
            onChange={(e) => setApplyPreference(e.target.checked)}
          />
          Match my preference only
        </label>
        {lastRun && lastRun.finishedAt && (
          <span className="mono" style={{ fontSize: 12, color: 'var(--ink-400)', marginLeft: 'auto' }}>
            last scrape: {lastRun.status} · {lastRun.method} · {lastRun.listingsFound} found /{' '}
            {lastRun.listingsNew} new
          </span>
        )}
      </div>

      <div className="card">
        {listings.length === 0 ? (
          <div className="empty">
            No listings {tab === 'new' ? 'marked new' : 'tracked'} yet.
            <div className="hint">Run a scrape to pull current openings.</div>
          </div>
        ) : (
          listings.map((listing) => (
            <ListingRow key={listing.id} listing={listing} onChanged={() => load()} />
          ))
        )}
      </div>
    </>
  );
}
