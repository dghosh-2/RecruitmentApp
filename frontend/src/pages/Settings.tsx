import { useState } from 'react';
import { authApi } from '../api/endpoints';
import type { Preference } from '../api/types';
import { useAuth } from '../context/AuthContext';

const PREFERENCES: { value: Preference; label: string; desc: string }[] = [
  { value: 'internship', label: 'Internships', desc: 'Intern and co-op roles only' },
  { value: 'full_time', label: 'Full-time', desc: 'Permanent and contract roles' },
  { value: 'both', label: 'Both', desc: 'Show me everything' },
];

export function Settings() {
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  async function update(updates: { preference?: Preference; notifyEmail?: boolean }) {
    setSaving(true);
    setSaved(false);
    try {
      await authApi.update(updates);
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-sub">Signed in as {user.email}</p>
        </div>
        {saved && <span style={{ color: 'var(--green-600)', fontSize: 14 }}>Saved ✓</span>}
      </div>

      <div className="card" style={{ padding: 24, maxWidth: 560, marginBottom: 18 }}>
        <h2 style={{ fontSize: 16, marginBottom: 14 }}>I'm looking for</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PREFERENCES.map((p) => (
            <label
              key={p.value}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: '12px 14px',
                border: `1px solid ${user.preference === p.value ? 'var(--blue-400)' : 'var(--line)'}`,
                background: user.preference === p.value ? 'var(--blue-50)' : 'transparent',
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="preference"
                checked={user.preference === p.value}
                onChange={() => update({ preference: p.value })}
                disabled={saving}
              />
              <span>
                <strong style={{ fontSize: 14.5 }}>{p.label}</strong>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-600)' }}>
                  {p.desc}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 24, maxWidth: 560 }}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Email notifications</h2>
        <p style={{ fontSize: 13.5, color: 'var(--ink-600)', margin: '0 0 14px' }}>
          Get a digest when scrapes find new openings. (Email delivery requires an email provider
          API key in the backend .env — logs to the server console otherwise.)
        </p>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14.5 }}>
          <input
            type="checkbox"
            checked={user.notifyEmail}
            onChange={(e) => update({ notifyEmail: e.target.checked })}
            disabled={saving}
          />
          Email me when new openings are found
        </label>
      </div>
    </>
  );
}
