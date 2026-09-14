/**
 * useSpeechSynthesis — Web Speech API wrapper for TTS output
 *
 * Pattern lifted from LocusGo:
 * - Cancellation token pattern: each speak() mints a token, pre-empted calls return silently
 * - Picks best available English voice
 * - Per-call char limit awareness (none for browser API, but we chunk in our service)
 *
 * Browser support: All modern browsers (Chrome, Edge, Safari, Firefox).
 * For higher quality, the LLM service proxies to MiniMax T2A first.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseSpeechSynthesisOptions {
  /** Preferred voice names (in order). Defaults to en-GB → en-US → any en-* */
  preferredVoiceNames?: string[];
  /** Preferred voice langs (in order). */
  preferredLangs?: string[];
  /** Female voice preferred (more natural for daily brief) */
  preferFemale?: boolean;
}

export interface UseSpeechSynthesisReturn {
  speak: (text: string) => void;
  cancel: () => void;
  speaking: boolean;
  supported: boolean;
  voices: SpeechSynthesisVoice[];
}

const DEFAULT_OPTS: Required<UseSpeechSynthesisOptions> = {
  preferredVoiceNames: [],
  preferredLangs: ['en-GB', 'en-US', 'en-NG'],
  preferFemale: true,
};

export function useSpeechSynthesis(
  options: UseSpeechSynthesisOptions = {}
): UseSpeechSynthesisReturn {
  const opts = { ...DEFAULT_OPTS, ...options };
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const tokenRef = useRef(0);

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!supported) return;
    const updateVoices = () => {
      const all = window.speechSynthesis.getVoices();
      setVoices(all);
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [supported]);

  const pickVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (voices.length === 0) return null;
    const lower = (s: string) => s.toLowerCase();

    // 1. By name
    for (const name of opts.preferredVoiceNames) {
      const v = voices.find((v) => lower(v.name) === lower(name));
      if (v) return v;
    }
    // 2. By lang + gender
    for (const lang of opts.preferredLangs) {
      const candidates = voices.filter((v) => v.lang === lang || v.lang.startsWith(lang + '-'));
      if (candidates.length === 0) continue;
      if (opts.preferFemale) {
        const female = candidates.find((v) => /female|samantha|victoria|karen|kate|fiona/i.test(v.name));
        if (female) return female;
      }
      return candidates[0];
    }
    // 3. Any English voice
    const anyEn = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
    if (anyEn) return anyEn;
    // 4. First available
    return voices[0] ?? null;
  }, [voices, opts.preferredVoiceNames, opts.preferredLangs, opts.preferFemale]);

  const cancel = useCallback(() => {
    if (!supported) return;
    tokenRef.current++;
    try {
      window.speechSynthesis.cancel();
    } catch {}
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text) return;
      const myToken = ++tokenRef.current;
      try {
        window.speechSynthesis.cancel();
      } catch {}

      const utt = new SpeechSynthesisUtterance(text);
      const voice = pickVoice();
      if (voice) utt.voice = voice;
      utt.rate = 1.0;
      utt.pitch = 1.0;

      utt.onstart = () => {
        if (tokenRef.current === myToken) setSpeaking(true);
      };
      utt.onend = () => {
        if (tokenRef.current === myToken) setSpeaking(false);
      };
      utt.onerror = () => {
        if (tokenRef.current === myToken) setSpeaking(false);
      };

      // Safari quirk: large texts need a small delay after cancel
      setTimeout(() => {
        if (tokenRef.current !== myToken) return;
        try {
          window.speechSynthesis.speak(utt);
        } catch {}
      }, 50);
    },
    [supported, pickVoice]
  );

  // Stop speech on unmount
  useEffect(() => {
    return () => {
      if (supported) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
    };
  }, [supported]);

  return { speak, cancel, speaking, supported, voices };
}
