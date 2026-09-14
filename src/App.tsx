import { Routes, Route, NavLink, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import HomePage from './pages/HomePage';
import NewsPage from './pages/NewsPage';
import SportsPage from './pages/SportsPage';
import EntertainmentPage from './pages/EntertainmentPage';
import FxPage from './pages/FxPage';
import { fetchQuota } from './services/llmService';
import { QUOTA_DAILY_LIMIT, type QuotaStatus } from './types';

export default function App() {
  const [quota, setQuota] = useState<QuotaStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const q = await fetchQuota();
      if (mounted) setQuota(q);
    };
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  const remaining = quota?.queriesRemaining ?? QUOTA_DAILY_LIMIT;
  const usedPct = quota ? (quota.queriesUsed / quota.dailyLimit) * 100 : 0;
  const quotaClass = remaining === 0 ? 'zero' : usedPct >= 60 ? 'low' : '';

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">
          <span className="brand-mark">L</span>
          <span>Locus Pulse</span>
        </Link>
        <div className={`quota-pill ${quotaClass}`} title="Daily voice query limit">
          {remaining > 0 ? `${remaining} left` : 'Limit reached'}
        </div>
      </header>

      <nav className="nav-tabs">
        <NavLink to="/" end className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
          Brief
        </NavLink>
        <NavLink to="/news" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
          News
        </NavLink>
        <NavLink to="/sports" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
          Sports
        </NavLink>
        <NavLink to="/entertainment" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
          Shows
        </NavLink>
        <NavLink to="/fx" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
          FX & More
        </NavLink>
      </nav>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage onQuotaChange={setQuota} />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/sports" element={<SportsPage />} />
          <Route path="/entertainment" element={<EntertainmentPage />} />
          <Route path="/fx" element={<FxPage />} />
        </Routes>
      </main>
    </div>
  );
}
