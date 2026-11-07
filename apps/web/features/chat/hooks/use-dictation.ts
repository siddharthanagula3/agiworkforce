'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useVoiceInputStore } from '@features/chat/stores/voice-input-store';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { useBillingStore } from '@shared/stores/web-auth-store';
import type { MeDisabledFeature } from '@agiworkforce/cloud-contracts';
import { DICTATION_CAPABILITY } from '@/lib/feature-flags/kill-switches';
import { usePrefersReducedMotion } from '@features/support/hooks/usePrefersReducedMotion';
import {
  ANALYSER_FFT_SIZE,
  createWaveform,
  dictationReducer,
  isDictationActive,
  pushWaveformSample,
  readAnalyserLevel,
  DICTATION_EVENT,
  DICTATION_INTENT,
  DICTATION_STATUS,
  INITIAL_DICTATION_STATE,
  WAVEFORM_SAMPLE_INTERVAL_MS,
  type DictationIntent,
  type DictationStatus,
} from '@features/chat/lib/dictation-machine';

const ANNOUNCEMENT = {
  recording: 'Recording started',
  stopped: 'Recording stopped, transcribing',
  transcribed: 'Transcript ready',
  cancelled: 'Recording discarded',
} as const;

const FALLBACK_CAPTURE_ERROR = 'The microphone could not be started. Try again.';
const FALLBACK_TRANSCRIBE_ERROR = 'That recording could not be transcribed. Try again.';
const EMPTY_TRANSCRIPT_ERROR = 'Nothing was heard in that recording. Try again.';
const DICTATION_SWITCHED_OFF =
  'Dictation is temporarily switched off while we investigate a problem with it.';
const DICTATION_SWITCHED_OFF_FOR_VERSION = 'Dictation is switched off for this version.';

export function dictationSwitchedOffReason(
  disabledFeatures: readonly MeDisabledFeature[],
): string | null {
  const closed = disabledFeatures.find((feature) => feature.capability === DICTATION_CAPABILITY);
  if (!closed) return null;
  return closed.reason
    ? `${DICTATION_SWITCHED_OFF_FOR_VERSION} ${closed.reason}`
    : DICTATION_SWITCHED_OFF;
}

export interface DictationController {
  status: DictationStatus;
  isActive: boolean;
  error: string | null;
  bars: readonly number[];
  level: number;
  announcement: string;
  reducedMotion: boolean;
  start: () => void;
  stop: () => void;
  send: () => void;
  cancel: () => void;
  retry: () => void;
}

interface UseDictationOptions {
  scope: unknown;
  isAvailable: () => boolean;
  onInsert: (text: string, owner: RequestAuthority) => void;
  onSend: (text: string, owner: RequestAuthority) => void;
}

type AudioContextConstructor = new () => AudioContext;

function resolveAudioContext(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const vendor = window as unknown as Record<string, AudioContextConstructor | undefined>;
  return vendor['AudioContext'] ?? vendor['webkitAudioContext'] ?? null;
}

export function useDictation(options: UseDictationOptions): DictationController {
  const captureSession = useSessionSnapshot();
  const latest = useRef(options);
  const scopeGeneration = useRef(0);
  if (latest.current.scope !== options.scope) scopeGeneration.current += 1;
  latest.current = options;
  const ownerRef = useRef<RequestAuthority | null>(null);
  const mounted = useRef(true);
  const [machine, dispatch] = useReducer(dictationReducer, INITIAL_DICTATION_STATE);
  const [waveform, setWaveform] = useState(createWaveform);
  const [announcement, setAnnouncement] = useState('');
  const reducedMotion = usePrefersReducedMotion();
  const captureStream = useVoiceInputStore((state) => state.captureStream);
  const dictationEnabled = useSettingsStore((state) => state.dictationEnabled);

  const disabledFeatures = useBillingStore((state) => state.disabledFeatures);
  const admitted = useCallback(() => mounted.current &&
    useSettingsStore.getState().dictationEnabled &&
    !dictationSwitchedOffReason(useBillingStore.getState().disabledFeatures) &&
    latest.current.isAvailable(), []);

  const cancel = useCallback(() => {
    const owner = ownerRef.current;
    ownerRef.current = null;
    if (owner) {
      useVoiceInputStore.getState().cancelListening(owner);
      owner.retire();
    }
    dispatch({ type: DICTATION_EVENT.cancel });
    setAnnouncement(ANNOUNCEMENT.cancelled);
  }, []);

  const start = useCallback(() => {
    if (!useSettingsStore.getState().dictationEnabled) return;
    cancel();
    finishing.current = false;
    dispatch({ type: DICTATION_EVENT.start });
    const session = captureSession();
    if (!admitted() || !session) {
      dispatch({ type: DICTATION_EVENT.fail, message:
        dictationSwitchedOffReason(useBillingStore.getState().disabledFeatures) ??
        'Cloud dictation is unavailable for this destination. Type instead.' });
      return;
    }
    const generation = scopeGeneration.current;
    const owner = createRequestAuthority(session, () => ownerRef.current === owner &&
      generation === scopeGeneration.current && admitted());
    ownerRef.current = owner;
    owner.signal.addEventListener('abort', () => {
      if (ownerRef.current === owner) cancel();
    }, { once: true });
    setWaveform(createWaveform());
    setAnnouncement(ANNOUNCEMENT.recording);
    void useVoiceInputStore.getState().startListening(owner).then(() => {
      if (!owner.isCurrent()) return;
      const { mode, error } = useVoiceInputStore.getState();
      if (mode === 'error') dispatch({ type: DICTATION_EVENT.fail, message: error ?? FALLBACK_CAPTURE_ERROR });
    });
  }, [admitted, cancel, captureSession]);

  const lastIntentRef = useRef<DictationIntent>(DICTATION_INTENT.insert);
  const finishing = useRef(false);
  const deliver = useCallback((owner: RequestAuthority, intent: DictationIntent) => {
    if (!owner.isCurrent()) return;
    finishing.current = false;
    const store = useVoiceInputStore.getState();
    const { transcript, error, mode } = store;
    store.clearTranscript(owner);
    if (mode === 'error') {
      dispatch({ type: DICTATION_EVENT.fail, message: error ?? FALLBACK_TRANSCRIBE_ERROR });
      return;
    }
    const text = transcript.trim();
    if (!text) {
      dispatch({ type: DICTATION_EVENT.fail, message: EMPTY_TRANSCRIPT_ERROR });
      return;
    }
    dispatch({ type: DICTATION_EVENT.resolve });
    setAnnouncement(ANNOUNCEMENT.transcribed);
    if (intent === DICTATION_INTENT.send) latest.current.onSend(text, owner);
    else latest.current.onInsert(text, owner);
  }, []);

  const finish = useCallback((intent: DictationIntent) => {
    const owner = ownerRef.current;
    if (!owner?.isCurrent() || finishing.current) return;
    finishing.current = true;
    lastIntentRef.current = intent;
    dispatch({ type: DICTATION_EVENT.stop, intent });
    setAnnouncement(ANNOUNCEMENT.stopped);
    void useVoiceInputStore.getState().stopListening(owner).then(() => deliver(owner, intent));
  }, [deliver]);
  const stop = useCallback(() => finish(DICTATION_INTENT.insert), [finish]);
  const send = useCallback(() => finish(DICTATION_INTENT.send), [finish]);
  const retry = useCallback(() => {
    const owner = ownerRef.current;
    if (!owner) { start(); return; }
    if (!owner.isCurrent()) return;
    const store = useVoiceInputStore.getState();
    if (!store.canRetryTranscription) { finishing.current = false; start(); return; }
    if (finishing.current) return;
    finishing.current = true;
    const intent = lastIntentRef.current;
    dispatch({ type: DICTATION_EVENT.start });
    dispatch({ type: DICTATION_EVENT.stop, intent });
    setAnnouncement(ANNOUNCEMENT.stopped);
    void store.retryTranscription(owner).then(() => deliver(owner, intent));
  }, [deliver, start]);

  useEffect(() => {
    if (ownerRef.current && !ownerRef.current.isCurrent()) cancel();
  });
  useEffect(() => {
    if (!dictationEnabled || dictationSwitchedOffReason(disabledFeatures)) cancel();
  }, [dictationEnabled, disabledFeatures, cancel]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); };
  }, [cancel]);

  useEffect(() => {
    if (machine.status !== DICTATION_STATUS.recording) return undefined;
    if (reducedMotion) return undefined;
    if (!captureStream) return undefined;
    const AudioContextCtor = resolveAudioContext();
    if (!AudioContextCtor) return undefined;

    const context = new AudioContextCtor();
    const source = context.createMediaStreamSource(captureStream);
    const analyser = context.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    source.connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let lastSampleAt = 0;

    const tick = (now: number) => {
      if (now - lastSampleAt >= WAVEFORM_SAMPLE_INTERVAL_MS) {
        lastSampleAt = now;
        analyser.getByteTimeDomainData(samples);
        const level = readAnalyserLevel(samples);
        setWaveform((current) => pushWaveformSample(current, level));
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      void context.close();
    };
  }, [machine.status, reducedMotion, captureStream]);

  return {
    status: machine.status,
    isActive: isDictationActive(machine.status),
    error: machine.error,
    bars: waveform.bars,
    level: waveform.level,
    announcement,
    reducedMotion,
    start,
    stop,
    send,
    cancel,
    retry,
  };
}
