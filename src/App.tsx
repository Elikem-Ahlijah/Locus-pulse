import { Routes, Route, Link } from 'react-router-dom';
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
        <Link to="/" className="brand" aria-label="Locus Pulse home">
          <span className="brand-mark">L</span>
          <span>Locus</span>
        </Link>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link
            to="/news"
            className="quiet-link"
            title="All Ghana news"
            aria-label="Browse all news"
          >
            News
          </Link>
          <Link
            to="/sports"
            className="quiet-link"
            title="All sports"
            aria-label="Browse sports"
          >
            Sports
          </Link>
          <Link
            to="/fx"
            className="quiet-link"
            title="Money and power"
            aria-label="Browse money and power"
          >
            Money
          </Link>
          <span
            className={`quota-pill ${quotaClass}`}
            title="Daily voice query limit"
          >
            {remaining > 0 ? `${remaining} left` : 'Limit reached'}
          </span>
        </div>
      </header>

      <main className="app-main" id="main-content" role="main">
        <Routes>
          <Route path="/" element={<HomePage onQuotaChange={setQuota} />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/sports" element={<SportsPage />} />
          <Route path="/entertainment" element={<EntertainmentPage />} />
          <Route path="/fx" element={<FxPage />} />
          <Route path="*" element={<HomePage onQuotaChange={setQuota} />} />
        </Routes>
      </main>
    </div>
  );
}
