import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors } from '@/lib/theme';

/**
 * Amber pulsing cursor that indicates the assistant is still generating.
 * Simple `|` character that pulses between opacity 0 and 1 on a 500ms cycle.
 */
export function StreamingIndicator() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, // infinite
      false,
    );

    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.Text
      style={[
        {
          color: colors.agentWarning,
          fontSize: 16,
          fontWeight: '600',
          lineHeight: 22,
          marginLeft: 1,
        },
        animatedStyle,
      ]}
    >
      |
    </Animated.Text>
  );
}
