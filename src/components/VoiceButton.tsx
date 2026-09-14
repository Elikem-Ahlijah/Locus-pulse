import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

interface Props {
  onFinalTranscript: (text: string) => void;
  disabled?: boolean;
}

export default function VoiceButton({ onFinalTranscript, disabled }: Props) {
  const { status, transcript, interim, error, start, stop, supported } = useSpeechRecognition({
    onFinalResult: onFinalTranscript,
  });

  if (!supported) {
    return (
      <>
        <button className="mic-button" disabled title="Voice not supported in this browser">
          🎤
        </button>
        <div className="mic-hint error">Voice input not supported. Try Chrome or Edge.</div>
      </>
    );
  }

  const listening = status === 'listening';
  const denied = status === 'denied';

  return (
    <>
      <button
        className={`mic-button ${listening ? 'listening' : ''}`}
        disabled={disabled}
        onClick={listening ? stop : start}
        aria-label={listening ? 'Stop listening' : 'Start listening'}
      >
        {listening ? '■' : '🎤'}
      </button>
      <div className="mic-hint">
        {listening ? (
          interim ? <span className="interim">"{interim}"</span> : 'Listening…'
        ) : denied ? (
          <span className="error">Mic blocked. Allow it in browser settings.</span>
        ) : error ? (
          <span className="error">{error}</span>
        ) : transcript ? (
          <span>Last: "{transcript}"</span>
        ) : (
          <span>Tap to speak. Try "morning brief" or "cedi rate today"</span>
        )}
      </div>
    </>
  );
}
