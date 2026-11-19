import { View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Plus, Mic, MicOff, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/Text';
import { colors, motion } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  AttachmentPreview,
  type Attachment,
} from '@/src/features/chat/components/AttachmentPreview';
import { VoiceOrb } from './VoiceOrb';
import { VoiceStateGlow } from './VoiceStateGlow';

const GLOW_HEIGHT = 280;

export type VoiceInlinePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceInlineBarProps {
  visible: boolean;
  phase: VoiceInlinePhase;
  audioLevel?: number;
  muted?: boolean;
  notice?: string | null;
  attachments?: Attachment[];
  attachmentPrivacyLabel?: string;
  onRemoveAttachment?: (id: string) => void;
  onAttach?: () => void;
  onOpenKeyboard?: () => void;
  onToggleMic: () => void;
  onExit: () => void;
}

function micActionLabel(muted: boolean, phase: VoiceInlinePhase): string {
  if (muted) return 'Unmute microphone';
  return phase === 'idle' ? 'Start listening' : 'Mute microphone';
}

export function VoiceInlineBar({
  visible,
  phase,
  audioLevel = 0,
  muted = false,
  notice = null,
  attachments = [],
  attachmentPrivacyLabel,
  onRemoveAttachment,
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

  const micLabel = micActionLabel(muted, phase);

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
          hitSlop={12}
        >
          <Plus size={22} color={colors.textSecondary} />
        </Pressable>
      ) : null}
      <Text style={{ color: colors.textMuted, fontSize: typeScale.callout }}>Ask AGI</Text>
    </>
  );

  return (
    <Animated.View
      testID="voice-inline-bar"
      entering={FadeIn.duration(motion.quick)}
      exiting={FadeOut.duration(motion.quick)}
      style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12 }}
      accessibilityLiveRegion="polite"
    >
      <VoiceStateGlow phase={muted ? 'idle' : phase} height={GLOW_HEIGHT} />

      {notice ? (
        <Text
          testID="voice-inline-notice"
          style={{
            color: colors.textMuted,
            fontSize: typeScale.footnote,
            textAlign: 'center',
            marginBottom: 10,
          }}
        >
          {notice}
        </Text>
      ) : null}

      <View style={{ alignItems: 'center', marginBottom: 14 }}>
        <VoiceOrb phase={phase} audioLevel={audioLevel} />
      </View>

      {attachments.length > 0 && onRemoveAttachment ? (
        <View testID="voice-inline-attachments" style={{ marginHorizontal: -16, marginBottom: 10 }}>
          <AttachmentPreview
            attachments={attachments}
            onRemove={onRemoveAttachment}
            privacyShortLabel={attachmentPrivacyLabel}
          />
        </View>
      ) : null}

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
          <View style={pillStyle}>{pillContent}</View>
        )}

        {/* Muted is a privacy state, so it gets the loudest treatment on the bar
            - solid danger red with a slashed glyph, not a tint. The listening
            tint stays a separate, subtle signal on the unmuted glyph. */}
        <Pressable
          onPress={tap(onToggleMic)}
          accessibilityRole="button"
          accessibilityLabel={micLabel}
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
            <MicOff size={22} color={colors.accentText} />
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
