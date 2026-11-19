import { useEffect } from 'react';
import { View, type TextStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import { useReduceMotion } from '@/src/ui/theme/useReduceMotion';
import { motion } from '@/src/ui/theme/tokens';

interface ShimmerTextProps {
  text: string;
  baseColor: string;
  shineColor: string;
  style?: TextStyle;
  testID?: string;
}

// The lit band is this share of the text wide on each side of its centre, and
// the sweep starts and ends that far outside the text so the band enters at
// the first letter and leaves after the last.
const BAND_HALF_WIDTH = 0.3;

function ShimmerGlyph({
  glyph,
  position,
  progress,
  baseColor,
  shineColor,
  style,
}: {
  glyph: string;
  position: number;
  progress: SharedValue<number>;
  baseColor: string;
  shineColor: string;
  style?: TextStyle;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const centre = progress.value * (1 + 2 * BAND_HALF_WIDTH) - BAND_HALF_WIDTH;
    const lit = Math.max(0, 1 - Math.abs(position - centre) / BAND_HALF_WIDTH);
    return { color: interpolateColor(lit, [0, 1], [baseColor, shineColor]) };
  });
  return <Animated.Text style={[style, animatedStyle]}>{glyph}</Animated.Text>;
}

export function ShimmerText({ text, baseColor, shineColor, style, testID }: ShimmerTextProps) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: motion.ambient, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion, text]);

  if (reduceMotion) {
    return (
      <Text testID={testID} numberOfLines={1} style={[style, { color: baseColor }]}>
        {text}
      </Text>
    );
  }

  const glyphs = Array.from(text);
  const last = Math.max(1, glyphs.length - 1);
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={text}
      style={{ flexDirection: 'row', flexShrink: 1, overflow: 'hidden' }}
    >
      {glyphs.map((glyph, index) => (
        <ShimmerGlyph
          key={`${index}-${glyph}`}
          glyph={glyph}
          position={index / last}
          progress={progress}
          baseColor={baseColor}
          shineColor={shineColor}
          style={style}
        />
      ))}
    </View>
  );
}
