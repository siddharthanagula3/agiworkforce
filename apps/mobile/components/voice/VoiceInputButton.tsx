import { useState, useCallback, useRef, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  cancelAnimation,
} from 'react-native-reanimated';
import { Mic, Loader } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '@/lib/theme';
import { DEEPGRAM_API_KEY } from '@/lib/constants';
import { useSettingsStore } from '@/stores/settingsStore';
import * as VoiceService from '@/services/voice';
import type { VoiceMeteringEvent } from '@/services/voice';

/**
 * Unified mic button for the chat input bar.
 *
 * Interaction model (single button, three gestures):
 *   TAP            → tap-to-toggle recording via VoiceService (server Whisper STT)
 *   HOLD (>300ms)  → push-to-talk via Deepgram Nova-3 (direct, low-latency STT)
 *                    falls back to VoiceService if no EXPO_PUBLIC_DEEPGRAM_API_KEY
 *   LONG PRESS     → opens full voice conversation mode (onLongPress callback)
 *
 * States:
 *   idle        → gray mic icon
 *   recording   → red pulsing mic + animated ring  (tap-to-toggle path)
 *   ptt         → red solid mic + animated ring    (hold-to-record path)
 *   processing  → spinning loader
 */

interface VoiceInputButtonProps {
  /** Called when transcription is complete */
  onTranscription: (text: string) => void;
  /** Called when recording starts — parent may show RecordingOverlay */
  onRecordingStart?: () => void;
  /** Called when recording stops (before transcription completes) */
  onRecordingStop?: () => void;
  /** Called with metering data while recording */
  onMetering?: (event: VoiceMeteringEvent) => void;
  /** Called on long press to open full voice conversation */
  onLongPress?: () => void;
  /** Called when an error occurs */
  onError?: (error: string) => void;
  /** Whether the button is disabled (e.g., while AI is streaming) */
  disabled?: boolean;
}

type VoiceState = 'idle' | 'recording' | 'ptt' | 'processing';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A tap shorter than this threshold is a "tap"; longer is PTT hold. */
const PTT_THRESHOLD_MS = 300;
/** Delay before recognising a long press (opens voice mode). */
const LONG_PRESS_DELAY_MS = 600;

export function VoiceInputButton({
  onTranscription,
  onRecordingStart,
  onRecordingStop,
  onMetering,
  onLongPress,
  onError,
  disabled = false,
}: VoiceInputButtonProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  // Animated ring (recording / ptt states)
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);
  // Spinner rotation (processing state)
  const spinRotation = useSharedValue(0);

  // Track press-start time to distinguish tap vs hold
  const pressStartRef = useRef<number>(0);
  // Whether this touch was resolved as a long-press (skip tap handler)
  const isLongPressRef = useRef(false);
  // Whether we entered PTT mode on this press (so pressOut knows what to do)
  const isPTTRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Animations
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (state === 'recording' || state === 'ptt') {
      ringOpacity.value = withRepeat(withTiming(0.55, { duration: 900 }), -1, true);
      ringScale.value = withRepeat(withTiming(1.6, { duration: 900 }), -1, true);
    } else {
      cancelAnimation(ringOpacity);
      cancelAnimation(ringScale);
      ringOpacity.value = withSpring(0, { damping: 15 });
      ringScale.value = withSpring(1, { damping: 15 });
    }
  }, [state, ringOpacity, ringScale]);

  useEffect(() => {
    if (state === 'processing') {
      spinRotation.value = withRepeat(withTiming(360, { duration: 1000 }), -1, false);
    } else {
      cancelAnimation(spinRotation);
      spinRotation.value = 0;
    }
  }, [state, spinRotation]);

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const spinAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinRotation.value}deg` }],
  }));

  // ---------------------------------------------------------------------------
  // Tap-to-toggle path (VoiceService / Whisper)
  // ---------------------------------------------------------------------------
  const startTapRecording = useCallback(async () => {
    try {
      setState('recording');
      if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onRecordingStart?.();
      await VoiceService.startRecording((event) => onMetering?.(event));
    } catch (err) {
      setState('idle');
      const message = err instanceof Error ? err.message : 'Failed to start recording';
      onError?.(message);
    }
  }, [hapticsEnabled, onRecordingStart, onMetering, onError]);

  const stopTapRecording = useCallback(async () => {
    try {
      setState('processing');
      if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onRecordingStop?.();

      const uri = await VoiceService.stopRecording();
      const result = await VoiceService.transcribe(uri);

      setState('idle');
      if (result.text.trim()) onTranscription(result.text.trim());
    } catch (err) {
      setState('idle');
      const message = err instanceof Error ? err.message : 'Transcription failed';
      onError?.(message);
    }
  }, [hapticsEnabled, onRecordingStop, onTranscription, onError]);

  // ---------------------------------------------------------------------------
  // PTT path (hold-to-record → Deepgram or Whisper fallback)
  // ---------------------------------------------------------------------------
  const pttRecordingRef = useRef<import('expo-av').Audio.Recording | null>(null);

  const startPTTRecording = useCallback(async () => {
    try {
      const { Audio } = await import('expo-av');
      if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        onError?.('Microphone permission denied');
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      pttRecordingRef.current = recording;
      isPTTRef.current = true;
      setState('ptt');
      onRecordingStart?.();
    } catch (err) {
      isPTTRef.current = false;
      setState('idle');
      const message = err instanceof Error ? err.message : 'Failed to start PTT recording';
      onError?.(message);
    }
  }, [hapticsEnabled, onRecordingStart, onError]);

  const stopPTTRecording = useCallback(async () => {
    isPTTRef.current = false;
    const recording = pttRecordingRef.current;
    pttRecordingRef.current = null;

    if (!recording) {
      setState('idle');
      return;
    }

    try {
      setState('processing');
      if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onRecordingStop?.();

      const { Audio } = await import('expo-av');
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      const uri = recording.getURI();
      if (!uri) throw new Error('No recording URI returned');

      let transcript = '';
      if (DEEPGRAM_API_KEY) {
        transcript = await VoiceService.transcribeWithDeepgram(uri, DEEPGRAM_API_KEY);
      } else {
        // No Deepgram key — fall back to server Whisper
        const result = await VoiceService.transcribe(uri);
        transcript = result.text;
      }

      setState('idle');
      if (transcript.trim()) onTranscription(transcript.trim());
    } catch (err) {
      setState('idle');
      try {
        const { Audio } = await import('expo-av');
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      } catch {
        // ignore cleanup error
      }
      const message = err instanceof Error ? err.message : 'PTT transcription failed';
      onError?.(message);
    }
  }, [hapticsEnabled, onRecordingStop, onTranscription, onError]);

  // ---------------------------------------------------------------------------
  // Gesture handlers
  // ---------------------------------------------------------------------------
  const handlePressIn = useCallback(() => {
    if (disabled || state !== 'idle') return;
    pressStartRef.current = Date.now();
    isLongPressRef.current = false;
    isPTTRef.current = false;

    // Schedule PTT start after threshold (if user keeps holding)
    setTimeout(() => {
      if (!isLongPressRef.current && pressStartRef.current > 0) {
        startPTTRecording();
      }
    }, PTT_THRESHOLD_MS);
  }, [disabled, state, startPTTRecording]);

  const handlePressOut = useCallback(() => {
    const holdMs = Date.now() - pressStartRef.current;
    pressStartRef.current = 0;

    if (isLongPressRef.current) {
      // Long-press was handled — nothing to do on release
      return;
    }

    if (isPTTRef.current || state === 'ptt') {
      // PTT path: release → transcribe
      stopPTTRecording();
      return;
    }

    if (holdMs < PTT_THRESHOLD_MS) {
      // Short tap → toggle tap-to-record
      if (state === 'idle') {
        startTapRecording();
      } else if (state === 'recording') {
        stopTapRecording();
      }
    }
    // If holdMs >= PTT_THRESHOLD_MS but PTT didn't start (e.g. perm denied), just reset
  }, [state, isPTTRef, stopPTTRecording, startTapRecording, stopTapRecording]);

  const handleLongPress = useCallback(() => {
    isLongPressRef.current = true;
    pressStartRef.current = 0;
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onLongPress?.();
  }, [hapticsEnabled, onLongPress]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const isActive = state === 'recording' || state === 'ptt';
  const isProcessing = state === 'processing';
  const isDisabled = disabled || isProcessing;

  const iconColor = isActive ? colors.agentError : isProcessing ? colors.teal : colors.textMuted;

  const accessibilityLabel =
    state === 'recording'
      ? 'Tap to stop recording'
      : state === 'ptt'
        ? 'Release to transcribe'
        : state === 'processing'
          ? 'Processing voice...'
          : DEEPGRAM_API_KEY
            ? 'Tap to record, hold for push-to-talk'
            : 'Tap to toggle voice recording';

  return (
    <View className="relative items-center justify-center">
      {/* Pulsing ring — visible during recording and PTT */}
      {isActive && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.agentError,
            },
            ringAnimatedStyle,
          ]}
        />
      )}

      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLongPress={handleLongPress}
        delayLongPress={LONG_PRESS_DELAY_MS}
        disabled={isDisabled}
        className="p-1.5 rounded-lg active:bg-white/5 z-10"
        style={isDisabled ? { opacity: 0.5 } : undefined}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={
          DEEPGRAM_API_KEY
            ? 'Tap to start or stop recording. Hold for instant push-to-talk. Long press for voice conversation mode.'
            : 'Tap to start or stop recording. Long press for voice conversation mode.'
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: isProcessing }}
      >
        {isProcessing ? (
          <Animated.View style={spinAnimatedStyle}>
            <Loader size={20} color={iconColor} />
          </Animated.View>
        ) : (
          <Mic size={20} color={iconColor} />
        )}
      </AnimatedPressable>
    </View>
  );
}
