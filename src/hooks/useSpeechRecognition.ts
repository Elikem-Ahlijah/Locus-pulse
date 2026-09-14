/**
 * useSpeechRecognition — Web Speech API wrapper (en-US, one utterance at a time)
 *
 * Pattern lifted from LocusGo. Same proven shape:
 * - Pre-initialized on mount for instant first-tap
 * - Returns interim + final results
 * - Handles 'no-speech', 'not-allowed' (mic denied), generic errors
 * - Continuous: false (one utterance per call)
 *
 * Browser support: Chrome + Edge full, Safari partial, Firefox no.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type SpeechStatus = 'idle' | 'listening' | 'denied' | 'unavailable' | 'error';

export interface UseSpeechRecognitionOptions {
  lang?: string;
  onFinalResult?: (transcript: string) => void;
}

export interface UseSpeechRecognitionReturn {
  status: SpeechStatus;
  transcript: string;       // latest final transcript
  interim: string;          // live interim
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
  supported: boolean;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const { lang = 'en-US', onFinalResult } = options;

  const recognitionRef = useRef<any>(null);
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Build recognition once on mount (so first start is instant)
  useEffect(() => {
    if (!supported) {
      setStatus('unavailable');
      return;
    }
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatus('listening');
      setError(null);
      setInterim('');
    };

    recognition.onresult = (event: any) => {
      let final = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) setInterim(interim);
      if (final) {
        setTranscript((prev) => (prev ? prev + ' ' : '') + final.trim());
        setInterim('');
        if (onFinalResult) onFinalResult(final.trim());
      }
    };

    recognition.onerror = (event: any) => {
      const err = event.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setStatus('denied');
        setError('Microphone access denied. Please allow it in your browser settings.');
      } else if (err === 'no-speech') {
        setStatus('idle');
        setError("Didn't catch that. Try again.");
      } else {
        setStatus('error');
        setError(`Speech error: ${err}`);
      }
    };

    recognition.onend = () => {
      setStatus((s) => (s === 'listening' ? 'idle' : s));
    };

    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.abort();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current || status === 'listening') return;
    try {
      recognitionRef.current.start();
    } catch (e) {
      // start() throws if already started; ignore
    }
  }, [status]);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {}
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setInterim('');
    setError(null);
  }, []);

  return { status, transcript, interim, error, start, stop, reset, supported };
}
