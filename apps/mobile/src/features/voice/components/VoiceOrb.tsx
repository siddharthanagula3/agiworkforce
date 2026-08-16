
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { colors } from '@/src/ui/theme';

export type VoiceOrbPhase = 'idle' | 'listening' | 'thinking' | 'speaking';

const AMPLITUDE_DURATION_MS = 110;

const LEVEL_HISTORY_WEIGHT = 0.75;

/**
 * One step of that moving average. Exported so the anti-jitter smoothing can be
 * asserted without a reanimated runtime, where shared values do not persist.
 */
export function smoothVoiceLevel(previous: number, next: number): number {
  return previous * LEVEL_HISTORY_WEIGHT + next * (1 - LEVEL_HISTORY_WEIGHT);
}

export interface VoiceOrbProps {
  phase: VoiceOrbPhase;
  audioLevel?: number;
  size?: number;
  glow?: boolean;
}

export function VoiceOrb({ phase, audioLevel = 0, size = 104, glow = false }: VoiceOrbProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.2);
  const smoothedLevel = useRef(0);
  const amplitudeDriven = phase === 'listening' || phase === 'speaking';

  useEffect(() => {
    if (amplitudeDriven) return;
    if (reducedMotion) {
      scale.value = withTiming(1, { duration: 180 });
      glowOpacity.value = withTiming(0.2, { duration: 180 });
      return;
    }
    if (phase === 'thinking') {
      scale.value = withRepeat(
        withSequence(withTiming(1.1, { duration: 750 }), withTiming(0.94, { duration: 750 })),
        -1,
        true,
      );
      glowOpacity.value = withRepeat(withTiming(0.5, { duration: 750 }), -1, true);
      return;
    }
    scale.value = withRepeat(
      withSequence(withTiming(1.04, { duration: 2000 }), withTiming(0.98, { duration: 2000 })),
      -1,
      true,
    );
    glowOpacity.value = withRepeat(
      withSequence(withTiming(0.28, { duration: 2000 }), withTiming(0.12, { duration: 2000 })),
      -1,
      true,
    );
  }, [amplitudeDriven, phase, reducedMotion, scale, glowOpacity]);

  useEffect(() => {
    if (!amplitudeDriven) {
      smoothedLevel.current = 0;
      return;
    }
    smoothedLevel.current = smoothVoiceLevel(smoothedLevel.current, audioLevel);
    const level = reducedMotion ? 0 : smoothedLevel.current;
    scale.value = withTiming(1 + level * 0.28, {
      duration: AMPLITUDE_DURATION_MS,
      easing: Easing.out(Easing.quad),
    });
    glowOpacity.value = withTiming(0.25 + level * 0.4, { duration: AMPLITUDE_DURATION_MS });
  }, [amplitudeDriven, audioLevel, reducedMotion, scale, glowOpacity]);

  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: scale.value * 1.45 }],
  }));

  const radius = size / 2;
  const box = glow ? Math.round(size * 1.7) : size;

  return (
    <View
      testID="voice-orb"
      style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}
    >
      {glow ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: radius,
              backgroundColor: colors.voiceOrbMid,
            },
            haloStyle,
          ]}
        />
      ) : null}
      <Animated.View style={bodyStyle}>
        <Svg width={size} height={size} accessibilityRole="image" accessibilityLabel="">
          <Defs>
            <LinearGradient id="voiceOrbFill" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor={colors.voiceOrbStart} stopOpacity="1" />
              <Stop offset="55%" stopColor={colors.voiceOrbMid} stopOpacity="1" />
              <Stop offset="100%" stopColor={colors.voiceOrbEnd} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Circle cx={radius} cy={radius} r={radius} fill="url(#voiceOrbFill)" />
        </Svg>
      </Animated.View>
    </View>
  );
}
