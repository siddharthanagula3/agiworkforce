'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettingsStore, VOICE_SPEED_RATES } from '@shared/stores/web-settings-store';
import { getCsrfToken } from '@/lib/client/csrf';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';

const SPEECH_ENDPOINT = '/api/voice/speech';
const SPEECH_CHUNK_CHARACTERS = 3_800;
const CSRF_HEADER = 'x-csrf-token';

function speechChunks(text: string): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > SPEECH_CHUNK_CHARACTERS) {
    const window = rest.slice(0, SPEECH_CHUNK_CHARACTERS);
    const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('\n'));
    const end = cut > SPEECH_CHUNK_CHARACTERS / 2 ? cut + 1 : SPEECH_CHUNK_CHARACTERS;
    chunks.push(rest.slice(0, end).trim());
    rest = rest.slice(end);
  }
  if (rest.trim()) chunks.push(rest.trim());
  return chunks;
}

async function fetchSpeech(
  text: string,
  speed: number,
  signal: AbortSignal,
): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(SPEECH_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        [CSRF_HEADER]: await getCsrfToken(),
        'Idempotency-Key': createManagedChatIdempotencyKey({
          surface: 'web',
          purpose: 'read-aloud',
          operationId: globalThis.crypto.randomUUID(),
        }),
      },
      body: JSON.stringify({ text, speed }),
      signal,
    });
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

let speechContext: AudioContext | null = null;

function speechAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (speechContext && speechContext.state !== 'closed') return speechContext;
  const Context =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  try {
    speechContext = new Context();
  } catch {
    return null;
  }
  return speechContext;
}

async function decodeSpeech(
  context: AudioContext,
  bytes: ArrayBuffer,
): Promise<AudioBuffer | null> {
  try {
    return await context.decodeAudioData(bytes);
  } catch {
    return null;
  }
}

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
  speak: (text: string, options?: { deviceVoice?: boolean }) => void;
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
  const playbackRef = useRef<{
    controller: AbortController;
    source: AudioBufferSourceNode | null;
  } | null>(null);

  useEffect(() => {
    const browserSupportsSpeech =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      'SpeechSynthesisUtterance' in window;
    setIsSupported(typeof window !== 'undefined');
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

  const stopServerPlayback = useCallback(() => {
    const playback = playbackRef.current;
    playbackRef.current = null;
    if (!playback) return;
    playback.controller.abort();
    playback.source?.stop();
  }, []);

  const stop = useCallback(() => {
    stopServerPlayback();
    if (!isSupported) return;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    utteranceRef.current = null;
    spokenTextRef.current = null;
  }, [isSupported, stopServerPlayback]);

  const unlock = useCallback(() => {
    if (!isSupported || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) return;
    const primer = new SpeechSynthesisUtterance(UNLOCK_TEXT);
    primer.volume = 0;
    synth.speak(primer);
  }, [isSupported]);

  const speakWithDevice = useCallback(
    (clean: string) => {
      if (!('speechSynthesis' in window)) {
        setIsSpeaking(false);
        spokenTextRef.current = null;
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
    [selectedVoice],
  );

  const speak = useCallback(
    (text: string, options?: { deviceVoice?: boolean }) => {
      if (!isSupported) return;
      const clean = stripMarkdown(text);
      if (!clean) return;
      if (isSpeaking && spokenTextRef.current === clean) {
        stop();
        return;
      }
      stop();
      const context = options?.deviceVoice ? null : speechAudioContext();
      if (!context) {
        speakWithDevice(clean);
        return;
      }
      const resumed =
        context.state === 'running'
          ? Promise.resolve(true)
          : context.resume().then(
              () => context.state === 'running',
              () => false,
            );

      const controller = new AbortController();
      const playback: { controller: AbortController; source: AudioBufferSourceNode | null } = {
        controller,
        source: null,
      };
      playbackRef.current = playback;
      spokenTextRef.current = clean;
      setIsSpeaking(true);
      const speed =
        VOICE_SPEED_RATES[useSettingsStore.getState().voiceSpeed ?? 'normal'] ??
        VOICE_SPEED_RATES.normal;
      const finish = () => {
        if (playbackRef.current !== playback) return;
        playbackRef.current = null;
        spokenTextRef.current = null;
        setIsSpeaking(false);
      };

      void (async () => {
        if (!(await resumed)) {
          if (playbackRef.current !== playback) return;
          playbackRef.current = null;
          speakWithDevice(clean);
          return;
        }
        const chunks = speechChunks(clean);
        for (const [index, chunk] of chunks.entries()) {
          const bytes = await fetchSpeech(chunk, speed, controller.signal);
          const buffer = bytes ? await decodeSpeech(context, bytes) : null;
          if (playbackRef.current !== playback) return;
          if (!buffer) {
            if (index === 0) {
              playbackRef.current = null;
              speakWithDevice(clean);
            } else {
              finish();
            }
            return;
          }
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);
          const ended = new Promise<void>((resolve) => {
            source.onended = () => resolve();
          });
          source.start();
          playback.source = source;
          await ended;
          source.disconnect();
          if (playbackRef.current !== playback) return;
        }
        finish();
      })();
    },
    [isSupported, isSpeaking, stop, speakWithDevice],
  );

  return { isSpeaking, isSupported, speak, stop, unlock, voices, voiceUri, setVoiceUri };
}

export default useTTS;
