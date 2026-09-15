import { useEffect, useRef, useState } from 'react';
import VoiceButton from '../components/VoiceButton';
import { askLocus } from '../services/llmService';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import type { LlmToolCall, QuotaStatus } from '../types';
import WelcomeCard from '../components/WelcomeCard';
import ConversationTurn from '../components/ConversationTurn';

interface Props {
  onQuotaChange?: (q: QuotaStatus | null) => void;
}

interface Turn {
  id: string;
  question: string;
  answer: string;
  toolCalls: LlmToolCall[];
  timestamp: number;
  loading?: boolean;
  error?: string | null;
}

const WELCOME_SEEN_KEY = 'locus_pulse_welcome_seen';

const STARTER_CHIPS = [
  { icon: '🌅', label: 'Morning brief', query: 'give me the morning brief' },
  { icon: '💵', label: 'Cedi rate', query: 'what is the cedi rate today' },
  { icon: '⛽', label: 'Fuel prices', query: 'petrol price today' },
  { icon: '⚡', label: 'Power today', query: 'any power cuts today' },
  { icon: '⚽', label: 'Black Stars', query: 'how did Black Stars play' },
  { icon: '🎬', label: 'Tonight in cinemas', query: 'what movies are in cinemas tonight' },
  { icon: '☀️', label: "Today's numbers", query: 'give me today\'s numbers — cedi, fuel, power' },
  { icon: '🔁', label: 'Convert', query: 'convert 100 dollars to cedis' },
];

export default function HomePage({ onQuotaChange }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputValue, setTextInputValue] = useState('');
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(WELCOME_SEEN_KEY) !== '1';
  });

  const { speak, speaking, cancel } = useSpeechSynthesis();
  const timelineEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  // Auto-scroll to latest turn on change
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, pendingQuery]);

  function dismissWelcome() {
    setShowWelcome(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(WELCOME_SEEN_KEY, '1');
    }
  }

  function submitQuery(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    setPendingQuery(null);
    setTextInputValue('');
    setShowTextInput(false);
    if (showWelcome) dismissWelcome();

    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const turn: Turn = {
      id,
      question: trimmed,
      answer: '',
      toolCalls: [],
      timestamp: Date.now(),
      loading: true,
    };
    setTurns((prev) => [...prev, turn]);
    void runQuery(id, trimmed);
  }

  async function runQuery(id: string, query: string) {
    cancel();
    try {
      const res = await askLocus(query);
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                answer: res.text,
                toolCalls: res.toolCalls,
                loading: false,
                error: null,
              }
            : t
        )
      );
      onQuotaChange?.(res.quota);
      // Find the index of this turn and only speak if it's still the latest
      setTurns((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx === prev.length - 1) speak(res.text);
        return prev;
      });
    } catch (e: any) {
      const msg = e?.message ?? 'Something went wrong';
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                answer: `Sorry — ${msg}. Try again, or ask something else.`,
                loading: false,
                error: msg,
              }
            : t
        )
      );
    }
  }

  function replayTurn(turn: Turn) {
    if (turn.answer) speak(turn.answer);
  }

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

  function clearConversation() {
    cancel();
    setTurns([]);
  }

  const hasTurns = turns.length > 0;

  return (
    <>
      {/* Compact header: greeting + clear-session link */}
      <header className="page-header" aria-label="Today">
        <div className="page-header-row">
          <div>
            <div className="page-greeting">
              {hasTurns ? 'Still here. Ask me more.' : 'What do you want to know?'}
            </div>
          </div>
          {hasTurns && (
            <button
              className="quiet-link"
              onClick={clearConversation}
              aria-label="Clear conversation"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      {/* Welcome card — first visit only */}
      {showWelcome && !hasTurns && <WelcomeCard onDismiss={dismissWelcome} />}

      {/* Conversation timeline */}
      {hasTurns && (
        <div className="timeline" role="log" aria-live="polite" aria-label="Conversation">
          {turns.map((t) => (
            <ConversationTurn
              key={t.id}
              question={t.question}
              answer={t.answer || (t.loading ? 'Thinking…' : '')}
              toolCalls={t.toolCalls}
              speaking={speaking && turns[turns.length - 1]?.id === t.id}
              timestamp={t.timestamp}
              onReplay={() => replayTurn(t)}
              onStop={cancel}
              onFollowUp={(q) => submitQuery(q)}
              onShare={() => shareAnswer(t)}
              onSave={() => saveAnswer(t)}
            />
          ))}
          <div ref={timelineEndRef} />
        </div>
      )}

      {/* Pending voice transcript — confirm before sending */}
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
            <button className="edit-btn" onClick={cancelPending} aria-label="Cancel">
              ✕
            </button>
          </div>
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

/* -------- helpers -------- */

function shareAnswer(turn: Turn) {
  if (typeof navigator === 'undefined' || !navigator.share) {
    // Fall back to clipboard
    navigator.clipboard?.writeText(`${turn.question}\n\n${turn.answer}`).catch(() => {});
    return;
  }
  navigator.share({
    text: `${turn.question}\n\n${turn.answer}`,
    title: 'Locus Pulse',
  }).catch(() => {});
}

function saveAnswer(turn: Turn) {
  if (typeof window === 'undefined') return;
  const key = 'locus_pulse_saved';
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  existing.push({
    question: turn.question,
    answer: turn.answer,
    timestamp: turn.timestamp,
  });
  localStorage.setItem(key, JSON.stringify(existing));
}
