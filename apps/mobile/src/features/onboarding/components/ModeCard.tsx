import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { ChevronDown, ChevronUp, Check } from 'lucide-react-native';
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
    title: 'Local Mode',
    body: 'Start with private local chat on this device. No account is required for the local setup.',
    privacy:
      'Local chat runs on this device. Nothing is uploaded unless you choose to start a Cloud session.',
    testIdPrefix: 'mode-local',
  },
  cloud: {
    title: 'AGI Cloud',
    body: 'Cloud adds hosted models, sync, connected sources, generated files, and larger tool workflows. Sign in after setup to start a Cloud session.',
    privacy: 'Cloud sessions use AGI infrastructure only after you choose to start one.',
    testIdPrefix: 'mode-cloud',
  },
  decide_later: {
    title: 'Decide later',
    body: 'Start in Local Mode now. AGI Cloud can be reviewed later from Settings.',
    privacy: 'Local Mode remains active until you explicitly choose another available mode.',
    testIdPrefix: 'mode-decide-later',
  },
};

export function ModeCard({ mode, selected, onSelect }: ModeCardProps) {
  const colors = useThemeColors();
  const meta = MODE_META[mode];
  const [privacyExpanded, setPrivacyExpanded] = useState(false);
  const disabled = mode === 'cloud';
  const isSelected = selected && !disabled;

  return (
    <Pressable
      testID={`${meta.testIdPrefix}-card`}
      onPress={disabled ? undefined : onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected, disabled }}
      accessibilityLabel={meta.title}
      style={{
        borderRadius: 16,
        borderWidth: isSelected ? 2 : 1,
        borderColor: isSelected ? colors.teal : colors.border,
        backgroundColor: isSelected ? colors.accentSurface : colors.surfaceBase,
        padding: 16,
        marginBottom: 10,
        opacity: disabled ? 0.64 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <View
          testID={`${meta.testIdPrefix}-radio`}
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: isSelected ? 0 : 2,
            borderColor: colors.border,
            backgroundColor: isSelected ? colors.teal : colors.transparent,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
            flexShrink: 0,
          }}
        >
          {isSelected && <Check size={12} color={colors.accentText} strokeWidth={3} />}
        </View>
        <Text
          testID={`${meta.testIdPrefix}-title`}
          style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, flex: 1 }}
        >
          {meta.title}
        </Text>
        {disabled && (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '600' }}>
              SIGN IN
            </Text>
          </View>
        )}
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
