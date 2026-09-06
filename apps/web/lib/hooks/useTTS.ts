'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettingsStore, VOICE_SPEED_RATES } from '@shared/stores/web-settings-store';

const VOICE_STORAGE_KEY = 'agi:tts-voice-uri';

// The settings picker and the chat read-aloud button mount separate instances of
// this hook at the same time, so a new choice has to reach the live one without a
// reload; localStorage alone only propagates on mount.
const voiceSubscribers = new Set<(uri: string | null) => void>();

function readStoredVoiceUri(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(VOICE_STORAGE_KEY);
  } catch {
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
  unlock: () => void;
  voices: SpeechSynthesisVoice[];
  voiceUri: string | null;
  setVoiceUri: (uri: string | null) => void;
}

const UNLOCK_TEXT = ' ';

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

    const synth = window.speechSynthesis;
    const syncVoices = () => setVoices(synth.getVoices());
    syncVoices();
    synth.addEventListener('voiceschanged', syncVoices);

    return () => {
      synth.removeEventListener('voiceschanged', syncVoices);
      synth.cancel();
    };
  }, []);

  useEffect(() => {
    setVoiceUriState(readStoredVoiceUri());
    const apply = (uri: string | null) => setVoiceUriState(uri);
    voiceSubscribers.add(apply);
    return () => {
      voiceSubscribers.delete(apply);
    };
  }, []);

  const setVoiceUri = useCallback((uri: string | null) => {
    try {
      if (uri) window.localStorage.setItem(VOICE_STORAGE_KEY, uri);
      else window.localStorage.removeItem(VOICE_STORAGE_KEY);
    } catch {
      // Preference does not persist across reloads in this browser mode; the
      // in-memory choice still applies for the session.
    }
    voiceSubscribers.forEach((notify) => notify(uri));
  }, []);

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

  const unlock = useCallback(() => {
    if (!isSupported) return;
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) return;
    const primer = new SpeechSynthesisUtterance(UNLOCK_TEXT);
    primer.volume = 0;
    synth.speak(primer);
  }, [isSupported]);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported) return;

      const clean = stripMarkdown(text);
      if (!clean) return;

      if (isSpeaking && spokenTextRef.current === clean) {
        stop();
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(clean);
      // Read at speak time from the store rather than captured: the settings
      // picker and the read-aloud button mount separate useTTS instances, and a
      // captured value would leave one of them speaking at the old rate.
      utterance.rate =
        VOICE_SPEED_RATES[useSettingsStore.getState().voiceSpeed ?? 'normal'] ??
        VOICE_SPEED_RATES.normal;
      utterance.pitch = 1;
      utterance.volume = 1;
      if (selectedVoice) {
        utterance.voice = selectedVoice;
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

  return { isSpeaking, isSupported, speak, stop, unlock, voices, voiceUri, setVoiceUri };
}

export default useTTS;
