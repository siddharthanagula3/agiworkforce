import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { motion } from '@/src/ui/theme/tokens';

export type VoiceGlowPhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export type VoiceGlowTone = 'listening' | 'thinking' | 'speaking';

const GLOW_PEAK_OPACITY = 0.5;
const GLOW_SOFT_OPACITY = 0.32;
const BREATH_LOW = 0.78;

export function voiceGlowTone(phase: VoiceGlowPhase): VoiceGlowTone | null {
  return phase === 'idle' ? null : phase;
}

export function voiceGlowColor(tone: VoiceGlowTone, colors: ColorScheme): string {
  if (tone === 'speaking') return colors.brandAmber;
  if (tone === 'thinking') return colors.agentThinking;
  return colors.agentActive;
}

interface GlowLayerProps {
  tone: VoiceGlowTone;
  color: string;
  reducedMotion: boolean;
}

function GlowLayer({ tone, color, reducedMotion }: GlowLayerProps) {
  const breath = useSharedValue(1);
  const breathes = !reducedMotion && tone !== 'thinking';

  useEffect(() => {
    if (!breathes) {
      breath.value = 1;
      return;
    }
    breath.value = withRepeat(
      withSequence(
        withTiming(BREATH_LOW, { duration: motion.ambient }),
        withTiming(1, { duration: motion.ambient }),
      ),
      -1,
      true,
    );
  }, [breath, breathes]);

  const breathStyle = useAnimatedStyle(() => ({ opacity: breath.value }));
  const gradientId = `voiceStateGlow-${tone}`;

  return (
    <Animated.View
      testID={`voice-state-glow-${tone}`}
      pointerEvents="none"
      entering={reducedMotion ? undefined : FadeIn.duration(motion.reveal)}
      exiting={reducedMotion ? undefined : FadeOut.duration(motion.reveal)}
      style={[
        StyleSheet.absoluteFill,
        { opacity: tone === 'thinking' ? GLOW_SOFT_OPACITY : GLOW_PEAK_OPACITY },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, breathStyle]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={gradientId} cx="50%" cy="100%" rx="85%" ry="100%">
              <Stop offset="0%" stopColor={color} stopOpacity="1" />
              <Stop offset="100%" stopColor={color} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

export interface VoiceStateGlowProps {
  phase: VoiceGlowPhase;
  height: number;
}

export function VoiceStateGlow({ phase, height }: VoiceStateGlowProps) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const tone = voiceGlowTone(phase);

  return (
    <View
      testID="voice-state-glow"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}
    >
      {tone ? (
        <GlowLayer
          key={tone}
          tone={tone}
          color={voiceGlowColor(tone, colors)}
          reducedMotion={reducedMotion}
        />
      ) : null}
    </View>
  );
}
