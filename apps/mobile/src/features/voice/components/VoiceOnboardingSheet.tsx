import { useCallback } from 'react';
import { Modal, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import Animated, { FadeIn } from 'react-native-reanimated';
import { X, AudioLines, Info } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { colors, motion } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useSheetSlideIn } from '@/src/shared/hooks/useSheetSlideIn';
import { useSettingsStore } from '@/stores/settingsStore';

function IntroOrb({ size = 168 }: { size?: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size} accessibilityRole="image" accessibilityLabel="">
      <Defs>
        <LinearGradient id="voiceIntroOrb" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={colors.voiceOrbStart} stopOpacity="1" />
          <Stop offset="55%" stopColor={colors.voiceOrbMid} stopOpacity="1" />
          <Stop offset="100%" stopColor={colors.voiceOrbEnd} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill="url(#voiceIntroOrb)" />
    </Svg>
  );
}

function FeatureRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
      <View style={{ width: 28, alignItems: 'center', paddingTop: 2 }}>{icon}</View>
      <Text
        style={{
          flex: 1,
          color: colors.textSecondary,
          fontSize: typeScale.callout,
          lineHeight: 23,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

const PILL = {
  backgroundColor: colors.white,
  borderRadius: 999,
  paddingVertical: 17,
  alignItems: 'center' as const,
};
const PILL_LABEL = {
  color: colors.black,
  fontSize: typeScale.headline,
  fontWeight: '600' as const,
  textAlign: 'center' as const,
};

export type VoiceOnboardingMode = 'on-device' | 'live';

export type VoiceOnboardingPurpose = 'voice' | 'dictation';

export const VOICE_DISCLOSURE: Record<VoiceOnboardingMode, string> = {
  'on-device':
    'Your voice is transcribed on this device to hear you. Nothing is recorded or stored.',
  live: 'In live voice your microphone is sent to AGI Cloud while you talk, and the transcript is saved to this chat. Audio is not kept.',
};

const INTRO: Record<VoiceOnboardingPurpose, { title: string; body: string }> = {
  voice: {
    title: 'Meet Voice',
    body: "Say what's on your mind. AGI listens, responds, and keeps the conversation flowing naturally.",
  },
  dictation: {
    title: 'Dictation',
    body: 'Speak instead of typing. Your words appear as text in your message.',
  },
};

export interface VoiceOnboardingSheetProps {
  visible: boolean;
  mode: VoiceOnboardingMode;
  purpose?: VoiceOnboardingPurpose;
  onContinue: () => void;
  onDismiss: () => void;
}

export function VoiceOnboardingSheet({
  visible,
  mode,
  purpose = 'voice',
  onContinue,
  onDismiss,
}: VoiceOnboardingSheetProps) {
  const insets = useSafeAreaInsets();
  const sheetSlideIn = useSheetSlideIn({ visible });
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const markSeen = useSettingsStore((s) =>
    purpose === 'dictation' ? s.setDictationOnboardingSeen : s.setVoiceOnboardingSeen,
  );

  const handleContinue = useCallback(() => {
    if (hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    markSeen(true);
    onContinue();
  }, [hapticsEnabled, markSeen, onContinue]);

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onDismiss}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <Animated.View
        entering={FadeIn.duration(motion.quick)}
        style={{ flex: 1, backgroundColor: colors.scrim }}
      >
        <Animated.View
          style={[
            {
              flex: 1,
              marginTop: insets.top + 8,
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 28,
              paddingBottom: insets.bottom + 20,
            },
            sheetSlideIn,
          ]}
        >
          <View style={{ alignItems: 'flex-end', paddingTop: 16 }}>
            <PressableBox
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={`Close ${purpose} introduction`}
              hitSlop={12}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceHover,
              }}
            >
              <X size={20} color={colors.textSecondary} />
            </PressableBox>
          </View>

          <View style={{ flex: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center' }}>
            <IntroOrb />
          </View>

          <Text
            style={{
              color: colors.textPrimary,
              fontSize: typeScale.largeTitle,
              fontWeight: '700',
              textAlign: 'center',
              marginBottom: 28,
            }}
            accessibilityRole="header"
          >
            {INTRO[purpose].title}
          </Text>

          <View style={{ gap: 22, marginBottom: 32 }}>
            <FeatureRow icon={<AudioLines size={22} color={colors.textMuted} />}>
              {INTRO[purpose].body}
            </FeatureRow>
            <FeatureRow icon={<Info size={22} color={colors.textMuted} />}>
              {VOICE_DISCLOSURE[mode]}
            </FeatureRow>
          </View>

          <PressableBox
            onPress={handleContinue}
            accessibilityRole="button"
            accessibilityLabel={`Continue to ${purpose}`}
            style={{ flexShrink: 0 }}
          >
            <View style={PILL}>
              <Text style={PILL_LABEL}>Continue</Text>
            </View>
          </PressableBox>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
