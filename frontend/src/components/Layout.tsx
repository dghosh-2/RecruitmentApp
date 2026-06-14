import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { listingApi } from '../api/endpoints';

export function Layout() {
  const { user, logout } = useAuth();
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listingApi
        .list({ status: 'new', applyPreference: true })
        .then((res) => {
          if (!cancelled) setNewCount(res.listings.length);
        })
        .catch(() => {});
    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          recruiter<span>pro</span>_
        </div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>
            Dashboard
          </NavLink>
          <NavLink to="/inbox" className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>
            New Jobs
            {newCount > 0 && <span className="nav-badge">{newCount}</span>}
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}
          >
            Settings
          </NavLink>
        </nav>
        <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink-400)' }}>
          {user?.email}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={logout}>
          Log out
        </button>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
