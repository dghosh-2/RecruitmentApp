import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Preference } from '../api/types';

const PREFERENCES: { value: Preference; label: string }[] = [
  { value: 'internship', label: 'Internships' },
  { value: 'full_time', label: 'Full-time' },
  { value: 'both', label: 'Both' },
];

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [preference, setPreference] = useState<Preference>('both');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email, password, preference);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          recruiter<span>pro</span>_
        </div>
        <h1>Create your account</h1>
        <p className="sub">Tell us what you're hunting for.</p>
        {error && <div className="form-error">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password (8+ characters)</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="field">
            <label>I'm looking for</label>
            <div className="seg">
              {PREFERENCES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={preference === p.value ? 'active' : ''}
                  onClick={() => setPreference(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? <span className="spinner" /> : 'Create account'}
          </button>
        </form>
        <p style={{ fontSize: 14, marginTop: 18, color: 'var(--ink-600)' }}>
          Already registered? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
