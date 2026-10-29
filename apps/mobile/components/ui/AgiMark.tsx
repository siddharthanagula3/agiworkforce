import { useEffect, type ReactNode } from 'react';
import { Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useReduceMotion } from '@/src/ui/theme/useReduceMotion';
import symbol from '../../assets/agi-symbol.png';

const SPIN_MS = 1000;

interface AgiMarkProps {
  size?: number;
  mono?: boolean;
  spinning?: boolean;
  accentColor?: string;
  testID?: string;
}

function MarkImage({ size, testID }: { size: number; testID?: string }) {
  return (
    <Image
      testID={testID}
      source={symbol}
      accessible={false}
      style={{ width: size, height: size }}
    />
  );
}

function SpinningMark({ size, children }: { size: number; children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      rotation.value = 0;
      return;
    }
    rotation.value = withRepeat(
      withTiming(360, { duration: SPIN_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(rotation);
    };
  }, [reduceMotion, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (reduceMotion) return children;

  return (
    <Animated.View
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        animatedStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function AgiMark({ size = 24, spinning = false, testID }: AgiMarkProps) {
  const mark = <MarkImage size={size} testID={testID} />;
  if (!spinning) return mark;
  return <SpinningMark size={size}>{mark}</SpinningMark>;
}
