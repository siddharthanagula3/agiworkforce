import { useEffect } from 'react';
import { View, Pressable } from 'react-native';
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
import { formatClock } from '@/src/lib/time';

interface RecordingOverlayProps {
  visible: boolean;
  audioLevel: number;
  durationMs: number;
  onCancel: () => void;
  onSend: () => void;
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
      className="px-4 pt-3"
      style={{
        backgroundColor: 'rgba(15, 15, 15, 0.95)',
        borderRadius: 20,
        paddingBottom: 16,
      }}
      accessibilityRole="alert"
      accessibilityLabel="Recording in progress"
    >
      {/* Top row: pulsing dot + "Recording..." + timer */}
      <View className="flex-row items-center justify-center gap-2 mb-3">
        <PulsingDot />
        <Text className="text-red-400 text-sm font-medium">Recording</Text>
        <Text className="text-sm font-mono ml-2" style={{ color: colors.cameraOverlayTextMuted }}>
          {formatClock(durationMs)}
        </Text>
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
          className="w-12 h-12 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.voiceControlSurface }}
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
