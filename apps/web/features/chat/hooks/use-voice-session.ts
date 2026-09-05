'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useTTS } from '@/lib/hooks/useTTS';
import { useVoiceInputStore } from '@features/chat/stores/voice-input-store';
import { useVoiceSessionStore } from '@features/chat/stores/voice-session-store';
import { usePrefersReducedMotion } from '@features/support/hooks/usePrefersReducedMotion';
import {
  advanceBargeIn,
  advanceSpeechWindow,
  INITIAL_SPEECH_WINDOW,
  isVoiceSessionActive,
  PLAYBACK_START_TIMEOUT_MS,
  UTTERANCE_CANCEL_WINDOW_MS,
  VOICE_SESSION_EVENT,
  VOICE_SESSION_STATUS,
  type VoiceSessionState,
} from '@features/chat/lib/voice-session-machine';
import {
  ANALYSER_FFT_SIZE,
  readAnalyserLevel,
  WAVEFORM_SAMPLE_INTERVAL_MS,
} from '@features/chat/lib/dictation-machine';

const MESSAGE = {
  captureFailed: 'The microphone could not be started. Try again.',
  transcribeFailed: 'That could not be transcribed. Try again.',
  sendFailed: 'That turn could not be sent. Try again.',
  mutedHint: 'Muted, tap the mic to talk',
} as const;

const REPLY_STALL_TIMEOUT_MS = 15_000;
const MICROPHONE_PERMISSION = 'microphone';
const GRANTED = 'granted';

export interface VoiceReplyTurn {
  id: string;
  content: string;
}

export interface UseVoiceSessionOptions {
  turnActive: boolean;
  reply: VoiceReplyTurn | null;
  onSend: (text: string) => boolean;
}

export interface VoiceSessionController {
  state: VoiceSessionState;
  active: boolean;
  reducedMotion: boolean;
  deviceName: string;
  playbackUnavailable: boolean;
  mutedHint: string;
  enter: () => void;
  exit: () => void;
  toggleMute: () => void;
  cancelPending: () => void;
  submitTyped: (text: string) => void;
  retry: () => void;
}

type AudioContextConstructor = new () => AudioContext;

function resolveAudioContext(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const vendor = window as unknown as Record<string, AudioContextConstructor | undefined>;
  return vendor['AudioContext'] ?? vendor['webkitAudioContext'] ?? null;
}

async function microphoneAlreadyGranted(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const query = navigator.permissions?.query;
  if (typeof query !== 'function') return false;
  try {
    const status = await navigator.permissions.query({
      name: MICROPHONE_PERMISSION as PermissionName,
    });
    return status.state === GRANTED;
  } catch {
    return false;
  }
}

async function resolveInputDeviceName(): Promise<string> {
  if (typeof navigator === 'undefined') return '';
  const enumerate = navigator.mediaDevices?.enumerateDevices;
  if (typeof enumerate !== 'function') return '';
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.find((device) => device.kind === 'audioinput' && device.label)?.label ?? '';
  } catch {
    return '';
  }
}

export function useVoiceSession({
  turnActive,
  reply,
  onSend,
}: UseVoiceSessionOptions): VoiceSessionController {
  const state = useVoiceSessionStore((store) => store.session);
  const language = useVoiceSessionStore((store) => store.language);
  const dispatch = useVoiceSessionStore((store) => store.dispatch);
  const captureStream = useVoiceInputStore((store) => store.captureStream);
  const reducedMotion = usePrefersReducedMotion();
  const tts = useTTS();
  const [deviceName, setDeviceName] = useState('');

  const { status, muted, pendingUtterance } = state;
  const active = isVoiceSessionActive(status);
  const listening = status === VOICE_SESSION_STATUS.listening && !muted;
  const speaking = status === VOICE_SESSION_STATUS.speaking;
  const shouldCapture = listening || (speaking && !muted);

  const spokenReplyIdRef = useRef<string | null>(null);
  const playbackStartedRef = useRef(false);
  const replyRef = useRef(reply);
  replyRef.current = reply;
  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  useEffect(() => {
    useVoiceInputStore.getState().setLanguage(language);
  }, [language]);

  useEffect(() => {
    if (status !== VOICE_SESSION_STATUS.entering) return undefined;
    let cancelled = false;
    void microphoneAlreadyGranted().then((granted) => {
      if (cancelled) return;
      dispatch({ type: VOICE_SESSION_EVENT.ready, listening: granted });
    });
    return () => {
      cancelled = true;
    };
  }, [status, dispatch]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    void resolveInputDeviceName().then((label) => {
      if (!cancelled) setDeviceName(label);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!shouldCapture) return undefined;
    let cancelled = false;
    const store = useVoiceInputStore.getState();
    store.clearError();
    void store.startListening().then(() => {
      if (cancelled) return;
      const settled = useVoiceInputStore.getState();
      if (settled.mode === 'error') {
        dispatch({
          type: VOICE_SESSION_EVENT.fail,
          message: settled.error ?? MESSAGE.captureFailed,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [shouldCapture, dispatch]);

  useEffect(() => {
    if (shouldCapture) return;
    if (status === VOICE_SESSION_STATUS.transcribing) return;
    if (useVoiceInputStore.getState().mode !== 'listening') return;
    useVoiceInputStore.getState().cancelListening();
  }, [shouldCapture, status]);

  const finishUtterance = useCallback(() => {
    dispatch({ type: VOICE_SESSION_EVENT.speechEnd });
    void useVoiceInputStore
      .getState()
      .stopListening()
      .then(() => {
        const store = useVoiceInputStore.getState();
        const { transcript, error, mode } = store;
        store.clearTranscript();
        if (mode === 'error') {
          dispatch({
            type: VOICE_SESSION_EVENT.fail,
            message: error ?? MESSAGE.transcribeFailed,
          });
          return;
        }
        dispatch({ type: VOICE_SESSION_EVENT.transcribed, text: transcript });
      });
  }, [dispatch]);

  useEffect(() => {
    if (!shouldCapture || !captureStream) return undefined;
    const AudioContextCtor = resolveAudioContext();
    if (!AudioContextCtor) return undefined;

    const context = new AudioContextCtor();
    const source = context.createMediaStreamSource(captureStream);
    const analyser = context.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    source.connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    let speechWindow = INITIAL_SPEECH_WINDOW;
    let bargeInSamples = 0;
    let lastSampleAt = 0;
    let frame = 0;

    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      if (now - lastSampleAt < WAVEFORM_SAMPLE_INTERVAL_MS) return;
      lastSampleAt = now;
      analyser.getByteTimeDomainData(samples);
      const level = readAnalyserLevel(samples);

      if (speaking) {
        const barge = advanceBargeIn(bargeInSamples, level);
        bargeInSamples = barge.consecutive;
        if (barge.triggered) {
          ttsRef.current.stop();
          dispatch({ type: VOICE_SESSION_EVENT.bargeIn });
        }
        return;
      }

      const advanced = advanceSpeechWindow(speechWindow, level, now);
      speechWindow = advanced.state;
      if (advanced.ended) finishUtterance();
    };
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      void context.close();
    };
  }, [shouldCapture, captureStream, speaking, dispatch, finishUtterance]);

  useEffect(() => {
    if (status !== VOICE_SESSION_STATUS.sending || !pendingUtterance) return undefined;
    const id = window.setTimeout(() => {
      spokenReplyIdRef.current = replyRef.current?.id ?? null;
      dispatch({ type: VOICE_SESSION_EVENT.commitUtterance });
      if (!onSendRef.current(pendingUtterance)) {
        dispatch({ type: VOICE_SESSION_EVENT.fail, message: MESSAGE.sendFailed });
      }
    }, UTTERANCE_CANCEL_WINDOW_MS);
    return () => window.clearTimeout(id);
  }, [status, pendingUtterance, dispatch]);

  useEffect(() => {
    if (status !== VOICE_SESSION_STATUS.streaming || turnActive) return undefined;
    const replyId = reply?.id ?? null;
    if (replyId && replyId !== spokenReplyIdRef.current) {
      spokenReplyIdRef.current = replyId;
      const text = reply?.content.trim() ?? '';
      if (text && tts.isSupported) {
        playbackStartedRef.current = false;
        tts.speak(text);
        dispatch({ type: VOICE_SESSION_EVENT.replyComplete, spoken: true });
      } else {
        dispatch({ type: VOICE_SESSION_EVENT.replyComplete, spoken: false });
      }
      return undefined;
    }
    const stall = window.setTimeout(() => {
      dispatch({ type: VOICE_SESSION_EVENT.replyComplete, spoken: false });
    }, REPLY_STALL_TIMEOUT_MS);
    return () => window.clearTimeout(stall);
  }, [status, turnActive, reply, tts, dispatch]);

  useEffect(() => {
    if (status !== VOICE_SESSION_STATUS.speaking) return undefined;
    if (tts.isSpeaking) {
      playbackStartedRef.current = true;
      return undefined;
    }
    if (playbackStartedRef.current) {
      playbackStartedRef.current = false;
      dispatch({ type: VOICE_SESSION_EVENT.playbackComplete });
      return undefined;
    }
    const id = window.setTimeout(() => {
      dispatch({ type: VOICE_SESSION_EVENT.playbackComplete });
    }, PLAYBACK_START_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [status, tts.isSpeaking, dispatch]);

  const enter = useCallback(() => {
    useVoiceInputStore.getState().cancelListening();
    dispatch({ type: VOICE_SESSION_EVENT.enter });
  }, [dispatch]);

  const exit = useCallback(() => {
    ttsRef.current.stop();
    useVoiceInputStore.getState().cancelListening();
    useVoiceInputStore.getState().clearTranscript();
    dispatch({ type: VOICE_SESSION_EVENT.exit });
  }, [dispatch]);

  const toggleMute = useCallback(() => {
    if (status === VOICE_SESSION_STATUS.speaking) {
      ttsRef.current.stop();
      dispatch({ type: VOICE_SESSION_EVENT.bargeIn });
      return;
    }
    dispatch({ type: muted ? VOICE_SESSION_EVENT.unmute : VOICE_SESSION_EVENT.mute });
  }, [status, muted, dispatch]);

  const cancelPending = useCallback(() => {
    dispatch({ type: VOICE_SESSION_EVENT.cancelUtterance });
  }, [dispatch]);

  const submitTyped = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      ttsRef.current.stop();
      spokenReplyIdRef.current = replyRef.current?.id ?? null;
      dispatch({ type: VOICE_SESSION_EVENT.typedSubmit });
      if (!onSendRef.current(trimmed)) {
        dispatch({ type: VOICE_SESSION_EVENT.fail, message: MESSAGE.sendFailed });
      }
    },
    [dispatch],
  );

  const retry = useCallback(() => {
    dispatch({ type: VOICE_SESSION_EVENT.retry });
  }, [dispatch]);

  useEffect(
    () => () => {
      useVoiceInputStore.getState().cancelListening();
    },
    [],
  );

  return {
    state,
    active,
    reducedMotion,
    deviceName,
    playbackUnavailable: !tts.isSupported,
    mutedHint: MESSAGE.mutedHint,
    enter,
    exit,
    toggleMute,
    cancelPending,
    submitTyped,
    retry,
  };
}
