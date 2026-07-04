import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolateColor,
  useSharedValue,
} from 'react-native-reanimated';
import { Send, Square, Clock } from 'lucide-react-native';
import { useEffect } from 'react';
import { useThemeColors, radii, type ColorScheme } from '@/src/ui/theme';

type SendButtonState = 'idle' | 'streaming' | 'queued';

interface SendButtonProps {
  state: SendButtonState;
  onPress: () => void;
  disabled?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function stateColors(colors: ColorScheme): Record<SendButtonState, string> {
  return {
    idle: colors.teal,
    streaming: colors.agentError,
    queued: colors.agentWarning,
  };
}

function iconForState(state: SendButtonState) {
  if (state === 'streaming') return Square;
  if (state === 'queued') return Clock;
  return Send;
}

function fillForState(state: SendButtonState, color: string) {
  return state === 'streaming' ? color : undefined;
}

/**
 * Three-state send button:
 * - idle: accent background, Send icon
 * - streaming: error background, Square/stop icon
 * - queued: warning background, Clock icon
 */
export function SendButton({ state, onPress, disabled }: SendButtonProps) {
  const colors = useThemeColors();
  const palette = stateColors(colors);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(state === 'idle' ? 0 : state === 'streaming' ? 1 : 2, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });
  }, [state, progress]);

  const isDisabled = useSharedValue(disabled ?? false);

  useEffect(() => {
    isDisabled.value = disabled ?? false;
  }, [disabled, isDisabled]);

  const animatedStyle = useAnimatedStyle(() => {
    const bgColor =
      progress.value <= 1
        ? interpolateColor(progress.value, [0, 1], [palette.idle, palette.streaming])
        : interpolateColor(progress.value - 1, [0, 1], [palette.streaming, palette.queued]);

    return {
      backgroundColor: isDisabled.value ? colors.neutralSurface : bgColor,
    };
  });

  const iconColor = disabled
    ? colors.textSecondary
    : state === 'idle'
      ? colors.accentText
      : colors.white;
  const Icon = iconForState(state);

  return (
    <AnimatedPressable
      onPress={onPress}
      // Intentional: `disabled` only blocks sending (idle state).
      // When streaming, the button becomes a "Stop" control and must
      // remain pressable regardless of the `disabled` prop so the user
      // can always interrupt a running generation.
      disabled={disabled && state === 'idle'}
      style={[
        {
          padding: 8,
          borderRadius: radii.full,
          alignItems: 'center',
          justifyContent: 'center',
        },
        animatedStyle,
      ]}
      accessibilityLabel={
        state === 'idle' ? 'Send message' : state === 'streaming' ? 'Stop generating' : 'Queued'
      }
      accessibilityRole="button"
    >
      <Icon size={16} color={iconColor} fill={fillForState(state, iconColor)} />
    </AnimatedPressable>
  );
}
