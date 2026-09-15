/**
 * ConversationTurn — one Question + one Answer card, as a single row
 * in the conversation timeline.
 *
 * Question is right-aligned, neutral surface.
 * Answer is left-aligned, primary surface, with Locus avatar + name +
 * tool chips + actions + follow-up chips.
 */

import type { LlmToolCall } from '../types';
import { suggestFollowUps } from '../lib/followUps';

interface Props {
  question: string;
  answer: string;
  toolCalls: LlmToolCall[];
  speaking?: boolean;
  onReplay?: () => void;
  onStop?: () => void;
  onFollowUp?: (query: string) => void;
  onSave?: () => void;
  onShare?: () => void;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h === 1) return '1 hour ago';
  return `${h} hours ago`;
}

export default function ConversationTurn({
  question,
  answer,
  toolCalls,
  speaking,
  onReplay,
  onStop,
  onFollowUp,
  onSave,
  onShare,
  timestamp,
}: Props & { timestamp: number }) {
  const toolNames = toolCalls.map((t) => t.name);
  const followUps = suggestFollowUps(toolNames);

  return (
    <article className="turn" aria-label={`Turn at ${relativeTime(timestamp)}`}>
      {/* User question (right-aligned, neutral) */}
      <div className="turn-user" role="article" aria-label="Your question">
        <div className="turn-bubble turn-bubble--user">
          <span className="turn-text">{question}</span>
        </div>
        <div className="turn-meta turn-meta--user">{relativeTime(timestamp)}</div>
      </div>

      {/* Locus answer (left-aligned, primary) */}
      <div className="turn-locus" role="article" aria-label="Locus answer">
        <span className="turn-avatar" aria-hidden="true">L</span>
        <div className="turn-bubble turn-bubble--locus">
          <div className="turn-locus-header">
            <span className="turn-locus-name">Locus</span>
            {toolNames.length > 0 && (
              <div className="turn-tools" role="list" aria-label="Tools used">
                {toolNames.map((n, i) => (
                  <span key={i} className="turn-tool-chip" role="listitem">
                    {n.replace(/^get_/, '').replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="turn-text turn-text--answer">{answer}</div>
          <div className="turn-actions">
            {onReplay && (
              <button className="turn-action" onClick={onReplay} aria-label="Replay answer">
                🔁 Replay
              </button>
            )}
            {onStop && speaking && (
              <button className="turn-action" onClick={onStop} aria-label="Stop speaking">
                ⏹ Stop
              </button>
            )}
            {onShare && (
              <button className="turn-action" onClick={onShare} aria-label="Share answer">
                📤 Share
              </button>
            )}
            {onSave && (
              <button className="turn-action" onClick={onSave} aria-label="Save answer">
                🔖 Save
              </button>
            )}
          </div>
          {onFollowUp && (
            <div className="turn-followups" role="group" aria-label="Follow-up questions">
              {followUps.map((f) => (
                <button
                  key={f.label}
                  className="turn-followup-chip"
                  onClick={() => onFollowUp(f.query)}
                  aria-label={`Follow up: ${f.label}`}
                >
                  <span aria-hidden="true">{f.icon}</span>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
