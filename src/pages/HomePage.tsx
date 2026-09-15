import { useEffect, useMemo, useState } from 'react';
import VoiceButton from '../components/VoiceButton';
import NewsCard from '../components/NewsCard';
import SportsCard from '../components/SportsCard';
import FuelCard from '../components/FxCard';
import PowerCard from '../components/PowerCard';
import EntertainmentCard from '../components/EntertainmentCard';
import { askLocus, fetchQuota } from '../services/llmService';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import type {
  Article,
  SportsFixture,
  FuelPrice,
  PowerOutage,
  Movie,
  QuotaStatus,
  LlmToolCall,
} from '../types';

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

const STARTER_CHIPS = [
  { icon: '🌅', label: 'Morning brief', query: 'give me the morning brief' },
  { icon: '💵', label: 'Cedi rate', query: 'what is the cedi rate today' },
  { icon: '⛽', label: 'Fuel prices', query: 'petrol price today' },
  { icon: '⚡', label: 'Power today', query: 'power cuts today' },
  { icon: '⚽', label: 'Black Stars', query: 'how did Black Stars play' },
  { icon: '🎬', label: 'Movies tonight', query: 'what movies are in cinemas' },
  { icon: '☀️', label: 'Weather Accra', query: 'weather in Accra' },
  { icon: '🔁', label: 'Convert', query: 'convert 100 dollars to cedis' },
];

export default function HomePage({ onQuotaChange }: Props) {
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [agentText, setAgentText] = useState<string>('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [toolTrace, setToolTrace] = useState<LlmToolCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputValue, setTextInputValue] = useState('');
  const [freshness, setFreshness] = useState<{
    isFresh: boolean;
    label: string;
  } | null>(null);
  const { speak, speaking, cancel } = useSpeechSynthesis();

  useEffect(() => {
    loadBrief();
  }, []);

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  function computeFreshness(generatedAt: number) {
    const ms = Date.now() - generatedAt;
    const mins = Math.floor(ms / 60_000);
    const hours = Math.floor(mins / 60);
    if (mins < 30) return { isFresh: true, label: `Updated ${mins || 1}m ago` };
    if (mins < 120) return { isFresh: true, label: `Updated ${mins}m ago` };
    if (hours < 6) return { isFresh: false, label: `Updated ${hours}h ago` };
    return { isFresh: false, label: `Stale — ${hours}h old` };
  }

  async function loadBrief() {
    try {
      const res = await fetch('/api/brief');
      if (!res.ok) return;
      const data = (await res.json()) as BriefData;
      setBrief(data);
      if (data.generatedAt) setFreshness(computeFreshness(data.generatedAt));
    } catch (e) {
      /* silent — page works via voice */
    }
  }

  function submitQuery(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    setPendingQuery(null);
    setTextInputValue('');
    setShowTextInput(false);
    void runQuery(trimmed);
  }

  async function runQuery(query: string) {
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

  // Called by VoiceButton when STT finishes — set pending for confirmation
  function handleVoiceTranscript(transcript: string) {
    cancel();
    setPendingQuery(transcript);
  }

  function acceptPending() {
    if (pendingQuery) submitQuery(pendingQuery);
  }

  function editPending() {
    if (!pendingQuery) return;
    setTextInputValue(pendingQuery);
    setPendingQuery(null);
    setShowTextInput(true);
  }

  function cancelPending() {
    setPendingQuery(null);
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (textInputValue.trim()) submitQuery(textInputValue);
  }

  const hasQuota = true; // keep chips enabled; backend enforces

  return (
    <>
      {/* Page header: date + freshness pill (replaces hero text) */}
      <header className="page-header" aria-label="Today">
        <div className="page-header-row">
          <div>
            <div className="page-date">{formatTodayLong()}</div>
            <div className="page-greeting">Today's brief, in your ear.</div>
          </div>
          {freshness && (
            <span
              className={`freshness-pill ${freshness.isFresh ? 'fresh' : 'stale'}`}
              title="Last data refresh time"
            >
              {freshness.label}
            </span>
          )}
        </div>
      </header>

      {/* Headline KPI strip — the most-asked data points, always visible */}
      {brief && (
        <HeadlineKpiStrip
          fuel={brief.sections.fuel}
          fx={brief.sections.fx}
          power={brief.sections.power}
        />
      )}

      {/* Heard confirmation — appears after STT finishes, before submit */}
      {pendingQuery && (
        <div className="heard-confirmation" role="status" aria-live="polite">
          <span className="label">Heard</span>
          <span className="text" title={pendingQuery}>
            "{pendingQuery}"
          </span>
          <div className="actions">
            <button className="edit-btn" onClick={editPending} aria-label="Edit query">
              Edit
            </button>
            <button className="send-btn" onClick={acceptPending} aria-label="Send query">
              Send →
            </button>
          </div>
        </div>
      )}

      {/* Speaking bubble — Locus's reply */}
      {(agentText || agentLoading) && (
        <div
          className={`speaking-bubble ${agentLoading ? 'loading' : ''}`}
          role="status"
          aria-live="polite"
        >
          <div className="speaking-bubble-header">
            <span className="speaking-bubble-avatar">L</span>
            <span className="speaking-bubble-name">Locus</span>
          </div>
          <div className="speaking-bubble-text">
            {agentText || 'Thinking…'}
          </div>
          {!agentLoading && agentText && (
            <div className="speaking-bubble-actions">
              <button
                className="speaking-bubble-action"
                onClick={() => speak(agentText)}
                aria-label="Replay"
              >
                🔁 Replay
              </button>
              {speaking && (
                <button
                  className="speaking-bubble-action"
                  onClick={cancel}
                  aria-label="Stop"
                >
                  ⏹ Stop
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="error-banner" role="alert">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Tool trace — collapsed by default */}
      {toolTrace.length > 0 && (
        <details className="tool-trace">
          <summary>
            <span>Locus checked {toolTrace.length} source{toolTrace.length > 1 ? 's' : ''}</span>
          </summary>
          <div className="tool-trace-content">
            {toolTrace.map((t, i) => (
              <div key={i} className="tool-trace-item">
                <code>{t.name}</code>
                {summarizeArgs(t.arguments) && (
                  <span style={{ color: 'var(--text-faint)', marginLeft: 8 }}>
                    · {summarizeArgs(t.arguments)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Sections: brief content */}
      {brief && (
        <>
          {brief.sections.fuel.length > 0 && (
            <div className="section">
              <div className="section-header">
                <span className="dot" /> Fuel prices
              </div>
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
              <div className="section-header">
                <span className="dot" /> Sports
              </div>
              {brief.sections.sports.slice(0, 3).map((a) => (
                <NewsCard key={a.id} article={a} />
              ))}
            </div>
          )}

          {brief.sections.movies.length > 0 && (
            <div className="section">
              <div className="section-header">
                <span className="dot" /> In cinemas
              </div>
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
          Setting up today's brief…
          <br />
          <small>(Daily refresh at 06:00 UTC.)</small>
        </div>
      )}

      {/* Bottom action bar: chip rail + mic + text input */}
      <div className="app-bottom">
        {showTextInput ? (
          <form className="text-input-wrap" onSubmit={handleTextSubmit}>
            <input
              type="text"
              className="text-input"
              placeholder="Type your question…"
              value={textInputValue}
              onChange={(e) => setTextInputValue(e.target.value)}
              autoFocus
              aria-label="Type a question"
            />
            <button
              type="submit"
              className="text-input-submit"
              disabled={!textInputValue.trim()}
            >
              Send
            </button>
            <button
              type="button"
              className="text-input-toggle"
              onClick={() => {
                setShowTextInput(false);
                setTextInputValue('');
              }}
              style={{ flex: 'none' }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <div className="chip-rail" role="toolbar" aria-label="Quick queries">
              {STARTER_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  className="chip"
                  onClick={() => submitQuery(chip.query)}
                  disabled={!hasQuota || agentLoading}
                  aria-label={`Ask: ${chip.label}`}
                >
                  <span className="chip-icon" aria-hidden="true">{chip.icon}</span>
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <VoiceButton onFinalTranscript={handleVoiceTranscript} />
              {!showTextInput && (
                <button
                  className="text-input-toggle"
                  onClick={() => setShowTextInput(true)}
                >
                  Type instead
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* --------------------------------- helpers --------------------------------- */

function formatTodayLong(): string {
  const d = new Date();
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function summarizeArgs(args: any): string {
  if (!args) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (v == null || v === '') continue;
    parts.push(
      `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`
    );
  }
  return parts.slice(0, 3).join(' · ');
}

/* Headline KPI strip — the 4 most-asked data points */
function HeadlineKpiStrip({
  fuel,
  fx,
  power,
}: {
  fuel: FuelPrice[];
  fx: { [k: string]: number } | null;
  power: PowerOutage[];
}) {
  const petrol = useMemo(
    () => fuel.find((f) => f.fuelType === 'petrol') ?? fuel[0],
    [fuel]
  );
  const usd = fx?.USD ? Number(fx.USD.toFixed(2)) : null;
  const powerCount = power.length;

  return (
    <div className="kpi-strip" aria-label="Today's headlines">
      <div className="kpi-tile">
        <span className="icon" aria-hidden="true">⛽</span>
        <span className="label">Petrol / Litre</span>
        {petrol ? (
          <>
            <span className="value">GHS {petrol.priceGhs.toFixed(2)}</span>
            <span className="delta flat">{petrol.fuelType}</span>
          </>
        ) : (
          <span className="value loading">—</span>
        )}
      </div>

      <div className="kpi-tile">
        <span className="icon" aria-hidden="true">💵</span>
        <span className="label">$1 = GHS</span>
        {usd != null ? (
          <>
            <span className="value">{usd.toFixed(2)}</span>
            <span className="delta flat">Bank of Ghana</span>
          </>
        ) : (
          <span className="value loading">—</span>
        )}
      </div>

      <div className="kpi-tile">
        <span className="icon" aria-hidden="true">⚡</span>
        <span className="label">Power today</span>
        {powerCount > 0 ? (
          <>
            <span className="value">{powerCount}</span>
            <span className="delta flat">scheduled outages</span>
          </>
        ) : (
          <>
            <span className="value" style={{ color: 'var(--positive)' }}>✓</span>
            <span className="delta flat">no outages reported</span>
          </>
        )}
      </div>

      <div className="kpi-tile">
        <span className="icon" aria-hidden="true">🇬🇭</span>
        <span className="label">Stories today</span>
        <span className="value">—</span>
        <span className="delta flat">tap a chip below</span>
      </div>
    </div>
  );
}
