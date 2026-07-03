import { useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { X, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Waveform } from './Waveform';
import { colors } from '@/src/ui/theme';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Semi-transparent overlay shown while recording from the chat input bar.
 * Displays a pulsing red dot, duration timer, waveform preview,
 * and Cancel / Send action buttons.
 */

interface RecordingOverlayProps {
  /** Whether the overlay is visible */
  visible: boolean;
  /** Current audio metering level (0-1) */
  audioLevel: number;
  /** Duration of recording in milliseconds */
  durationMs: number;
  /** Called when user taps cancel */
  onCancel: () => void;
  /** Called when user taps send/confirm */
  onSend: () => void;
}

/** Format ms to MM:SS */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function PulsingDot() {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
    } else {
      opacity.value = withRepeat(withTiming(0.3, { duration: 800 }), -1, true);
    }
  }, [opacity, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: colors.agentError,
        },
        animatedStyle,
      ]}
    />
  );
}

export function RecordingOverlay({
  visible,
  audioLevel,
  durationMs,
  onCancel,
  onSend,
}: RecordingOverlayProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const insets = useSafeAreaInsets();

  const handleCancel = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onCancel();
  };

  const handleSend = () => {
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onSend();
  };

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      className="absolute inset-x-0 bottom-0 px-4 pt-3"
      style={{
        backgroundColor: 'rgba(15, 15, 15, 0.95)',
        // Fixed pb-4 (16dp) put the Cancel/Send buttons partly under the home
        // indicator on devices with a safe-area inset — this overlay is
        // absolutely positioned flush to the composer's outer edge, so it
        // needs its own inset-aware bottom padding rather than relying on
        // the parent's paddingBottom (which absolute positioning ignores).
        paddingBottom: Math.max(insets.bottom + 8, 16),
        // This is declared before its composer-row siblings in ChatInput.tsx,
        // so without an explicit stacking order those siblings render on top
        // of it (RN's default is JSX declaration order, not visual overlay
        // intent) — only the portion below the composer's own bottom edge
        // was visible, hiding the "Recording"/timer/waveform rows entirely.
        zIndex: 50,
        elevation: 50,
      }}
      accessibilityRole="alert"
      accessibilityLabel="Recording in progress"
    >
      {/* Top row: pulsing dot + "Recording..." + timer */}
      <View className="flex-row items-center justify-center gap-2 mb-3">
        <PulsingDot />
        <Text className="text-red-400 text-sm font-medium">Recording</Text>
        <Text className="text-white/50 text-sm font-mono ml-2">{formatDuration(durationMs)}</Text>
      </View>

      {/* Waveform preview */}
      <View className="items-center mb-4">
        <Waveform
          color={colors.agentError}
          active
          audioLevel={audioLevel}
          barCount={7}
          maxHeight={32}
          minHeight={4}
          barWidth={3}
          gap={3}
        />
      </View>

      {/* Action buttons */}
      <View className="flex-row items-center justify-center gap-8">
        {/* Cancel */}
        <Pressable
          onPress={handleCancel}
          className="w-12 h-12 rounded-full bg-white/10 items-center justify-center active:bg-white/20"
          accessibilityLabel="Cancel recording"
          accessibilityRole="button"
        >
          <X size={22} color={colors.textSecondary} />
        </Pressable>

        {/* Send */}
        <Pressable
          onPress={handleSend}
          className="w-14 h-14 rounded-full items-center justify-center active:opacity-80"
          style={{ backgroundColor: colors.terraCotta }}
          accessibilityLabel="Send recording"
          accessibilityRole="button"
        >
          <Check size={24} color={colors.white} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
