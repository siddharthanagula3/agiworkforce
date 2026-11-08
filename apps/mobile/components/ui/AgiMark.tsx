import { useEffect, useId, type ReactNode } from 'react';
import { Image } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  FeGaussianBlur,
  Filter,
  G,
  Image as SvgImage,
  Mask,
  Path,
} from 'react-native-svg';
import {
  agiMotion,
  agiSymbolPalette,
  agiSymbolShineBand,
  symbolShinePoint,
} from '@agiworkforce/design-tokens';
import { useReduceMotion } from '@/src/ui/theme/useReduceMotion';
import symbol from '../../assets/agi-symbol.png';

const AnimatedRibbon = Animated.createAnimatedComponent(Path);

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

function FlowingMark({
  size,
  children,
  testID,
}: {
  size: number;
  children: ReactNode;
  testID?: string;
}) {
  const reduceMotion = useReduceMotion();
  const id = useId().replace(/:/g, '');
  const progress = useSharedValue(0);
  const animatedProps = useAnimatedProps(() => {
    const point = symbolShinePoint(progress.value);
    return { transform: `translate(${point.x}, ${point.y}) rotate(${point.rotation})` };
  });

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: parseFloat(agiMotion.duration.markFlow), easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [reduceMotion, progress]);

  if (reduceMotion) return children;

  return (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 100 100" accessible={false}>
      <Defs>
        <Filter id={`${id}-shine`} x="-100%" y="-100%" width="300%" height="300%">
          <FeGaussianBlur stdDeviation="3" />
        </Filter>
        <Mask
          id={`${id}-mask`}
          maskType="alpha"
          x="0"
          y="0"
          width="100"
          height="100"
          maskUnits="userSpaceOnUse"
        >
          <SvgImage href={symbol} width="100" height="100" />
        </Mask>
      </Defs>
      <G mask={`url(#${id}-mask)`}>
        <SvgImage href={symbol} width="100" height="100" />
        <AnimatedRibbon
          animatedProps={animatedProps}
          d={agiSymbolShineBand}
          filter={`url(#${id}-shine)`}
          fill={agiSymbolPalette.shine}
          opacity="0.55"
        />
      </G>
    </Svg>
  );
}

export function AgiMark({ size = 24, spinning = false, testID }: AgiMarkProps) {
  const mark = <MarkImage size={size} testID={testID} />;
  if (!spinning) return mark;
  return (
    <FlowingMark size={size} testID={testID}>
      {mark}
    </FlowingMark>
  );
}
