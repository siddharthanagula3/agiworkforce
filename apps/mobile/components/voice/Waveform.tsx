import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Animated waveform visualization with independently-moving bars.
 * Used in voice recording overlay and full-screen voice conversation.
 *
 * Colors:
 * - blue (#3b82f6)  = user speaking
 * - teal (#21808d)  = AI speaking
 * - purple (#a855f7) = thinking
 */

interface WaveformProps {
  /** Color of the bars */
  color: string;
  /** Whether the waveform is actively animating */
  active?: boolean;
  /** External audio level (0-1) to drive bar heights. If not provided, uses idle animation. */
  audioLevel?: number;
  /** Number of bars. Default 7. */
  barCount?: number;
  /** Max bar height in px. Default 48. */
  maxHeight?: number;
  /** Min bar height in px. Default 6. */
  minHeight?: number;
  /** Bar width in px. Default 4. */
  barWidth?: number;
  /** Gap between bars in px. Default 4. */
  gap?: number;
}

const SPRING_CONFIG = {
  damping: 12,
  stiffness: 150,
  mass: 0.5,
};

function WaveformBar({
  color,
  active,
  audioLevel,
  index,
  maxHeight,
  minHeight,
  barWidth,
}: {
  color: string;
  active: boolean;
  audioLevel: SharedValue<number>;
  index: number;
  maxHeight: number;
  minHeight: number;
  barWidth: number;
}) {
  const idleHeight = useSharedValue(minHeight);

  // Each bar gets a unique phase offset for organic movement
  useEffect(() => {
    if (active) {
      // Start idle wobble with staggered delays
      idleHeight.value = withDelay(
        index * 80,
        withRepeat(
          withSequence(
            withTiming(minHeight + (maxHeight - minHeight) * 0.3, { duration: 400 + index * 60 }),
            withTiming(minHeight + (maxHeight - minHeight) * 0.1, { duration: 350 + index * 50 }),
          ),
          -1,
          true,
        ),
      );
    } else {
      idleHeight.value = withSpring(minHeight, SPRING_CONFIG);
    }
  }, [active, minHeight, maxHeight, index, idleHeight]);

  const animatedStyle = useAnimatedStyle(() => {
    // When audioLevel is provided and non-zero, use it to drive heights
    const level = audioLevel.value;
    if (active && level > 0.01) {
      // Each bar responds slightly differently to audio level
      const phaseMultiplier = 0.6 + Math.sin((index * Math.PI) / 3) * 0.4;
      const targetHeight =
        minHeight + (maxHeight - minHeight) * level * phaseMultiplier;
      return {
        height: withSpring(Math.max(minHeight, targetHeight), SPRING_CONFIG),
        backgroundColor: color,
      };
    }
    return {
      height: idleHeight.value,
      backgroundColor: color,
    };
  });

  return (
    <Animated.View
      style={[
        {
          width: barWidth,
          borderRadius: barWidth / 2,
        },
        animatedStyle,
      ]}
    />
  );
}

export function Waveform({
  color,
  active = false,
  audioLevel: externalAudioLevel,
  barCount = 7,
  maxHeight = 48,
  minHeight = 6,
  barWidth = 4,
  gap = 4,
}: WaveformProps) {
  const audioLevel = useSharedValue(0);

  useEffect(() => {
    audioLevel.value = withSpring(externalAudioLevel ?? 0, {
      damping: 15,
      stiffness: 200,
    });
  }, [externalAudioLevel, audioLevel]);

  // Pre-compute bar indices for stable keys
  const barIndices = useMemo(
    () => Array.from({ length: barCount }, (_, i) => i),
    [barCount],
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap,
        height: maxHeight,
      }}
    >
      {barIndices.map((index) => (
        <WaveformBar
          key={index}
          index={index}
          color={color}
          active={active}
          audioLevel={audioLevel}
          maxHeight={maxHeight}
          minHeight={minHeight}
          barWidth={barWidth}
        />
      ))}
    </View>
  );
}
