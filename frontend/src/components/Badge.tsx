import type { EmploymentType } from '../api/types';

const TYPE_LABELS: Record<EmploymentType, { label: string; tone: string }> = {
  internship: { label: 'INTERN', tone: 'badge-blue' },
  full_time: { label: 'FULL-TIME', tone: 'badge-green' },
  part_time: { label: 'PART-TIME', tone: 'badge-gray' },
  contract: { label: 'CONTRACT', tone: 'badge-gray' },
  unknown: { label: '—', tone: 'badge-gray' },
};

export function EmploymentBadge({ type }: { type: EmploymentType }) {
  const { label, tone } = TYPE_LABELS[type] ?? TYPE_LABELS.unknown;
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function Badge({
  tone,
  children,
}: {
  tone: 'blue' | 'green' | 'red' | 'amber' | 'gray';
  children: React.ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
