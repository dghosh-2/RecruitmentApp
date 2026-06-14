import { useCallback, useEffect, useState } from 'react';
import { listingApi } from '../api/endpoints';
import type { Listing } from '../api/types';
import { ListingRow } from '../components/ListingRow';

type TypeFilter = 'all' | 'internship' | 'full_time';

export function Inbox() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const load = useCallback(() => {
    return listingApi
      .list({
        status: 'new',
        applyPreference: typeFilter === 'all',
        employmentType: typeFilter === 'all' ? undefined : typeFilter,
      })
      .then((res) => setListings(res.listings))
      .finally(() => setLoading(false));
  }, [typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function onMarkAllSeen() {
    await listingApi.markSeen();
    await load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New Jobs</h1>
          <p className="page-sub">
            Fresh openings since your last visit, matching your preference.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="seg">
            <button
              className={typeFilter === 'all' ? 'active' : ''}
              onClick={() => setTypeFilter('all')}
            >
              All
            </button>
            <button
              className={typeFilter === 'internship' ? 'active' : ''}
              onClick={() => setTypeFilter('internship')}
            >
              Internships
            </button>
            <button
              className={typeFilter === 'full_time' ? 'active' : ''}
              onClick={() => setTypeFilter('full_time')}
            >
              Full-time
            </button>
          </div>
          <button className="btn btn-ghost" onClick={onMarkAllSeen} disabled={listings.length === 0}>
            Mark all as seen
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty">
            <span className="spinner" style={{ color: 'var(--blue-500)' }} />
          </div>
        ) : listings.length === 0 ? (
          <div className="empty">
            Inbox zero — no new openings right now.
            <div className="hint">Hit “Scrape all” on the dashboard to check again.</div>
          </div>
        ) : (
          listings.map((listing) => (
            <ListingRow key={listing.id} listing={listing} showCompany onChanged={load} />
          ))
        )}
      </div>
    </>
  );
}
