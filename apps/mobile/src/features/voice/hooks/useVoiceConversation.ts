import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/stores/settingsStore';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import {
  activeSpeechLanguage,
  autoListenEnabled,
} from '@/src/features/voice/services/speechSettings';

export type VoiceConversationPhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface SpeakCallbacks {
  onStart: () => void;
  onDone: () => void;
  onStopped: () => void;
}

export interface UseVoiceConversationOptions {
  enabled: boolean;
  pttMode?: boolean;
  hapticsEnabled: boolean;
  sendMessage: (text: string) => Promise<string | null | undefined>;
  speak: (text: string, callbacks: SpeakCallbacks) => Promise<void>;
  stopSpeaking: () => void | Promise<void>;
  onCaptureError?: (err: unknown) => void;
  onSttComplete?: (ms: number) => void;
}

interface CaptureEntry {
  consumed: boolean;
  stopRequestedAt: number | null;
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
  const startListeningRef = useRef<() => void>(() => {});
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const hapticTap = useCallback(() => {
    if (optionsRef.current.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const processTranscript = useCallback(async (entry: CaptureEntry, text: string) => {
    if (entry.consumed) return;
    entry.consumed = true;
    if (captureRef.current === entry) captureRef.current = null;
    // Only a user-requested stop has a latency worth showing; a recognizer that
    // finalized on its own has no stop event to measure from.
    if (entry.stopRequestedAt) {
      optionsRef.current.onSttComplete?.(Date.now() - entry.stopRequestedAt);
    }

    if (!activeRef.current) return;
    setPhase('thinking');
    setAudioLevel(0);

    const trimmed = text.trim();
    if (!trimmed) {
      setPhase('idle');
      return;
    }
    setTranscriptPreview(trimmed);

    let aiResponse: string | null | undefined;
    try {
      aiResponse = await optionsRef.current.sendMessage(trimmed);
    } catch (err) {
      if (activeRef.current) {
        const message =
          err instanceof Error && err.message.trim()
            ? err.message
            : 'Voice message could not be sent. Try again.';
        setTranscriptPreview(message);
        setPhase('idle');
      }
      return;
    }

    if (!activeRef.current) return;
    if (!aiResponse?.trim()) {
      setTranscriptPreview('Sent to chat.');
      setPhase('idle');
      setAudioLevel(0);
      return;
    }

    setPhase('speaking');
    try {
      await optionsRef.current.speak(aiResponse.trim(), {
        onStart: () => {
          if (activeRef.current) setAudioLevel(0.5);
        },
        onDone: () => {
          if (!activeRef.current) return;
          setAudioLevel(0);
          if (autoListenRef.current) startListeningRef.current();
          else setPhase('idle');
        },
        onStopped: () => {
          if (activeRef.current) {
            setAudioLevel(0);
            setPhase('idle');
          }
        },
      });
    } catch {
      if (activeRef.current) {
        setPhase('idle');
        setAudioLevel(0);
      }
    }
  }, []);

  const stopListeningAndProcess = useCallback(async () => {
    if (!activeRef.current) return;
    const entry = captureRef.current;
    if (!entry || entry.consumed) return;
    entry.stopRequestedAt = Date.now();
    setPhase('thinking');
    setAudioLevel(0);
    hapticTap();
    await VoiceInput.stopCapture();
  }, [hapticTap]);

  const startListening = useCallback(
    async (viaPtt = false) => {
      if (!activeRef.current || mutedRef.current) return;
      if (VoiceInput.isCapturing()) return;
      if (!voiceInputEnabledRef.current) {
        setPhase('idle');
        optionsRef.current.onCaptureError?.(
          new VoiceInput.VoiceCaptureError('voice-input-disabled', VOICE_INPUT_DISABLED_MESSAGE),
        );
        return;
      }

      try {
        setTranscriptPreview('');
        hapticTap();
        const entry: CaptureEntry = { consumed: false, stopRequestedAt: null };
        const session = await VoiceInput.startCaptureSession(
          (event) => {
            if (!activeRef.current) return;
            const normalized = Math.max(0, Math.min(1, (event.metering + 60) / 60));
            setAudioLevel(normalized);
          },
          undefined,
          { lang: activeSpeechLanguage() },
        );
        captureRef.current = entry;
        session.result.then(
          ({ text }) => {
            void processTranscript(entry, text);
          },
          (err: unknown) => {
            if (entry.consumed) return;
            entry.consumed = true;
            if (captureRef.current === entry) captureRef.current = null;
            if (!activeRef.current) return;
            setPhase('idle');
            setAudioLevel(0);
            // A recognizer that fails after capture started is still a failure
            // the caller has to show; only a deliberate abort stays silent.
            if (err instanceof VoiceInput.VoiceCaptureError && err.code === 'aborted') return;
            optionsRef.current.onCaptureError?.(err);
          },
        );
        if (!activeRef.current) return;
        if (viaPtt && !pttHeldRef.current) {
          void stopListeningAndProcess();
          return;
        }
        setPhase('listening');
      } catch (err) {
        if (activeRef.current) {
          setPhase('idle');
          optionsRef.current.onCaptureError?.(err);
        }
      }
    },
    [hapticTap, processTranscript, stopListeningAndProcess],
  );

  useEffect(() => {
    startListeningRef.current = () => {
      void startListening();
    };
  }, [startListening]);

  const handleOrbPress = useCallback(() => {
    if (phase === 'idle') {
      autoListenRef.current = autoListenEnabled();
      void startListening();
    } else if (phase === 'listening') {
      void stopListeningAndProcess();
    } else if (phase === 'speaking') {
      void optionsRef.current.stopSpeaking();
      autoListenRef.current = autoListenEnabled();
      void startListening();
    }
  }, [phase, startListening, stopListeningAndProcess]);

  const handleOrbPressIn = useCallback(() => {
    pttHeldRef.current = true;
    autoListenRef.current = false;
    if (phase === 'speaking') {
      void optionsRef.current.stopSpeaking();
      void startListening(true);
    } else if (phase === 'idle') {
      void startListening(true);
    }
  }, [phase, startListening]);

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
      captureRef.current.consumed = true;
      captureRef.current = null;
      void VoiceInput.cancelCapture();
      setPhase('idle');
      setAudioLevel(0);
    }
  }, [muted, hapticTap]);

  const endConversation = useCallback(async () => {
    autoListenRef.current = false;
    const entry = captureRef.current;
    if (entry) entry.consumed = true;
    captureRef.current = null;
    if (VoiceInput.isCapturing()) {
      await VoiceInput.cancelCapture();
    }
    await optionsRef.current.stopSpeaking();
  }, []);

  useEffect(() => {
    if (options.pttMode) autoListenRef.current = false;
  }, [options.pttMode]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' || !optionsRef.current.enabled) return;
      autoListenRef.current = false;
      pttHeldRef.current = false;
      setPhase('idle');
      setAudioLevel(0);
      setTranscriptPreview('Voice paused when AGI left the foreground.');
      void endConversation();
    });
    return () => subscription.remove();
  }, [endConversation]);

  useEffect(() => {
    if (options.enabled) {
      activeRef.current = true;
      setPhase('idle');
      setMuted(false);
      mutedRef.current = false;
      setAudioLevel(0);
      setTranscriptPreview('');
    } else {
      activeRef.current = false;
      void endConversation();
    }
  }, [options.enabled, endConversation]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      void endConversation();
    };
  }, [endConversation]);

  return {
    phase,
    muted,
    audioLevel,
    transcriptPreview,
    handleOrbPress,
    handleOrbPressIn,
    handleOrbPressOut,
    toggleMute,
    endConversation,
  };
}
