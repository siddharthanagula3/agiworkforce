'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useVoiceInputStore } from '@features/chat/stores/voice-input-store';
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
  onInsert: (text: string) => void;
  onSend: (text: string) => void;
}

type AudioContextConstructor = new () => AudioContext;

function resolveAudioContext(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const vendor = window as unknown as Record<string, AudioContextConstructor | undefined>;
  return vendor['AudioContext'] ?? vendor['webkitAudioContext'] ?? null;
}

export function useDictation({ onInsert, onSend }: UseDictationOptions): DictationController {
  const [machine, dispatch] = useReducer(dictationReducer, INITIAL_DICTATION_STATE);
  const [waveform, setWaveform] = useState(createWaveform);
  const [announcement, setAnnouncement] = useState('');
  const reducedMotion = usePrefersReducedMotion();
  const captureStream = useVoiceInputStore((state) => state.captureStream);
  const runIdRef = useRef(0);

  const start = useCallback(() => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    dispatch({ type: DICTATION_EVENT.start });
    setWaveform(createWaveform());
    setAnnouncement(ANNOUNCEMENT.recording);
    const store = useVoiceInputStore.getState();
    store.clearError();
    void store.startListening().then(() => {
      if (runIdRef.current !== runId) return;
      const { mode, error } = useVoiceInputStore.getState();
      if (mode === 'error') {
        dispatch({ type: DICTATION_EVENT.fail, message: error ?? FALLBACK_CAPTURE_ERROR });
      }
    });
  }, []);

  const finish = useCallback(
    (intent: DictationIntent) => {
      const runId = runIdRef.current;
      dispatch({ type: DICTATION_EVENT.stop, intent });
      setAnnouncement(ANNOUNCEMENT.stopped);
      void useVoiceInputStore
        .getState()
        .stopListening()
        .then(() => {
          if (runIdRef.current !== runId) return;
          const store = useVoiceInputStore.getState();
          const { transcript, error, mode } = store;
          store.clearTranscript();
          if (mode === 'error') {
            dispatch({
              type: DICTATION_EVENT.fail,
              message: error ?? FALLBACK_TRANSCRIBE_ERROR,
            });
            return;
          }
          const text = transcript.trim();
          if (!text) {
            dispatch({ type: DICTATION_EVENT.fail, message: EMPTY_TRANSCRIPT_ERROR });
            return;
          }
          dispatch({ type: DICTATION_EVENT.resolve });
          setAnnouncement(ANNOUNCEMENT.transcribed);
          if (intent === DICTATION_INTENT.send) onSend(text);
          else onInsert(text);
        });
    },
    [onInsert, onSend],
  );

  const stop = useCallback(() => finish(DICTATION_INTENT.insert), [finish]);
  const send = useCallback(() => finish(DICTATION_INTENT.send), [finish]);

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    const store = useVoiceInputStore.getState();
    store.cancelListening();
    store.clearTranscript();
    dispatch({ type: DICTATION_EVENT.cancel });
    setAnnouncement(ANNOUNCEMENT.cancelled);
  }, []);

  const retry = start;

  useEffect(
    () => () => {
      useVoiceInputStore.getState().cancelListening();
    },
    [],
  );

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
