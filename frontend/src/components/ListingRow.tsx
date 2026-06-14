import { listingApi } from '../api/endpoints';
import type { Listing } from '../api/types';
import { Badge, EmploymentBadge } from './Badge';

export function ListingRow({
  listing,
  showCompany,
  onChanged,
}: {
  listing: Listing;
  showCompany?: boolean;
  onChanged: () => void;
}) {
  async function onDelete() {
    await listingApi.remove(listing.id);
    onChanged();
  }

  return (
    <div className={`listing-row${listing.status === 'new' ? ' is-new' : ''}`}>
      <div className="listing-main">
        {listing.url ? (
          <a className="listing-title" href={listing.url} target="_blank" rel="noreferrer">
            {listing.title}
          </a>
        ) : (
          <span className="listing-title">{listing.title}</span>
        )}
        <div className="listing-sub">
          {showCompany && <span className="listing-company">{listing.companyName}</span>}
          {listing.location && <span>{listing.location}</span>}
          {listing.team && <span>{listing.team}</span>}
          <span className="mono" style={{ color: 'var(--ink-400)', fontSize: 11.5 }}>
            seen {new Date(listing.firstSeenAt + 'Z').toLocaleDateString()}
          </span>
        </div>
      </div>
      {listing.status === 'new' && <Badge tone="blue">NEW</Badge>}
      <EmploymentBadge type={listing.employmentType} />
      <button
        className="btn btn-danger btn-sm"
        onClick={onDelete}
        title="Remove (applied or not interested)"
      >
        Delete
      </button>
    </div>
  );
}
