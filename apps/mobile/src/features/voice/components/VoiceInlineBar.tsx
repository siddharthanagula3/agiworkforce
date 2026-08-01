/**
 * Inline voice controls — the ONE voice presentation.
 *
 * Voice is a STATE the chat is in, not a screen you enter. The thread stays
 * visible and scrollable behind this bar, replies land as ordinary chat
 * bubbles, and the only thing that changes is the composer — an orb above it,
 * a mic, and a white X to leave.
 *
 * A full-screen overlay used to exist alongside this, reached from a different
 * entry point on the same button, so the app had two voice modes that looked
 * nothing alike. It was deleted: a spoken answer must stay re-readable,
 * scrollable and copyable without quitting voice first.
 */

import { View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Plus, Mic, MicOff, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { colors } from '@/src/ui/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import { VoiceOrb } from './VoiceOrb';

export type VoiceInlinePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceInlineBarProps {
  visible: boolean;
  phase: VoiceInlinePhase;
  /** Normalised 0..1 capture/playback level driving the orb. */
  audioLevel?: number;
  /** Whether capture is currently suspended. Drives the privacy-legible mic state. */
  muted?: boolean;
  /** Open the attachment menu — the composer keeps its "+" in voice mode. */
  onAttach?: () => void;
  /** Return to typing. */
  onOpenKeyboard?: () => void;
  /** Toggle capture (mute / unmute the mic). */
  onToggleMic: () => void;
  /** Leave voice mode entirely. */
  onExit: () => void;
}

export function VoiceInlineBar({
  visible,
  phase,
  audioLevel = 0,
  muted = false,
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

  const pillStyle = {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.inputSurface,
  } as const;

  const pillContent = (
    <>
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
    </>
  );

  return (
    <Animated.View
      testID="voice-inline-bar"
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12 }}
      accessibilityLiveRegion="polite"
    >
      <View style={{ alignItems: 'center', marginBottom: 14 }}>
        <VoiceOrb phase={phase} audioLevel={audioLevel} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {onOpenKeyboard ? (
          <Pressable
            onPress={tap(onOpenKeyboard)}
            accessibilityRole="button"
            accessibilityLabel="Type a message instead"
            style={pillStyle}
          >
            {pillContent}
          </Pressable>
        ) : (
          // Input-shaped and unhandled is worse than absent: it advertises a
          // composer that swallows every tap. Announced as plain text instead.
          <View style={pillStyle}>{pillContent}</View>
        )}

        {/* Muted is a privacy state, so it gets the loudest treatment on the bar
            — solid danger red with a slashed glyph, not a tint. The listening
            tint stays a separate, subtle signal on the unmuted glyph. */}
        <Pressable
          onPress={tap(onToggleMic)}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'}
          accessibilityState={{ selected: muted }}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: muted ? colors.agentError : colors.inputSurface,
            borderWidth: muted ? 1 : 0,
            borderColor: colors.dangerBorder,
          }}
        >
          {muted ? (
            <MicOff size={22} color={colors.white} />
          ) : (
            <Mic
              size={22}
              color={phase === 'listening' ? colors.agentActive : colors.textSecondary}
            />
          )}
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
