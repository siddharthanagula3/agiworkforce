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
import { colors } from '@/lib/theme';

type SendButtonState = 'idle' | 'streaming' | 'queued';

interface SendButtonProps {
  state: SendButtonState;
  onPress: () => void;
  disabled?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const STATE_COLORS: Record<SendButtonState, string> = {
  idle: colors.terraCotta,
  streaming: '#ef4444', // red
  queued: '#f59e0b', // amber
};

/**
 * Three-state send button:
 * - idle: terra-cotta bg, Send icon
 * - streaming: red bg, Square/stop icon
 * - queued: amber bg, Clock icon
 */
export function SendButton({ state, onPress, disabled }: SendButtonProps) {
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
        ? interpolateColor(progress.value, [0, 1], [STATE_COLORS.idle, STATE_COLORS.streaming])
        : interpolateColor(
            progress.value - 1,
            [0, 1],
            [STATE_COLORS.streaming, STATE_COLORS.queued],
          );

    return {
      backgroundColor: isDisabled.value ? 'rgba(255,255,255,0.1)' : bgColor,
    };
  });

  const iconColor = disabled ? colors.textMuted : '#ffffff';

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
          borderRadius: 12,
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
      {state === 'idle' && <Send size={16} color={iconColor} />}
      {state === 'streaming' && <Square size={16} color="#fff" fill="#fff" />}
      {state === 'queued' && <Clock size={16} color="#fff" />}
    </AnimatedPressable>
  );
}
