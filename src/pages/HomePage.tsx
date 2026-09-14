import { useEffect, useState } from 'react';
import VoiceButton from '../components/VoiceButton';
import NewsCard from '../components/NewsCard';
import SportsCard from '../components/SportsCard';
import FuelCard from '../components/FxCard';
import PowerCard from '../components/PowerCard';
import EntertainmentCard from '../components/EntertainmentCard';
import { askLocus, fetchQuota } from '../services/llmService';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import type { Article, SportsFixture, FuelPrice, PowerOutage, Movie, QuotaStatus, LlmToolCall } from '../types';

interface Props {
  onQuotaChange?: (q: QuotaStatus | null) => void;
}

interface BriefData {
  date: string;
  sections: {
    ghana_news: Article[];
    sports: Article[];
    fx: { [k: string]: number } | null;
    fuel: FuelPrice[];
    power: PowerOutage[];
    movies: Movie[];
  };
  hasData: { [k: string]: boolean };
  generatedAt: number;
}

export default function HomePage({ onQuotaChange }: Props) {
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [agentText, setAgentText] = useState<string>('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [toolTrace, setToolTrace] = useState<LlmToolCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { speak, speaking, cancel } = useSpeechSynthesis();

  useEffect(() => {
    loadBrief();
  }, []);

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  async function loadBrief() {
    try {
      const res = await fetch('/api/brief');
      if (!res.ok) return;
      const data = (await res.json()) as BriefData;
      setBrief(data);
    } catch (e) {
      // silent — page can still work via voice
    }
  }

  async function handleQuery(query: string) {
    if (!query.trim()) return;
    setError(null);
    setAgentLoading(true);
    setAgentText('');
    setToolTrace([]);
    cancel();
    try {
      const res = await askLocus(query);
      setAgentText(res.text);
      setToolTrace(res.toolCalls);
      onQuotaChange?.(res.quota);
      speak(res.text);
    } catch (e: any) {
      const msg = e?.message ?? 'Something went wrong';
      setError(msg);
      setAgentText(`Sorry — ${msg}. Try again.`);
    } finally {
      setAgentLoading(false);
    }
  }

  async function refreshQuota() {
    const q = await fetchQuota();
    onQuotaChange?.(q);
  }

  return (
    <>
      <div className="hero-text">
        <h1>Today's brief, spoken.</h1>
        <p>News, sports, FX, fuel, power. Ask anything.</p>
      </div>

      {agentText && (
        <div className={`speaking-bubble ${agentLoading ? 'loading' : ''}`}>
          {agentText}
        </div>
      )}

      {error && (
        <div className="speaking-bubble" style={{ borderColor: 'var(--red)' }}>
          <span style={{ color: 'var(--red-bright)' }}>{error}</span>
        </div>
      )}

      {toolTrace.length > 0 && (
        <div className="section">
          <div className="section-header"><span className="dot" /> Locus checked</div>
          {toolTrace.map((t, i) => (
            <div key={i} className="card" style={{ fontSize: 13 }}>
              <code style={{ color: 'var(--gold)' }}>{t.name}</code>
              <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                {summarizeArgs(t.arguments)}
              </span>
            </div>
          ))}
        </div>
      )}

      {brief && (
        <>
          <FxKpiRow fx={brief.sections.fx} />
          {brief.sections.fuel.length > 0 && (
            <div className="section">
              <div className="section-header"><span className="dot" /> Fuel prices</div>
              <FuelCard fuels={brief.sections.fuel} />
            </div>
          )}

          {brief.sections.ghana_news.length > 0 && (
            <div className="section">
              <div className="section-header">
                <span className="dot" /> Top stories — Ghana
              </div>
              {brief.sections.ghana_news.slice(0, 3).map((a) => (
                <NewsCard key={a.id} article={a} />
              ))}
            </div>
          )}

          {brief.sections.sports.length > 0 && (
            <div className="section">
              <div className="section-header"><span className="dot" /> Sports</div>
              {brief.sections.sports.slice(0, 3).map((a) => (
                <NewsCard key={a.id} article={a} />
              ))}
            </div>
          )}

          {brief.sections.movies.length > 0 && (
            <div className="section">
              <div className="section-header"><span className="dot" /> In cinemas</div>
              {brief.sections.movies.slice(0, 3).map((m) => (
                <EntertainmentCard key={m.tmdbId} movie={m} />
              ))}
            </div>
          )}

          {brief.sections.power.length > 0 && (
            <div className="section">
              <div className="section-header">
                <span className="dot" /> Power schedule today
              </div>
              {brief.sections.power.slice(0, 4).map((o, i) => (
                <PowerCard key={i} outage={o} />
              ))}
            </div>
          )}
        </>
      )}

      {!brief && !agentLoading && (
        <div className="empty-state">
          <div className="icon">📡</div>
          Loading today's brief…
          <br />
          <small>(Daily refresh at 06:00 UTC. If empty, the daily cron hasn't run yet.)</small>
        </div>
      )}

      <div style={{ height: 60 }} />

      <div className="app-bottom">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <VoiceButton onFinalTranscript={handleQuery} />
          {speaking && (
            <button
              onClick={cancel}
              style={{
                marginTop: 8,
                fontSize: 11,
                color: 'var(--text-muted)',
                textDecoration: 'underline',
              }}
            >
              stop speaking
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function summarizeArgs(args: any): string {
  if (!args) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (v == null || v === '') continue;
    parts.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
  return parts.slice(0, 3).join(' · ');
}

function FxKpiRow({ fx }: { fx: { [k: string]: number } | null }) {
  if (!fx || !fx.GHS) {
    return (
      <div className="section">
        <div className="section-header"><span className="dot" /> Exchange rates</div>
        <div className="empty-state" style={{ padding: 16 }}>No FX data yet today.</div>
      </div>
    );
  }
  return (
    <div className="section">
      <div className="section-header"><span className="dot" /> Exchange rates (vs GHS)</div>
      <div className="kpi-row three">
        {fx.USD && (
          <div className="kpi">
            <div className="label">1 USD</div>
            <div className="value">{fx.USD.toFixed(2)}</div>
            <div className="sub">cedis</div>
          </div>
        )}
        {fx.EUR && (
          <div className="kpi">
            <div className="label">1 EUR</div>
            <div className="value">{fx.EUR.toFixed(2)}</div>
            <div className="sub">cedis</div>
          </div>
        )}
        {fx.GBP && (
          <div className="kpi">
            <div className="label">1 GBP</div>
            <div className="value">{fx.GBP.toFixed(2)}</div>
            <div className="sub">cedis</div>
          </div>
        )}
      </div>
    </div>
  );
}
