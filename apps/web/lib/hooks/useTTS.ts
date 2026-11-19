'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSettingsStore, VOICE_SPEED_RATES } from '@shared/stores/web-settings-store';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { useReadonlyIdentityLifetime, useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';

const SPEECH_ENDPOINT = '/api/voice/speech';
const SPEECH_CHUNK_CHARACTERS = 3_800;
const PLAYBACK_FAILED_MESSAGE = 'Read aloud could not play. Try again.';
const INTENTIONAL_UTTERANCE_ERRORS = new Set(['canceled', 'interrupted']);
interface SpeechOperation {
  clean: string;
  isCurrent: () => boolean;
  retire: () => void;
  authority: RequestAuthority | null;
  source: AudioBufferSourceNode | null;
  utterance: SpeechSynthesisUtterance | null;
  settleEnded: (() => void) | null;
}

// speechSynthesis.cancel() is global. Only its exact active lease may cancel it.
let deviceOwner: SpeechOperation | null = null;

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
  operation: SpeechOperation,
): Promise<ArrayBuffer | null> {
  try {
    if (!operation.isCurrent() || !operation.authority) return null;
    const response = await operation.authority.fetch(SPEECH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': createManagedChatIdempotencyKey({
          surface: 'web',
          purpose: 'read-aloud',
          operationId: globalThis.crypto.randomUUID(),
        }),
      },
      body: JSON.stringify({ text, speed }),
    });
    if (!operation.isCurrent() || !response.ok) return null;
    const bytes = await response.arrayBuffer();
    return operation.isCurrent() ? bytes : null;
  } catch {
    return null;
  }
}

function reportPlaybackFailure(operation: SpeechOperation): void {
  if (operation.isCurrent()) toast.error(PLAYBACK_FAILED_MESSAGE);
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

export interface SpeechOptions {
  deviceVoice?: boolean;
  /** Re-read current content policy, including after asynchronous boundaries. */
  canSpeak?: () => boolean;
}

function policyAllows(canSpeak?: () => boolean): boolean {
  try {
    return canSpeak?.() ?? true;
  } catch {
    return false;
  }
}

export interface UseTTSReturn {
  isSpeaking: boolean;
  isSupported: boolean;
  speak: (text: string, options?: SpeechOptions) => void;
  stop: () => void;
  unlock: () => void;
  voices: SpeechSynthesisVoice[];
  voiceUri: string | null;
  setVoiceUri: (uri: string | null) => void;
}

const UNLOCK_TEXT = ' ';

export function useTTS(ownerScope?: string | null, allowed = true): UseTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUriState] = useState<string | null>(null);
  const captureSession = useSessionSnapshot();
  const captureIdentity = useReadonlyIdentityLifetime();
  const lifetimeRef = useRef<object | null>(null);
  const scopeRef = useRef(ownerScope);
  const policyRef = useRef(allowed);
  const policyGeneration = useRef(0);
  if (policyRef.current !== allowed) {
    policyRef.current = allowed;
    policyGeneration.current += 1;
  }
  const renderedPolicyGeneration = policyGeneration.current;
  const scopeGeneration = useRef(0);
  if (scopeRef.current !== ownerScope) {
    scopeRef.current = ownerScope;
    scopeGeneration.current += 1;
  }
  const renderedScopeGeneration = scopeGeneration.current;
  const renderedIdentity = captureIdentity();
  const operationRef = useRef<SpeechOperation | null>(null);

  const stop = useCallback(() => {
    if (scopeGeneration.current !== renderedScopeGeneration || !renderedIdentity.isCurrent())
      return;
    if (policyGeneration.current !== renderedPolicyGeneration) return;
    operationRef.current?.retire();
  }, [renderedScopeGeneration, renderedIdentity, renderedPolicyGeneration]);

  useLayoutEffect(() => {
    const lifetime = {};
    lifetimeRef.current = lifetime;
    return () => {
      lifetimeRef.current = null;
      operationRef.current?.retire();
    };
  }, []);

  // Identity helpers fence observations, not arbitrary SDK mutations. Every
  // identity render also retires audio that is already playing, without waiting
  // for a response or an utterance callback.
  useLayoutEffect(() => {
    const operation = operationRef.current;
    if (operation && !operation.isCurrent()) operation.retire();
  });

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

  const begin = useCallback(
    (clean: string, canSpeak?: () => boolean): SpeechOperation | null => {
      operationRef.current?.retire();
      const lifetime = lifetimeRef.current;
      if (!lifetime) return null;
      const identity = captureIdentity();
      const scope = scopeGeneration.current;
      const policy = policyGeneration.current;
      let retired = false;
      const operation: SpeechOperation = {
        clean,
        authority: null,
        source: null,
        utterance: null,
        settleEnded: null,
        isCurrent: () => {
          const current =
            !retired &&
            lifetimeRef.current === lifetime &&
            scopeGeneration.current === scope &&
            policyGeneration.current === policy &&
            policyRef.current &&
            policyAllows(canSpeak) &&
            operationRef.current === operation &&
            identity.isCurrent();
          if (!current) operation.retire();
          return current;
        },
        retire: () => {
          if (retired) return;
          retired = true;
          operation.authority?.retire();
          const source = operation.source;
          operation.source = null;
          if (source) {
            source.onended = null;
            try {
              source.stop();
            } catch {
              /* Already stopped or never started. */
            }
            try {
              source.disconnect();
            } catch {
              /* Already disconnected. */
            }
          }
          operation.settleEnded?.();
          operation.settleEnded = null;
          if (operation.utterance) {
            operation.utterance.onstart = null;
            operation.utterance.onend = null;
            operation.utterance.onerror = null;
            operation.utterance = null;
          }
          if (deviceOwner === operation) {
            deviceOwner = null;
            try {
              window.speechSynthesis.cancel();
            } catch {
              /* Device unavailable. */
            }
          }
          if (operationRef.current === operation) {
            operationRef.current = null;
            if (lifetimeRef.current === lifetime) setIsSpeaking(false);
          }
        },
      };
      operationRef.current = operation;
      return operation;
    },
    [captureIdentity],
  );

  const speakWithDevice = useCallback(
    (operation: SpeechOperation, primer = false) => {
      if (!operation.isCurrent()) return;
      if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
        if (!primer) reportPlaybackFailure(operation);
        operation.retire();
        return;
      }
      // Do not acquire the global cancellation lease over someone else's voice.
      if (!deviceOwner && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
        operation.retire();
        return;
      }
      // An intentional new speak replaces the previous owned voice. Its later
      // cleanup cannot cancel this replacement because the global lease changes.
      deviceOwner?.retire();
      if (!operation.isCurrent()) return;
      try {
        const utterance = new SpeechSynthesisUtterance(operation.clean);
        utterance.rate =
          VOICE_SPEED_RATES[useSettingsStore.getState().voiceSpeed ?? 'normal'] ??
          VOICE_SPEED_RATES.normal;
        utterance.pitch = 1;
        utterance.volume = primer ? 0 : 1;
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          utterance.lang = selectedVoice.lang;
        }
        operation.utterance = utterance;
        deviceOwner = operation;
        utterance.onstart = () => {
          if (operation.isCurrent() && deviceOwner === operation && !primer) setIsSpeaking(true);
        };
        const finish = () => {
          if (!operation.isCurrent() || deviceOwner !== operation) return;
          deviceOwner = null;
          operation.retire();
        };
        utterance.onend = finish;
        utterance.onerror = (event) => {
          if (!primer && !INTENTIONAL_UTTERANCE_ERRORS.has(event.error))
            reportPlaybackFailure(operation);
          finish();
        };
        if (operation.isCurrent()) window.speechSynthesis.speak(utterance);
      } catch {
        reportPlaybackFailure(operation);
        operation.retire();
      }
    },
    [selectedVoice],
  );

  const unlock = useCallback(() => {
    if (!isSupported || !('speechSynthesis' in window)) return;
    if (scopeGeneration.current !== renderedScopeGeneration || !renderedIdentity.isCurrent())
      return;
    if (!policyRef.current || policyGeneration.current !== renderedPolicyGeneration) return;
    if (
      operationRef.current ||
      deviceOwner ||
      window.speechSynthesis.speaking ||
      window.speechSynthesis.pending
    )
      return;
    const operation = begin(UNLOCK_TEXT);
    if (operation) speakWithDevice(operation, true);
  }, [
    isSupported,
    begin,
    speakWithDevice,
    renderedScopeGeneration,
    renderedIdentity,
    renderedPolicyGeneration,
  ]);

  const speak = useCallback(
    (text: string, options?: SpeechOptions) => {
      if (
        !isSupported ||
        scopeGeneration.current !== renderedScopeGeneration ||
        !renderedIdentity.isCurrent()
      )
        return;
      if (policyGeneration.current !== renderedPolicyGeneration) return;
      if (!policyRef.current || !policyAllows(options?.canSpeak)) {
        operationRef.current?.retire();
        return;
      }
      const clean = stripMarkdown(text);
      if (!clean) return;
      const previous = operationRef.current;
      if (previous?.clean === clean && previous.isCurrent()) {
        previous.retire();
        return;
      }
      const operation = begin(clean, options?.canSpeak);
      if (!operation) return;
      const session = options?.deviceVoice ? null : captureSession();
      const context = session ? speechAudioContext() : null;
      if (!context || !session) {
        speakWithDevice(operation);
        return;
      }
      operation.authority = createRequestAuthority(session, operation.isCurrent);
      setIsSpeaking(true);
      const speed =
        VOICE_SPEED_RATES[useSettingsStore.getState().voiceSpeed ?? 'normal'] ??
        VOICE_SPEED_RATES.normal;
      void (async () => {
        try {
          let resumed = context.state === 'running';
          if (!resumed) {
            try {
              await context.resume();
              resumed = context.state === 'running';
            } catch {
              /* Device fallback. */
            }
          }
          if (!operation.isCurrent()) return;
          if (!resumed) {
            speakWithDevice(operation);
            return;
          }
          for (const [index, chunk] of speechChunks(clean).entries()) {
            if (!operation.isCurrent()) return;
            const bytes = await fetchSpeech(chunk, speed, operation);
            if (!operation.isCurrent()) return;
            const buffer = bytes ? await decodeSpeech(context, bytes) : null;
            if (!operation.isCurrent()) return;
            if (!buffer) {
              if (index === 0) speakWithDevice(operation);
              else {
                reportPlaybackFailure(operation);
                operation.retire();
              }
              return;
            }
            const source = context.createBufferSource();
            operation.source = source;
            source.buffer = buffer;
            source.connect(context.destination);
            const ended = new Promise<void>((resolve) => {
              operation.settleEnded = resolve;
              source.onended = () => resolve();
            });
            if (!operation.isCurrent()) return;
            source.start();
            await ended;
            if (!operation.isCurrent()) return;
            operation.settleEnded = null;
            source.onended = null;
            try {
              source.disconnect();
            } catch {
              /* Already disconnected. */
            }
            operation.source = null;
          }
          if (operation.isCurrent()) operation.retire();
        } catch {
          reportPlaybackFailure(operation);
          operation.retire();
        }
      })();
    },
    [
      isSupported,
      begin,
      captureSession,
      speakWithDevice,
      renderedScopeGeneration,
      renderedIdentity,
      renderedPolicyGeneration,
    ],
  );

  return { isSpeaking, isSupported, speak, stop, unlock, voices, voiceUri, setVoiceUri };
}

export default useTTS;
