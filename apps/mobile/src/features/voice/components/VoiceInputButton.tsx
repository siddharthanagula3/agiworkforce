// AUDIT-FIX: STT-WIRE
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
import { useThemeColors } from '@/src/ui/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import * as VoiceService from '@/src/features/voice/services/voice';
import type { VoiceMeteringEvent } from '@/src/features/voice/services/voice';
import { VoiceCaptureError } from '@/src/features/voice/services/voiceInput';

/**
 * Unified mic button for the chat input bar.
 *
 * Single button, three gestures:
 *   TAP            → tap-to-toggle on-device STT
 *   HOLD (>300ms)  → push-to-talk on-device STT
 *   LONG PRESS     → opens full voice conversation mode (onLongPress callback)
 *
 * All paths route through {@link VoiceService.startRecording} /
 * {@link VoiceService.stopRecording} — the in-file `Audio.Recording` stub
 * that previously bypassed the STT pipeline has been removed.
 */

interface VoiceInputButtonProps {
  onTranscription: (text: string) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  onMetering?: (event: VoiceMeteringEvent) => void;
  onLongPress?: () => void;
  onError?: (error: string) => void;
  resetSignal?: number;
  disabled?: boolean;
}

type VoiceState = 'idle' | 'recording' | 'ptt' | 'processing';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PTT_THRESHOLD_MS = 300;
const LONG_PRESS_DELAY_MS = 600;

export function VoiceInputButton({
  onTranscription,
  onRecordingStart,
  onRecordingStop,
  onMetering,
  onLongPress,
  onError,
  resetSignal = 0,
  disabled = false,
}: VoiceInputButtonProps) {
  const colors = useThemeColors();
  const [state, setState] = useState<VoiceState>('idle');
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);
  const spinRotation = useSharedValue(0);

  const pressStartRef = useRef<number>(0);
  const isLongPressRef = useRef(false);
  const isPTTRef = useRef(false);

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

  useEffect(() => {
    if (resetSignal <= 0) return;
    pressStartRef.current = 0;
    isLongPressRef.current = false;
    isPTTRef.current = false;
    setState('idle');
  }, [resetSignal]);

  const reportError = useCallback(
    (err: unknown) => {
      if (err instanceof VoiceCaptureError && err.code === 'mic-permission-denied') {
        onError?.('Voice input needs microphone and speech recognition access.');
        return;
      }
      const message = err instanceof Error ? err.message : 'Voice capture failed';
      onError?.(message);
    },
    [onError],
  );

  const startTapRecording = useCallback(async () => {
    try {
      setState('recording');
      if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onRecordingStart?.();
      await VoiceService.startRecording((event) => onMetering?.(event));
    } catch (err) {
      setState('idle');
      pressStartRef.current = 0;
      isPTTRef.current = false;
      onRecordingStop?.();
      reportError(err);
    }
  }, [hapticsEnabled, onRecordingStart, onRecordingStop, onMetering, reportError]);

  const stopTapRecording = useCallback(async () => {
    try {
      setState('processing');
      if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onRecordingStop?.();

      await VoiceService.stopRecording();
      const result = await VoiceService.transcribe('');

      setState('idle');
      if (result.text.trim()) onTranscription(result.text.trim());
    } catch (err) {
      setState('idle');
      reportError(err);
    }
  }, [hapticsEnabled, onRecordingStop, onTranscription, reportError]);

  const startPTTRecording = useCallback(async () => {
    try {
      if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      isPTTRef.current = true;
      setState('ptt');
      onRecordingStart?.();
      await VoiceService.startRecording((event) => onMetering?.(event));
    } catch (err) {
      isPTTRef.current = false;
      setState('idle');
      pressStartRef.current = 0;
      onRecordingStop?.();
      reportError(err);
    }
  }, [hapticsEnabled, onMetering, onRecordingStart, onRecordingStop, reportError]);

  const stopPTTRecording = useCallback(async () => {
    isPTTRef.current = false;
    try {
      setState('processing');
      if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onRecordingStop?.();

      await VoiceService.stopRecording();
      const result = await VoiceService.transcribe('');

      setState('idle');
      if (result.text.trim()) onTranscription(result.text.trim());
    } catch (err) {
      setState('idle');
      reportError(err);
    }
  }, [hapticsEnabled, onRecordingStop, onTranscription, reportError]);

  const handlePressIn = useCallback(() => {
    if (disabled || state === 'processing') return;
    if (state === 'recording') {
      pressStartRef.current = Date.now();
      return;
    }
    if (state !== 'idle') return;
    pressStartRef.current = Date.now();
    isLongPressRef.current = false;
    isPTTRef.current = false;

    setTimeout(() => {
      if (!isLongPressRef.current && pressStartRef.current > 0) {
        startPTTRecording();
      }
    }, PTT_THRESHOLD_MS);
  }, [disabled, state, startPTTRecording]);

  const handlePressOut = useCallback(() => {
    const holdMs = Date.now() - pressStartRef.current;
    pressStartRef.current = 0;

    if (isLongPressRef.current) return;

    if (state === 'recording') {
      stopTapRecording();
      return;
    }

    if (isPTTRef.current || state === 'ptt') {
      stopPTTRecording();
      return;
    }

    if (holdMs < PTT_THRESHOLD_MS) {
      if (state === 'idle') {
        startTapRecording();
      }
    }
  }, [state, stopPTTRecording, startTapRecording, stopTapRecording]);

  const handleLongPress = useCallback(() => {
    isLongPressRef.current = true;
    pressStartRef.current = 0;
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onLongPress?.();
  }, [hapticsEnabled, onLongPress]);

  const isActive = state === 'recording' || state === 'ptt';
  const isProcessing = state === 'processing';
  const isDisabled = disabled || isProcessing;

  const iconColor = isActive
    ? colors.agentError
    : isProcessing
      ? colors.teal
      : colors.textSecondary;

  const accessibilityLabel =
    state === 'recording'
      ? 'Tap to stop recording'
      : state === 'ptt'
        ? 'Release to transcribe'
        : state === 'processing'
          ? 'Processing voice...'
          : 'Tap to record, hold for push-to-talk';

  return (
    <View className="relative items-center justify-center">
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
        style={[
          {
            padding: 6,
            borderRadius: 8,
            backgroundColor: colors.transparent,
          },
          isDisabled ? { opacity: 0.5 } : undefined,
        ]}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Tap to start or stop recording. Hold for instant push-to-talk. Long press for voice conversation mode."
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
