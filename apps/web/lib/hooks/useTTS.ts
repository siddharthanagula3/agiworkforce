'use client';

/**
 * useTTS - Text-to-Speech hook using the browser's SpeechSynthesis API.
 *
 * Features:
 * - Strips Markdown/code blocks so the AI reads clean prose
 * - Tracks speaking state for UI feedback
 * - Cancels on unmount so no zombie utterances linger
 * - Falls back gracefully when SpeechSynthesis is unavailable
 * - Lets the user pick among the voices their browser actually installs
 *
 * ON VOICE STORAGE — this preference is deliberately device-local
 * (`localStorage`), NOT part of the server-synced `general` namespace. Voice
 * availability is a property of the OS and browser, not the account: the voices
 * on macOS Safari, Windows Chrome, and Android are disjoint sets. Syncing a
 * `voiceURI` across devices would restore a preference that resolves to nothing
 * on the next machine, which reads as the setting being ignored.
 *
 * ON ENUMERATION — `getVoices()` returns [] on the first call in Chrome and
 * fills in asynchronously, firing `voiceschanged`. Reading it once on mount is
 * the standard bug here: the picker renders empty and stays empty.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Device-local, by design. See the file header. */
const VOICE_STORAGE_KEY = 'agi:tts-voice-uri';

function readStoredVoiceUri(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(VOICE_STORAGE_KEY);
  } catch {
    // Private-browsing modes can throw on access. A missing preference is not
    // an error worth surfacing — the system default voice is a fine answer.
    return null;
  }
}

function stripMarkdown(text: string): string {
  return (
    text
      // Remove fenced code blocks entirely (don't read raw code)
      .replace(/```[\s\S]*?```/g, 'code block omitted.')
      // Remove inline code
      .replace(/`[^`]+`/g, '')
      // Remove Markdown headings markers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic markers
      .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
      // Remove blockquote markers
      .replace(/^>\s+/gm, '')
      // Remove link syntax, keep label text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove image syntax
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Collapse multiple blank lines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export interface UseTTSReturn {
  isSpeaking: boolean;
  isSupported: boolean;
  speak: (text: string) => void;
  stop: () => void;
  /** Voices this browser reports. Empty until `voiceschanged` fires in Chrome. */
  voices: SpeechSynthesisVoice[];
  /** The chosen voice's URI, or null for the browser default. */
  voiceUri: string | null;
  /** Persists the choice for this device and applies it to the next utterance. */
  setVoiceUri: (uri: string | null) => void;
}

export function useTTS(): UseTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUriState] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const spokenTextRef = useRef<string | null>(null);

  useEffect(() => {
    const browserSupportsSpeech =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      'SpeechSynthesisUtterance' in window;
    setIsSupported(browserSupportsSpeech);
    if (!browserSupportsSpeech) return;

    setVoiceUriState(readStoredVoiceUri());

    // Captured, not re-read in the cleanup: the teardown must unsubscribe from
    // the same object it subscribed to, even if the global has since changed.
    const synth = window.speechSynthesis;
    const syncVoices = () => setVoices(synth.getVoices());
    // Both: Safari populates synchronously and may never fire the event, Chrome
    // returns [] here and fires it a moment later.
    syncVoices();
    synth.addEventListener('voiceschanged', syncVoices);

    return () => {
      synth.removeEventListener('voiceschanged', syncVoices);
      synth.cancel();
    };
  }, []);

  const setVoiceUri = useCallback((uri: string | null) => {
    setVoiceUriState(uri);
    try {
      if (uri) window.localStorage.setItem(VOICE_STORAGE_KEY, uri);
      else window.localStorage.removeItem(VOICE_STORAGE_KEY);
    } catch {
      // Preference does not persist across reloads in this browser mode; the
      // in-memory choice still applies for the session.
    }
  }, []);

  // A stored voice can disappear — a removed system voice, or a preference
  // carried to another device. Resolving to `undefined` leaves the utterance on
  // the browser default rather than failing to speak.
  const selectedVoice = useMemo(
    () => (voiceUri ? voices.find((voice) => voice.voiceURI === voiceUri) : undefined),
    [voices, voiceUri],
  );

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    utteranceRef.current = null;
    spokenTextRef.current = null;
  }, [isSupported]);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported) return;

      const clean = stripMarkdown(text);
      if (!clean) return;

      // If already speaking the same content, toggle off
      if (isSpeaking && spokenTextRef.current === clean) {
        stop();
        return;
      }

      // Cancel any previous utterance
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.05;
      utterance.pitch = 1;
      utterance.volume = 1;
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        // Some engines read `lang` rather than `voice` when choosing; keeping
        // them consistent stops a US voice being handed German text.
        utterance.lang = selectedVoice.lang;
      }

      utterance.onstart = () => {
        if (utteranceRef.current === utterance) setIsSpeaking(true);
      };
      utterance.onend = () => {
        if (utteranceRef.current !== utterance) return;
        setIsSpeaking(false);
        utteranceRef.current = null;
        spokenTextRef.current = null;
      };
      utterance.onerror = () => {
        if (utteranceRef.current !== utterance) return;
        setIsSpeaking(false);
        utteranceRef.current = null;
        spokenTextRef.current = null;
      };

      utteranceRef.current = utterance;
      spokenTextRef.current = clean;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, isSpeaking, stop, selectedVoice],
  );

  return { isSpeaking, isSupported, speak, stop, voices, voiceUri, setVoiceUri };
}

export default useTTS;
