import { useEffect, useState } from 'react';
import FuelCard from '../components/FxCard';
import PowerCard from '../components/PowerCard';
import type { FuelPrice, PowerOutage } from '../types';

interface FxPageData {
  fuel: FuelPrice[];
  power: PowerOutage[];
  fx: { [k: string]: number } | null;
}

export default function FxPage() {
  const [data, setData] = useState<FxPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [convInput, setConvInput] = useState('100');
  const [convFrom, setConvFrom] = useState('USD');
  const [convResult, setConvResult] = useState<number | null>(null);
  const [convError, setConvError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/brief');
      if (res.ok) {
        const data = (await res.json()) as { sections: { fuel: FuelPrice[]; power: PowerOutage[]; fx: { [k: string]: number } | null } };
        setData({
          fuel: data.sections.fuel ?? [],
          power: data.sections.power ?? [],
          fx: data.sections.fx ?? null,
        });
      }
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }

  async function convert(e: React.FormEvent) {
    e.preventDefault();
    setConverting(true);
    setConvError(null);
    try {
      const res = await fetch(
        `/api/convert?amount=${convInput}&from=${convFrom}&to=GHS`
      );
      const data = (await res.json()) as { converted?: number; error?: string };
      if (res.ok) {
        setConvResult(data.converted ?? null);
      } else {
        setConvError(data.error ?? 'Conversion failed');
      }
    } catch (e: any) {
      setConvError(e?.message ?? 'Failed');
    } finally {
      setConverting(false);
    }
  }

  return (
    <>
      <div className="hero-text">
        <h1>FX & utilities</h1>
        <p>Daily essentials for life in Ghana.</p>
      </div>

      <div className="section">
        <div className="section-header"><span className="dot" /> Convert currency</div>
        <form onSubmit={convert} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input
            type="number"
            value={convInput}
            onChange={(e) => setConvInput(e.target.value)}
            placeholder="Amount"
            style={inputStyle}
            min="0"
          />
          <select value={convFrom} onChange={(e) => setConvFrom(e.target.value)} style={selectStyle}>
            <option>USD</option>
            <option>EUR</option>
            <option>GBP</option>
            <option>NGN</option>
            <option>CAD</option>
          </select>
          <button type="submit" disabled={converting} style={buttonStyle}>
            → GHS
          </button>
        </form>
        {convResult !== null && (
          <div className="kpi" style={{ maxWidth: 240 }}>
            <div className="label">{convInput} {convFrom}</div>
            <div className="value">GHS {convResult.toFixed(2)}</div>
            <div className="sub">Bank of Ghana rate</div>
          </div>
        )}
        {convError && <div className="empty-state" style={{ padding: 8, color: 'var(--red-bright)' }}>{convError}</div>}
      </div>

      {data && (
        <>
          {data.fuel.length > 0 && (
            <div className="section">
              <div className="section-header"><span className="dot" /> Fuel prices (NPA)</div>
              <FuelCard fuels={data.fuel} />
            </div>
          )}

          {data.power.length > 0 && (
            <div className="section">
              <div className="section-header"><span className="dot" /> ECG outages today</div>
              {data.power.slice(0, 10).map((o, i) => (
                <PowerCard key={i} outage={o} />
              ))}
            </div>
          )}

          {!data.fuel.length && !data.power.length && !loading && (
            <div className="empty-state">
              <div className="icon">📊</div>
              Daily essentials aren't cached yet. Daily refresh at 06:00 UTC.
            </div>
          )}
        </>
      )}

      {loading && <div className="empty-state"><div className="icon">⏳</div>Loading…</div>}
    </>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 14px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 15,
  fontFamily: 'inherit',
};

const selectStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 15,
  fontFamily: 'inherit',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 16px',
  background: 'var(--gold)',
  color: '#000',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 700,
  fontSize: 14,
};
