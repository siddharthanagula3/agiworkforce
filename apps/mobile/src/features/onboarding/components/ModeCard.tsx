/**
 * Selectable mode card used in the onboarding mode picker (Branch A/B/C).
 * Follows the PRD §11 copy exactly.
 */
import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { ChevronDown, ChevronUp, Check } from 'lucide-react-native';
import { formatPrivacyModeLabel } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export type OnboardingMode = 'local' | 'cloud' | 'decide_later';

interface ModeCardProps {
  mode: OnboardingMode;
  selected: boolean;
  onSelect: () => void;
}

const MODE_META: Record<
  OnboardingMode,
  { title: string; body: string; privacy: string; testIdPrefix: string }
> = {
  local: {
    title: `${formatPrivacyModeLabel('local')} — fully on device`,
    body: 'Free forever. No account. No internet needed after one download. Best for sensitive prompts.',
    privacy: 'Your prompts never leave your device. AI runs locally using your phone hardware.',
    testIdPrefix: 'mode-local',
  },
  cloud: {
    title: `${formatPrivacyModeLabel('byok')} — bring your own keys`,
    body: `Use Claude, GPT, Gemini and more with your own API keys (${formatPrivacyModeLabel('byok')}). We charge $0. Pay providers directly.`,
    privacy:
      'Prompts are sent to the provider you choose. Each provider has its own privacy policy.',
    testIdPrefix: 'mode-cloud',
  },
  decide_later: {
    title: 'Decide later',
    body: "Jump straight into chat. You'll pick a mode the first time you send a message.",
    privacy: 'Mode selection happens on your first message.',
    testIdPrefix: 'mode-decide-later',
  },
};

export function ModeCard({ mode, selected, onSelect }: ModeCardProps) {
  const colors = useThemeColors();
  const meta = MODE_META[mode];
  const [privacyExpanded, setPrivacyExpanded] = useState(false);

  return (
    <Pressable
      testID={`${meta.testIdPrefix}-card`}
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={meta.title}
      style={{
        borderRadius: 16,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.teal : colors.border,
        backgroundColor: selected ? 'rgba(33, 128, 141, 0.08)' : colors.surfaceBase,
        padding: 16,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <View
          testID={`${meta.testIdPrefix}-radio`}
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: selected ? 0 : 2,
            borderColor: colors.border,
            backgroundColor: selected ? colors.teal : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
            flexShrink: 0,
          }}
        >
          {selected && <Check size={12} color="#000" strokeWidth={3} />}
        </View>
        <Text
          testID={`${meta.testIdPrefix}-title`}
          style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, flex: 1 }}
        >
          {meta.title}
        </Text>
      </View>

      <Text
        testID={`${meta.testIdPrefix}-body`}
        style={{
          fontSize: 14,
          color: colors.textMuted,
          lineHeight: 20,
          marginLeft: 30,
          marginBottom: 8,
        }}
      >
        {meta.body}
      </Text>

      {mode !== 'decide_later' && (
        <Pressable
          testID={`${meta.testIdPrefix}-privacy-toggle`}
          onPress={() => setPrivacyExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={privacyExpanded ? 'Collapse privacy detail' : 'How is this private?'}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginLeft: 30,
            paddingTop: 4,
          }}
        >
          <Text style={{ fontSize: 13, color: colors.teal, marginRight: 4 }}>
            How is this private?
          </Text>
          {privacyExpanded ? (
            <ChevronUp size={13} color={colors.teal} />
          ) : (
            <ChevronDown size={13} color={colors.teal} />
          )}
        </Pressable>
      )}

      {privacyExpanded && mode !== 'decide_later' && (
        <Text
          testID={`${meta.testIdPrefix}-privacy-detail`}
          style={{
            fontSize: 13,
            color: colors.textMuted,
            lineHeight: 19,
            marginLeft: 30,
            marginTop: 8,
            fontStyle: 'italic',
          }}
        >
          {meta.privacy}
        </Text>
      )}
    </Pressable>
  );
}
