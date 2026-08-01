/**
 * The single voice orb.
 *
 * Every voice surface renders this one component — the inline bar in chat and
 * the on-device companion route. Three orbs used to coexist with three
 * different animation treatments, and only one of them carried the jitter fix,
 * which is why "voice shaking here and there" kept reproducing after it was
 * reported fixed. Keeping one implementation is the fix.
 */

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

/** Follow-time for an amplitude change. Long enough to swallow one metering frame. */
const AMPLITUDE_DURATION_MS = 110;

/**
 * History weight of the mic-level exponential moving average. Raw metering
 * arrives at ~10-20Hz and is noisy frame to frame; weighting history this
 * heavily means a single-frame spike cannot snap the orb.
 */
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
  /** Normalised 0..1 capture/playback level. Surfaces without metering omit it. */
  audioLevel?: number;
  /** Diameter of the orb body. */
  size?: number;
  /** Soft halo behind the body — full-screen surfaces only. */
  glow?: boolean;
}

export function VoiceOrb({ phase, audioLevel = 0, size = 104, glow = false }: VoiceOrbProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.2);
  const smoothedLevel = useRef(0);
  const amplitudeDriven = phase === 'listening' || phase === 'speaking';

  // Phase-driven loops. `audioLevel` is deliberately NOT a dependency: including
  // it restarted these withRepeat loops on every metering tick, so the idle and
  // thinking pulses never completed a cycle and the orb read as stuttering.
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

  // Amplitude-reactive animation, live only while the mic or playback is.
  useEffect(() => {
    if (!amplitudeDriven) {
      smoothedLevel.current = 0;
      return;
    }
    smoothedLevel.current = smoothVoiceLevel(smoothedLevel.current, audioLevel);
    const level = reducedMotion ? 0 : smoothedLevel.current;
    // withTiming rather than withSpring: a spring re-targeted on every metering
    // tick never settles, and its overshoot is the shake the founder reported.
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
  // The halo scales past the body, so the box has to reserve room for it or the
  // glow clips against whatever lays this out.
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
