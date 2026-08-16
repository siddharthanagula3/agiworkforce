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

interface WaveformProps {
  color: string;
  active?: boolean;
  audioLevel?: number;
  barCount?: number;
  maxHeight?: number;
  minHeight?: number;
  barWidth?: number;
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

  useEffect(() => {
    if (active) {
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
    const level = audioLevel.value;
    if (active && level > 0.01) {
      const phaseMultiplier = 0.6 + Math.sin((index * Math.PI) / 3) * 0.4;
      const targetHeight = minHeight + (maxHeight - minHeight) * level * phaseMultiplier;
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

  const barIndices = useMemo(() => Array.from({ length: barCount }, (_, i) => i), [barCount]);

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
