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
import { useSettingsStore } from '@/stores/settingsStore';
import * as VoiceService from '@/services/voice';
import type { VoiceMeteringEvent } from '@/services/voice';

/**
 * Mic button for the chat input bar.
 *
 * States:
 * - idle: gray mic icon
 * - recording: red pulsing mic with animated ring
 * - processing: spinning loader
 *
 * Tap to start/stop recording. Long press opens full voice conversation mode.
 */

interface VoiceInputButtonProps {
  /** Called when transcription is complete */
  onTranscription: (text: string) => void;
  /** Called when recording starts — parent may show RecordingOverlay */
  onRecordingStart: () => void;
  /** Called when recording stops (before transcription completes) */
  onRecordingStop: () => void;
  /** Called with metering data while recording */
  onMetering?: (event: VoiceMeteringEvent) => void;
  /** Called on long press to open full voice conversation */
  onLongPress?: () => void;
  /** Called when an error occurs */
  onError?: (error: string) => void;
  /** Whether the button is disabled (e.g., while streaming) */
  disabled?: boolean;
}

type VoiceState = 'idle' | 'recording' | 'processing';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Duration (ms) before recognizing a long press */
const LONG_PRESS_DELAY = 500;

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

  // Animated ring for recording state
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);
  const spinRotation = useSharedValue(0);

  // Track whether this press was a long press
  const isLongPressRef = useRef(false);

  // Start pulsing ring animation when recording
  useEffect(() => {
    if (state === 'recording') {
      ringOpacity.value = withRepeat(withTiming(0.6, { duration: 1000 }), -1, true);
      ringScale.value = withRepeat(withTiming(1.6, { duration: 1000 }), -1, true);
    } else {
      cancelAnimation(ringOpacity);
      cancelAnimation(ringScale);
      ringOpacity.value = withSpring(0, { damping: 15 });
      ringScale.value = withSpring(1, { damping: 15 });
    }
  }, [state, ringOpacity, ringScale]);

  // Spin animation for processing state
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

  const startRecording = useCallback(async () => {
    try {
      setState('recording');
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      onRecordingStart();

      await VoiceService.startRecording((event) => {
        onMetering?.(event);
      });
    } catch (err) {
      setState('idle');
      const message = err instanceof Error ? err.message : 'Failed to start recording';
      onError?.(message);
    }
  }, [hapticsEnabled, onRecordingStart, onMetering, onError]);

  const stopAndTranscribe = useCallback(async () => {
    try {
      setState('processing');
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onRecordingStop();

      const uri = await VoiceService.stopRecording();
      const result = await VoiceService.transcribe(uri);

      setState('idle');
      if (result.text.trim()) {
        onTranscription(result.text.trim());
      }
    } catch (err) {
      setState('idle');
      const message = err instanceof Error ? err.message : 'Transcription failed';
      onError?.(message);
    }
  }, [hapticsEnabled, onRecordingStop, onTranscription, onError]);

  const handlePress = useCallback(() => {
    // Skip if this was triggered by a long press
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }

    if (state === 'idle') {
      startRecording();
    } else if (state === 'recording') {
      stopAndTranscribe();
    }
    // Ignore press during 'processing'
  }, [state, startRecording, stopAndTranscribe]);

  const handleLongPress = useCallback(() => {
    isLongPressRef.current = true;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    onLongPress?.();
  }, [hapticsEnabled, onLongPress]);

  const iconColor =
    state === 'recording'
      ? colors.agentError
      : state === 'processing'
        ? colors.teal
        : colors.textMuted;

  const isDisabled = disabled || state === 'processing';

  return (
    <View className="relative items-center justify-center">
      {/* Pulsing ring behind the button (recording state) */}
      {state === 'recording' && (
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
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={LONG_PRESS_DELAY}
        disabled={isDisabled}
        className="p-1.5 rounded-lg active:bg-white/5 z-10"
        style={isDisabled ? { opacity: 0.5 } : undefined}
        accessibilityLabel={
          state === 'recording'
            ? 'Stop recording'
            : state === 'processing'
              ? 'Processing voice...'
              : 'Start voice recording'
        }
        accessibilityHint="Tap to toggle recording. Long press for voice conversation mode."
        accessibilityRole="button"
      >
        {state === 'processing' ? (
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
