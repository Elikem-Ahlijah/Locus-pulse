/**
 * WelcomeCard — first-visit introduction from the agent.
 *
 * Shows what Locus can do + the starter prompts. Dismisses once the user
 * makes their first query (state held in HomePage).
 */

interface Props {
  onDismiss?: () => void;
}

const CAPABILITIES: { icon: string; label: string; example: string }[] = [
  { icon: '💵', label: 'Exchange rates', example: '"cedi rate today"' },
  { icon: '⛽', label: 'Fuel prices', example: '"petrol price"' },
  { icon: '⚡', label: 'Power schedule', example: '"power cuts in Tema today"' },
  { icon: '📰', label: 'Ghana news', example: '"what happened yesterday"' },
  { icon: '⚽', label: 'Sports scores', example: '"did Kotoko win?"' },
  { icon: '🎬', label: 'Movies in cinemas', example: '"what is playing tonight"' },
  { icon: '🌤️', label: 'Weather', example: '"weather in Accra"' },
  { icon: '🔁', label: 'Convert any currency', example: '"100 dollars in cedis"' },
];

export default function WelcomeCard({ onDismiss }: Props) {
  return (
    <section className="welcome-card" role="region" aria-label="Welcome">
      <div className="welcome-header">
        <span className="welcome-avatar" aria-hidden="true">L</span>
        <div>
          <div className="welcome-name">Hey — I'm Locus.</div>
          <div className="welcome-sub">
            I keep up with Ghana for you. Ask me anything or pick a starter below.
          </div>
        </div>
      </div>

      <ul className="capabilities" aria-label="What Locus can do">
        {CAPABILITIES.map((c) => (
          <li key={c.label}>
            <span className="cap-icon" aria-hidden="true">{c.icon}</span>
            <span className="cap-label">{c.label}</span>
            <span className="cap-example">{c.example}</span>
          </li>
        ))}
      </ul>

      {onDismiss && (
        <button className="welcome-dismiss" onClick={onDismiss} aria-label="Dismiss welcome card">
          Got it
        </button>
      )}
    </section>
  );
}
