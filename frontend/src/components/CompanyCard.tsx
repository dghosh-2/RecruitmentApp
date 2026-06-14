import { useState } from 'react';
import { Link } from 'react-router-dom';
import { companyApi } from '../api/endpoints';
import type { Company } from '../api/types';
import { Badge } from './Badge';

const ATS_LABELS: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  smartrecruiters: 'SmartRecruiters',
  workable: 'Workable',
};

function DiscoveryBadge({ company }: { company: Company }) {
  if (company.discoveryStatus === 'pending' || company.discoveryStatus === 'searching') {
    return (
      <Badge tone="amber">
        <span className="spinner" style={{ width: 9, height: 9, marginRight: 6 }} />
        finding careers page
      </Badge>
    );
  }
  if (company.discoveryStatus === 'manual_needed') {
    return <Badge tone="amber">URL needed</Badge>;
  }
  if (company.atsType) {
    return <Badge tone="blue">{ATS_LABELS[company.atsType] ?? company.atsType} API</Badge>;
  }
  return <Badge tone="gray">AI scrape</Badge>;
}

export function CompanyCard({
  company,
  onChanged,
}: {
  company: Company;
  onChanged: () => void;
}) {
  const [scraping, setScraping] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const scrapeRunning = scraping || company.lastScrapeStatus === 'running';

  async function onScrape(mode: 'all' | 'internship' = 'all') {
    setScraping(true);
    setError(null);
    try {
      await companyApi.scrape(company.id, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scrape failed');
    } finally {
      setScraping(false);
      onChanged(); // dashboard polls while the scrape runs in the background
    }
  }

  async function onDelete() {
    if (!confirm(`Remove ${company.name} and all its tracked listings?`)) return;
    await companyApi.remove(company.id);
    onChanged();
  }

  async function onManualUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!manualUrl) return;
    try {
      await companyApi.update(company.id, { careersUrl: manualUrl });
      setManualUrl('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save URL');
    }
  }

  return (
    <div className="card company-card">
      <div className="title-row">
        <h3>
          <Link to={`/companies/${company.id}`}>{company.name}</Link>
        </h3>
        <button className="btn btn-danger btn-sm" onClick={onDelete} title="Remove company">
          ✕
        </button>
      </div>

      <div className="company-meta">
        <DiscoveryBadge company={company} />
        {company.newListingCount > 0 && (
          <Badge tone="green">{company.newListingCount} new</Badge>
        )}
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>
          {company.listingCount} tracked
        </span>
      </div>

      {company.discoveryStatus === 'manual_needed' && (
        <div className="manual-url-box">
          Couldn't auto-find a careers page. Paste it below:
          <form onSubmit={onManualUrl}>
            <input
              type="url"
              placeholder="https://company.com/careers"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              required
            />
            <button className="btn btn-primary btn-sm">Save</button>
          </form>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12.5, color: 'var(--red-600)' }}>{error}</div>
      )}
      {!error && company.lastScrapeError && (
        <div style={{ fontSize: 12, color: 'var(--amber-600)' }}>{company.lastScrapeError}</div>
      )}

      <div className="company-foot">
        {company.discoveryStatus === 'found' && (
          <button
            className="btn btn-ghost btn-sm"
            title="Wrong careers page? Search again"
            onClick={async () => {
              await companyApi.rediscover(company.id);
              onChanged();
            }}
          >
            ↻
          </button>
        )}
        {company.careersUrl ? (
          <a
            href={company.careersUrl}
            target="_blank"
            rel="noreferrer"
            className="mono"
            style={{ fontSize: 12, color: 'var(--ink-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}
          >
            {new URL(company.careersUrl).hostname}
          </a>
        ) : (
          <span />
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onScrape('internship')}
          disabled={
            scrapeRunning ||
            (!company.careersUrl && !company.atsType && !company.internCareersUrl)
          }
          title="Scrape only internships / early-career roles"
        >
          Interns
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onScrape('all')}
          disabled={scrapeRunning || (!company.careersUrl && !company.atsType)}
        >
          {scrapeRunning ? (
            <>
              <span className="spinner" /> Scraping
            </>
          ) : (
            'Scrape'
          )}
        </button>
      </div>
    </div>
  );
}
