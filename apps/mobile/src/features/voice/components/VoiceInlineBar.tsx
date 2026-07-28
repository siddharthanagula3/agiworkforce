/**
 * Inline voice controls — parity with references-2 voice-03/05.
 *
 * The defining difference from `VoiceConversationScreen`: voice is a STATE the
 * chat is in, not a screen you enter. The thread stays visible and scrollable
 * behind this bar, replies land as ordinary chat bubbles, and the only thing
 * that changes is the composer — an orb above it, a mic, and a white X to leave.
 *
 * The full-screen overlay hid the conversation it was producing, so a spoken
 * answer could not be re-read, scrolled back through, or copied without first
 * quitting voice. This does not replace that screen; it is the inline mode
 * alongside it.
 */

import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Plus, Mic, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { colors } from '@/src/ui/theme';
import { useSettingsStore } from '@/stores/settingsStore';

export type VoiceInlinePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

const ORB_SIZE = 104;

/**
 * Breathes while the model is working so the bar reads as alive without a
 * spinner. Held still when the phase is idle, and when the OS asks for reduced
 * motion — a pulsing element is exactly what that setting is meant to stop.
 */
function Orb({ phase }: { phase: VoiceInlinePhase }) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const active = phase === 'listening' || phase === 'thinking' || phase === 'speaking';

  useEffect(() => {
    if (!active || reducedMotion) {
      scale.value = withTiming(1, { duration: 180 });
      return;
    }
    scale.value = withRepeat(withTiming(1.06, { duration: 900 }), -1, true);
  }, [active, reducedMotion, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const r = ORB_SIZE / 2;

  return (
    <Animated.View style={style}>
      <Svg width={ORB_SIZE} height={ORB_SIZE} accessibilityRole="image" accessibilityLabel="">
        <Defs>
          <LinearGradient id="voiceInlineOrb" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={colors.voiceOrbStart} stopOpacity="1" />
            <Stop offset="55%" stopColor={colors.voiceOrbMid} stopOpacity="1" />
            <Stop offset="100%" stopColor={colors.voiceOrbEnd} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill="url(#voiceInlineOrb)" />
      </Svg>
    </Animated.View>
  );
}

export interface VoiceInlineBarProps {
  visible: boolean;
  phase: VoiceInlinePhase;
  /** Open the attachment menu — the composer keeps its "+" in voice mode. */
  onAttach?: () => void;
  /** Return to typing without leaving voice. */
  onOpenKeyboard?: () => void;
  /** Toggle capture (mute / unmute the mic). */
  onToggleMic: () => void;
  /** Leave voice mode entirely. */
  onExit: () => void;
}

export function VoiceInlineBar({
  visible,
  phase,
  onAttach,
  onOpenKeyboard,
  onToggleMic,
  onExit,
}: VoiceInlineBarProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const tap = (fn: () => void) => () => {
    if (hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fn();
  };

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12 }}
      accessibilityLiveRegion="polite"
    >
      <View style={{ alignItems: 'center', marginBottom: 14 }}>
        <Orb phase={phase} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={onOpenKeyboard ? tap(onOpenKeyboard) : undefined}
          accessibilityRole="button"
          accessibilityLabel="Type a message instead"
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            height: 48,
            paddingHorizontal: 16,
            borderRadius: 999,
            backgroundColor: colors.inputSurface,
          }}
        >
          {onAttach ? (
            <Pressable
              onPress={tap(onAttach)}
              accessibilityRole="button"
              accessibilityLabel="Add attachment"
              hitSlop={10}
            >
              <Plus size={22} color={colors.textSecondary} />
            </Pressable>
          ) : null}
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>Ask AGI</Text>
        </Pressable>

        <Pressable
          onPress={tap(onToggleMic)}
          accessibilityRole="button"
          accessibilityLabel={phase === 'listening' ? 'Mute microphone' : 'Unmute microphone'}
          accessibilityState={{ selected: phase === 'listening' }}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.inputSurface,
          }}
        >
          <Mic
            size={22}
            color={phase === 'listening' ? colors.agentActive : colors.textSecondary}
          />
        </Pressable>

        {/* Solid white, unlike every other control here: leaving voice is the
            one action that must never be mistaken for a mute. */}
        <Pressable
          onPress={tap(onExit)}
          accessibilityRole="button"
          accessibilityLabel="Exit voice mode"
          style={({ pressed }) => ({
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.textPrimary,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <X size={22} color={colors.surfaceBase} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
