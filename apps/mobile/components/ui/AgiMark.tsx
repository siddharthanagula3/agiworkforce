import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';
import { useThemeColors } from '@/src/ui/theme';

const SPOKE_COUNT = 12;
const INNER_R = 4.6;
const OUTER_R = 9;
const STROKE_W = 1.5;
const SPOKES = Array.from({ length: SPOKE_COUNT }, (_, i) => {
  const angle = (i * 360) / SPOKE_COUNT;
  const rad = (angle * Math.PI) / 180;
  const round = (value: number) => Number(value.toFixed(6));
  return {
    x1: round(12 + INNER_R * Math.sin(rad)),
    y1: round(12 - INNER_R * Math.cos(rad)),
    x2: round(12 + OUTER_R * Math.sin(rad)),
    y2: round(12 - OUTER_R * Math.cos(rad)),
  };
});

interface AgiMarkProps {
  size?: number;
  mono?: boolean;
  spinning?: boolean;
  accentColor?: string;
}

export function AgiMark({ size = 24, mono = false, spinning = false, accentColor }: AgiMarkProps) {
  const colors = useThemeColors();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (spinning) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 3000, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      rotation.value = 0;
    }
    return () => {
      cancelAnimation(rotation);
    };
  }, [spinning, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const baseColor = colors.textPrimary;
  const accent = accentColor ?? colors.teal;

  const markSvg = (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {SPOKES.map((spoke, idx) => {
        const isAccent = !mono && idx === 0;
        return (
          <Line
            key={idx}
            x1={spoke.x1}
            y1={spoke.y1}
            x2={spoke.x2}
            y2={spoke.y2}
            stroke={isAccent ? accent : baseColor}
            strokeWidth={STROKE_W}
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );

  if (spinning) {
    return <Animated.View style={animatedStyle}>{markSvg}</Animated.View>;
  }

  return markSvg;
}
