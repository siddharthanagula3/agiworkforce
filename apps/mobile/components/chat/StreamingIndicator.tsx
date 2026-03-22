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
 * Teal sparkle indicator that pulses at the end of streaming text.
 * Brand-distinctive AGI Workforce animation: pulsing opacity 0.3 -> 1.0 on 600ms cycle.
 * Replaces the previous amber cursor (`|`) with a teal sparkle character.
 */
export function StreamingIndicator() {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.ease) }),
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
          color: colors.teal,
          fontSize: 16,
          fontWeight: '600',
          lineHeight: 22,
          marginLeft: 2,
        },
        animatedStyle,
      ]}
      accessibilityLabel="Generating response"
      accessibilityRole="text"
    >
      {'\u2728'}
    </Animated.Text>
  );
}
