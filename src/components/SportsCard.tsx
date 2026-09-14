import type { SportsFixture } from '../types';

export default function SportsCard({ fixture }: { fixture: SportsFixture }) {
  const time = new Date(fixture.kickoffUtc);
  const statusStr = String(fixture.status);
  const isFinished = statusStr === 'FT' || statusStr === 'finished' || statusStr === 'AET' || statusStr === 'PEN';
  const isLive = fixture.isLive;
  const isUpcoming = statusStr === 'NS' || statusStr === 'scheduled';

  const statusLabel = isLive ? 'LIVE' : isFinished ? 'FT' : time.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="tag gold">{fixture.league}</span>
        <span className={`fixture-row status ${isLive ? 'live' : isFinished ? 'ft' : 'upcoming'}`}>
          {isLive && <span className="tag live">LIVE</span>}
          {statusLabel}
        </span>
      </div>
      <div className="fixture-row" style={{ borderBottom: 'none', padding: 0 }}>
        <div className="team">{fixture.homeTeam}</div>
        {(isFinished || isLive) ? (
          <div className="score">
            {fixture.homeScore ?? 0} – {fixture.awayScore ?? 0}
          </div>
        ) : (
          <div className="score" style={{ color: 'var(--text-muted)' }}>vs</div>
        )}
        <div className="team away">{fixture.awayTeam}</div>
      </div>
      {fixture.venue && <div className="desc" style={{ fontSize: 12 }}>{fixture.venue}</div>}
    </div>
  );
}
