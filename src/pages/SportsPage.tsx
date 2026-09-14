import { useEffect, useState } from 'react';
import SportsCard from '../components/SportsCard';
import type { SportsFixture } from '../types';

const LEAGUES = [
  { key: 'all', label: 'All' },
  { key: 'GPL', label: 'Ghana PL' },
  { key: 'EPL', label: 'EPL' },
  { key: 'La Liga', label: 'La Liga' },
  { key: 'AFCON', label: 'AFCON' },
];

export default function SportsPage() {
  const [league, setLeague] = useState<string>('all');
  const [fixtures, setFixtures] = useState<SportsFixture[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
  }, [league]);

  async function load() {
    setLoading(true);
    try {
      const url = league === 'all' ? '/api/fixtures?limit=50' : `/api/fixtures?league=${encodeURIComponent(league)}&limit=20`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as { fixtures: SportsFixture[] };
        setFixtures(data.fixtures ?? []);
      } else {
        setFixtures([]);
      }
    } catch {
      setFixtures([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="hero-text">
        <h1>Sports</h1>
        <p>Fixtures, results, and live scores.</p>
      </div>

      <div className="nav-tabs" style={{ padding: '0 0 12px 0', borderBottom: 'none' }}>
        {LEAGUES.map((l) => (
          <button
            key={l.key}
            className={`nav-tab ${league === l.key ? 'active' : ''}`}
            onClick={() => setLeague(l.key)}
          >
            {l.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state"><div className="icon">⏳</div>Loading…</div>
      ) : fixtures.length === 0 ? (
        <div className="empty-state">
          <div className="icon">⚽</div>
          No fixtures cached yet.
          <br />
          <small>Weekly refresh: Sunday 03:00 UTC. Live updates every 6h.</small>
        </div>
      ) : (
        fixtures.map((f) => <SportsCard key={f.id} fixture={f} />)
      )}
    </>
  );
}
