import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';

/**
 * useVoiceConversation — shared turn-taking loop for the two-way voice surfaces
 * (the inline VoiceInlineBar in chat and the /voice companion route).
 *
 * Owns the listen → think → speak cycle in both interaction modes:
 *  - hands-free: tap the orb to start; the recognizer finalizes on its own
 *    after end-of-utterance silence (no tap needed), and listening auto-resumes
 *    after the AI finishes speaking.
 *  - push-to-talk: the mic is live ONLY while the orb is held (press-in starts,
 *    press-out sends) and auto-relisten is disabled.
 *
 * Every capture goes through VoiceInput.startCaptureSession directly so the
 * session's `result` promise can drive the turn when the OS recognizer ends on
 * silence — the UI never sticks in 'listening' waiting for a tap.
 */

export type VoiceConversationPhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface SpeakCallbacks {
  onStart: () => void;
  onDone: () => void;
  onStopped: () => void;
}

export interface UseVoiceConversationOptions {
  /** Whether the conversation surface is active (visible / mounted). */
  enabled: boolean;
  /** Push-to-talk: mic is live only while the orb is held; auto-relisten is off. */
  /**
   * Hold-to-talk. Optional, defaulting to hands-free: the chat voice overlay
   * drops push-to-talk for ChatGPT parity while Settings > Voice still offers
   * it, so the two surfaces differ without forking the hook.
   */
  pttMode?: boolean;
  hapticsEnabled: boolean;
  /** Send the final transcript to the chat engine; resolves with assistant text to speak. */
  sendMessage: (text: string) => Promise<string | null | undefined>;
  /** Speak assistant text on the surface's TTS backend, wiring the given callbacks. */
  speak: (text: string, callbacks: SpeakCallbacks) => Promise<void>;
  /** Stop any in-flight TTS. */
  stopSpeaking: () => void | Promise<void>;
  /** Surface capture-start failures (permission, availability) to the user. */
  onCaptureError?: (err: unknown) => void;
  /** Reports the stop→final STT latency in ms (0 when the recognizer finalized on its own). */
  onSttComplete?: (ms: number) => void;
}

interface CaptureEntry {
  /** Set once this session's transcript has been handled — guards the tap /
   *  PTT-release path racing the recognizer's own end-of-utterance final. */
  consumed: boolean;
  stopRequestedAt: number | null;
}

/** User-facing message for capture-start failures. Shared by both voice screens. */
export function voiceCaptureErrorMessage(err: unknown): string {
  if (err instanceof VoiceInput.VoiceCaptureError) {
    if (err.code === 'mic-permission-denied') {
      return 'Microphone access is off. Enable microphone permission in Settings to use voice.';
    }
    if (err.code === 'on-device-recognition-unavailable') {
      return 'On-device speech recognition is not available for this device or language yet.';
    }
    if (err.code === 'already-active') return 'Voice capture is already running.';
    return err.message;
  }
  return 'Voice input could not start. Please try again.';
}

export function useVoiceConversation(options: UseVoiceConversationOptions) {
  const [phase, setPhase] = useState<VoiceConversationPhase>('idle');
  const [muted, setMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcriptPreview, setTranscriptPreview] = useState('');

  const activeRef = useRef(false);
  const autoListenRef = useRef(false);
  const mutedRef = useRef(false);
  const pttHeldRef = useRef(false);
  const captureRef = useRef<CaptureEntry | null>(null);
  const startListeningRef = useRef<() => void>(() => {});
  // Latest-options ref keeps the handlers below stable while always reading
  // fresh callbacks/prefs, so screens can pass inline closures safely.
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
    optionsRef.current.onSttComplete?.(
      entry.stopRequestedAt ? Date.now() - entry.stopRequestedAt : 0,
    );

    if (!activeRef.current) return;
    // Auto-final arrives straight from 'listening'; tap / PTT-release already set 'thinking'.
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
        // Prefer the sender's real, user-readable reason (sign-in gate,
        // mode mismatch, …) over the generic retry copy.
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
    // The final transcript arrives via session.result → processTranscript.
    await VoiceInput.stopCapture();
  }, [hapticTap]);

  const startListening = useCallback(
    async (viaPtt = false) => {
      if (!activeRef.current || mutedRef.current) return;
      if (VoiceInput.isCapturing()) return;

      try {
        setTranscriptPreview('');
        hapticTap();
        const entry: CaptureEntry = { consumed: false, stopRequestedAt: null };
        const session = await VoiceInput.startCaptureSession((event) => {
          if (!activeRef.current) return;
          // Normalize metering from dB (-160..0) to 0..1
          const normalized = Math.max(0, Math.min(1, (event.metering + 60) / 60));
          setAudioLevel(normalized);
        });
        captureRef.current = entry;
        // The recognizer finalizes on its own after end-of-utterance silence
        // (continuous: false) — process that final without requiring a tap.
        session.result.then(
          ({ text }) => {
            void processTranscript(entry, text);
          },
          () => {
            if (entry.consumed) return;
            entry.consumed = true;
            if (captureRef.current === entry) captureRef.current = null;
            if (activeRef.current) {
              setPhase('idle');
              setAudioLevel(0);
            }
          },
        );
        if (!activeRef.current) return;
        if (viaPtt && !pttHeldRef.current) {
          // Orb released before the recognizer finished starting — treat as a
          // short press so the mic never stays hot after the finger lifts.
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

  /** Hands-free tap: idle→listen, listening→send, speaking→interrupt+listen. */
  const handleOrbPress = useCallback(() => {
    if (phase === 'idle') {
      autoListenRef.current = true;
      void startListening();
    } else if (phase === 'listening') {
      void stopListeningAndProcess();
    } else if (phase === 'speaking') {
      void optionsRef.current.stopSpeaking();
      autoListenRef.current = true;
      void startListening();
    }
  }, [phase, startListening, stopListeningAndProcess]);

  /** PTT hold start: mic goes live only while held; never auto-relisten. */
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

  /** PTT release: stop the mic and process whatever was captured. */
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

  /** Stop capture + TTS and disarm auto-relisten. Screens call this on end/close. */
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

  // Flipping to PTT mid-conversation must kill hands-free auto-relisten.
  useEffect(() => {
    if (options.pttMode) autoListenRef.current = false;
  }, [options.pttMode]);

  // The current native recognizer is a foreground-only interaction. Stop mic
  // capture and speech immediately when the app becomes inactive/backgrounded;
  // returning to AGI never resumes listening without another user gesture.
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

  // Release mic/recognizer/TTS if the surface unmounts while still active.
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
