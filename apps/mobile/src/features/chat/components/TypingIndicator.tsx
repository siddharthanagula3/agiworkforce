import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useThemeColors } from '@/src/ui/theme';

const DOT_SIZE = 8;
const BOUNCE_HEIGHT = 6;
const CYCLE_MS = 900;
const STAGGER_MS = 160;

interface DotProps {
  delayMs: number;
  color: string;
}

function BouncingDot({ delayMs, color }: DotProps) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(-BOUNCE_HEIGHT, {
            duration: CYCLE_MS / 2,
            easing: Easing.out(Easing.quad),
          }),
          withTiming(0, {
            duration: CYCLE_MS / 2,
            easing: Easing.in(Easing.quad),
          }),
        ),
        -1,
        false,
      ),
    );

    return () => {
      cancelAnimation(translateY);
    };
  }, [translateY, delayMs]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: DOT_SIZE / 2,
          backgroundColor: color,
          opacity: 0.7,
        },
        style,
      ]}
    />
  );
}

/**
 * Three animated bouncing dots shown while the assistant is generating
 * a response but no tokens have arrived yet.
 */
export function TypingIndicator() {
  const colors = useThemeColors();
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        gap: 6,
        alignItems: 'flex-end',
      }}
      accessibilityLabel="Assistant is typing"
      accessibilityRole="progressbar"
    >
      <BouncingDot delayMs={0} color={colors.teal} />
      <BouncingDot delayMs={STAGGER_MS} color={colors.teal} />
      <BouncingDot delayMs={STAGGER_MS * 2} color={colors.teal} />
    </View>
  );
}
