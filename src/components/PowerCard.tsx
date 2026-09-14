import type { PowerOutage } from '../types';

export default function PowerCard({ outage }: { outage: PowerOutage }) {
  const start = new Date(outage.outageStartUtc);
  const end = new Date(outage.outageEndUtc);
  const fmt = (d: Date) => d.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 600 }}>{outage.area}</div>
        <span className="tag">{outage.region}</span>
      </div>
      <div className="desc">
        {fmt(start)} → {fmt(end)}
        {outage.reason && ` — ${outage.reason}`}
      </div>
    </div>
  );
}
