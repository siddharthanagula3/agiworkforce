import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { meteringToAmplitude } from '@agiworkforce/utils/voice';
import { useSettingsStore } from '@/stores/settingsStore';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import {
  activeSpeechLanguage,
  autoListenEnabled,
} from '@/src/features/voice/services/speechSettings';
import type { VoiceHandoff } from '@/src/features/voice/services/voiceHandoff';
import type {
  VoiceOutputHandle,
  VoiceOutputOptions,
  VoiceOutputOwner,
} from '@/src/features/voice/services/voiceOutput';

export type VoiceConversationPhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface UseVoiceConversationOptions {
  enabled: boolean;
  listenOnEnable?: boolean;
  openingTurn?: VoiceHandoff | null;
  onOpeningTurnStarted?: () => void;
  pttMode?: boolean;
  hapticsEnabled: boolean;
  sendMessage: (text: string) => Promise<string | null | undefined>;
  speechOwner: VoiceOutputOwner | null;
  speechOptions?: VoiceOutputOptions;
  onCaptureError?: (err: unknown) => void;
  onSttComplete?: (ms: number) => void;
}

interface CaptureEntry {
  consumed: boolean;
  stopRequestedAt: number | null;
  session: number;
  owner: VoiceOutputOwner;
  abort: AbortController;
  capture: VoiceInput.VoiceCaptureSession | null;
}

export const VOICE_INPUT_DISABLED_MESSAGE =
  'Voice Input is off. Turn it on in Settings, Voice to use the microphone.';

export function voiceCaptureErrorMessage(err: unknown): string {
  if (err instanceof VoiceInput.VoiceCaptureError) {
    if (err.code === 'mic-permission-denied') {
      return 'Microphone access is off. Enable microphone permission in Settings to use voice.';
    }
    if (err.code === 'on-device-recognition-unavailable') {
      return 'On-device speech recognition is not available for this device or language yet.';
    }
    if (err.code === 'already-active') return 'Voice capture is already running.';
    if (err.code === 'max-duration-reached') return err.message;
    if (err.code === 'voice-input-disabled') return VOICE_INPUT_DISABLED_MESSAGE;
    return err.message;
  }
  return 'Voice input could not start. Please try again.';
}

export function useVoiceConversation(options: UseVoiceConversationOptions) {
  const voiceInputEnabled = useSettingsStore((s) => s.voiceEnabled);
  const [phase, setPhase] = useState<VoiceConversationPhase>('idle');
  const [muted, setMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcriptPreview, setTranscriptPreview] = useState('');

  const activeRef = useRef(false);
  const autoListenRef = useRef(false);
  const voiceInputEnabledRef = useRef(voiceInputEnabled);
  voiceInputEnabledRef.current = voiceInputEnabled;
  const mutedRef = useRef(false);
  const pttHeldRef = useRef(false);
  const captureRef = useRef<CaptureEntry | null>(null);
  const turnInFlightRef = useRef<object | null>(null);
  const speechRef = useRef<VoiceOutputHandle | null>(null);
  const sessionRef = useRef(0);
  const startListeningRef = useRef<() => void>(() => {});
  const openingReplyRef = useRef<Promise<string | null | undefined> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const stopSpeaking = useCallback(() => {
    const speech = speechRef.current;
    speechRef.current = null;
    return speech?.stop().catch(() => undefined) ?? Promise.resolve();
  }, []);

  const cancelCapture = useCallback(() => {
    const entry = captureRef.current;
    if (!entry) return Promise.resolve();
    captureRef.current = null;
    entry.consumed = true;
    entry.abort.abort();
    return entry.capture?.cancel() ?? Promise.resolve();
  }, []);

  const hapticTap = useCallback(() => {
    if (optionsRef.current.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const respondToText = useCallback(async (text: string): Promise<boolean> => {
    const openingReply = openingReplyRef.current;
    openingReplyRef.current = null;
    const turnOptions = optionsRef.current;
    const owner = turnOptions.speechOwner;
    if (!activeRef.current || turnInFlightRef.current || !owner?.isCurrent()) return false;
    const turn = {};
    const session = sessionRef.current;
    const current = () =>
      activeRef.current &&
      sessionRef.current === session &&
      optionsRef.current.speechOwner === owner &&
      owner.isCurrent();
    turnInFlightRef.current = turn;
    setPhase('thinking');
    setAudioLevel(0);

    const trimmed = text.trim();
    if (!trimmed) {
      setPhase('idle');
      if (turnInFlightRef.current === turn) turnInFlightRef.current = null;
      return false;
    }
    setTranscriptPreview(trimmed);

    let aiResponse: string | null | undefined;
    try {
      aiResponse = await (openingReply ?? turnOptions.sendMessage(trimmed));
    } catch (err) {
      if (current()) {
        const message =
          err instanceof Error && err.message.trim()
            ? err.message
            : 'Voice message could not be sent. Try again.';
        setTranscriptPreview(message);
        setPhase('idle');
      }
      if (turnInFlightRef.current === turn) turnInFlightRef.current = null;
      return false;
    }

    if (turnInFlightRef.current === turn) turnInFlightRef.current = null;
    if (!current()) return true;
    if (!aiResponse?.trim()) {
      setTranscriptPreview('Sent to chat.');
      setPhase('idle');
      setAudioLevel(0);
      return true;
    }

    setPhase('speaking');
    const speech = owner.start(aiResponse.trim(), {
      ...turnOptions.speechOptions,
      onStart: () => {
        if (current() && speechRef.current === speech) setAudioLevel(0.5);
      },
    });
    speechRef.current = speech;
    const outcome = await speech.done;
    if (!current() || speechRef.current !== speech) return true;
    speechRef.current = null;
    setAudioLevel(0);
    if (outcome.status === 'done' && autoListenRef.current && !mutedRef.current) {
      startListeningRef.current();
    } else {
      setPhase('idle');
    }
    return true;
  }, []);

  const processTranscript = useCallback(
    async (entry: CaptureEntry, text: string) => {
      if (entry.consumed || entry.session !== sessionRef.current) return;
      entry.consumed = true;
      if (captureRef.current === entry) captureRef.current = null;
      if (entry.stopRequestedAt) {
        optionsRef.current.onSttComplete?.(Date.now() - entry.stopRequestedAt);
      }
      await respondToText(text);
    },
    [respondToText],
  );

  const submitText = useCallback(
    async (text: string): Promise<boolean> => {
      if (!text.trim() || !activeRef.current || turnInFlightRef.current) return false;
      const session = sessionRef.current;
      const speechStopped = stopSpeaking();
      autoListenRef.current = false;
      await cancelCapture();
      await speechStopped;
      if (!activeRef.current || sessionRef.current !== session) return false;
      return respondToText(text);
    },
    [cancelCapture, respondToText, stopSpeaking],
  );

  const stopListeningAndProcess = useCallback(async () => {
    if (!activeRef.current) return;
    const entry = captureRef.current;
    if (!entry || entry.consumed) return;
    entry.stopRequestedAt = Date.now();
    setPhase('thinking');
    setAudioLevel(0);
    hapticTap();
    if (entry.capture) await entry.capture.stop();
    else entry.abort.abort();
  }, [hapticTap]);

  const startListening = useCallback(
    async (viaPtt = false) => {
      const turnOptions = optionsRef.current;
      const owner = turnOptions.speechOwner;
      if (
        !activeRef.current ||
        mutedRef.current ||
        turnInFlightRef.current ||
        !owner?.isCurrent()
      ) {
        return;
      }
      if (captureRef.current || VoiceInput.isCapturing()) return;
      if (!voiceInputEnabledRef.current) {
        setPhase('idle');
        optionsRef.current.onCaptureError?.(
          new VoiceInput.VoiceCaptureError('voice-input-disabled', VOICE_INPUT_DISABLED_MESSAGE),
        );
        return;
      }

      const entry: CaptureEntry = {
        consumed: false,
        stopRequestedAt: null,
        session: sessionRef.current,
        owner,
        abort: new AbortController(),
        capture: null,
      };
      const current = () =>
        activeRef.current &&
        entry.session === sessionRef.current &&
        optionsRef.current.speechOwner === owner &&
        owner.isCurrent();
      captureRef.current = entry;
      try {
        setTranscriptPreview('');
        hapticTap();
        const session = await VoiceInput.startCaptureSession(
          (event) => {
            if (!current() || entry.consumed) return;
            setAudioLevel(meteringToAmplitude(event.metering));
          },
          undefined,
          { lang: activeSpeechLanguage(), signal: entry.abort.signal },
        );
        entry.capture = session;
        session.result.then(
          ({ text }) => {
            if (!current()) return;
            void processTranscript(entry, text);
          },
          (err: unknown) => {
            if (entry.consumed) return;
            entry.consumed = true;
            if (captureRef.current === entry) captureRef.current = null;
            if (!current()) return;
            setPhase('idle');
            setAudioLevel(0);
            // A recognizer that fails after capture started is still a failure
            // the caller has to show; only a deliberate abort stays silent.
            if (err instanceof VoiceInput.VoiceCaptureError && err.code === 'aborted') return;
            turnOptions.onCaptureError?.(err);
          },
        );
        if (!current() || entry.consumed) {
          entry.abort.abort();
          await session.cancel();
          return;
        }
        if (viaPtt && !pttHeldRef.current) {
          void stopListeningAndProcess();
          return;
        }
        setPhase('listening');
      } catch (err) {
        if (captureRef.current === entry) captureRef.current = null;
        if (current() && !entry.consumed) {
          setPhase('idle');
          if (err instanceof VoiceInput.VoiceCaptureError && err.code === 'aborted') return;
          turnOptions.onCaptureError?.(err);
        }
      }
    },
    [hapticTap, processTranscript, stopListeningAndProcess],
  );

  startListeningRef.current = () => {
    void startListening();
  };

  const handleOrbPress = useCallback(() => {
    if (phase === 'idle') {
      autoListenRef.current = autoListenEnabled();
      void startListening();
    } else if (phase === 'listening') {
      void stopListeningAndProcess();
    } else if (phase === 'speaking') {
      void stopSpeaking();
      autoListenRef.current = autoListenEnabled();
      void startListening();
    }
  }, [phase, startListening, stopListeningAndProcess, stopSpeaking]);

  const handleOrbPressIn = useCallback(() => {
    pttHeldRef.current = true;
    autoListenRef.current = false;
    if (phase === 'speaking') {
      void stopSpeaking();
      void startListening(true);
    } else if (phase === 'idle') {
      void startListening(true);
    }
  }, [phase, startListening, stopSpeaking]);

  const handleOrbPressOut = useCallback(() => {
    pttHeldRef.current = false;
    if (captureRef.current) {
      void stopListeningAndProcess();
    }
  }, [stopListeningAndProcess]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    hapticTap();
    if (next && captureRef.current) {
      void cancelCapture();
      setPhase('idle');
      setAudioLevel(0);
    }
  }, [muted, hapticTap, cancelCapture]);

  const handleMicPress = useCallback(() => {
    if (mutedRef.current) {
      setMuted(false);
      mutedRef.current = false;
      hapticTap();
    } else if (phase !== 'idle') {
      toggleMute();
      return;
    }
    if (phase !== 'idle') return;
    autoListenRef.current = autoListenEnabled();
    void startListening();
  }, [hapticTap, phase, startListening, toggleMute]);

  const endConversation = useCallback(async () => {
    sessionRef.current += 1;
    turnInFlightRef.current = null;
    const speechStopped = stopSpeaking();
    autoListenRef.current = false;
    await cancelCapture();
    await speechStopped;
  }, [cancelCapture, stopSpeaking]);

  useEffect(() => {
    if (options.pttMode) autoListenRef.current = false;
  }, [options.pttMode]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        activeRef.current =
          optionsRef.current.enabled && Boolean(optionsRef.current.speechOwner?.isCurrent());
        return;
      }
      if (!optionsRef.current.enabled) return;
      activeRef.current = false;
      autoListenRef.current = false;
      pttHeldRef.current = false;
      setPhase('idle');
      setAudioLevel(0);
      setTranscriptPreview('Voice paused when AGI left the foreground.');
      void endConversation();
    });
    return () => subscription.remove();
  }, [endConversation]);

  useLayoutEffect(() => {
    sessionRef.current += 1;
    if (options.enabled && options.speechOwner?.isCurrent()) {
      activeRef.current = true;
      setPhase('idle');
      setMuted(false);
      mutedRef.current = false;
      setAudioLevel(0);
      setTranscriptPreview('');
      const openingTurn = optionsRef.current.openingTurn;
      if (openingTurn) {
        autoListenRef.current = autoListenEnabled();
        openingReplyRef.current = openingTurn.reply;
        optionsRef.current.onOpeningTurnStarted?.();
        void respondToText(openingTurn.text);
      } else if (optionsRef.current.listenOnEnable) {
        autoListenRef.current = autoListenEnabled();
        startListeningRef.current();
      }
    } else {
      activeRef.current = false;
      void endConversation();
    }
    return () => {
      activeRef.current = false;
      void endConversation();
    };
  }, [options.enabled, options.speechOwner, endConversation, respondToText]);

  return {
    phase,
    muted,
    audioLevel,
    transcriptPreview,
    submitText,
    handleOrbPress,
    handleOrbPressIn,
    handleOrbPressOut,
    toggleMute,
    handleMicPress,
    endConversation,
  };
}
