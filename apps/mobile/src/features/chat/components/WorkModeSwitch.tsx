import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { canUseBillingPlanCapability } from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { useChatStore } from '@/stores/chatStore';
import { useTierStore } from '@/src/features/billing/store';
import { useThemeColors } from '@/src/ui/theme';

export function WorkModeSwitch() {
  const colors = useThemeColors();
  const workMode = useChatStore((s) => s.workMode);
  const setWorkMode = useChatStore((s) => s.setWorkMode);
  const subscriptionTier = useTierStore((s) => s.tier);

  if (!canUseBillingPlanCapability(subscriptionTier, 'agi_work')) return null;

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        alignSelf: 'center',
        borderRadius: 999,
        backgroundColor: colors.surfaceElevated,
        padding: 3,
        marginBottom: 6,
      }}
    >
      {(['chat', 'agiwork'] as const).map((mode) => {
        const selected = mode === workMode;
        return (
          <PressableBox
            key={mode}
            testID={`chat.work-mode.${mode}`}
            accessibilityRole="tab"
            accessibilityLabel={mode === 'chat' ? 'Chat' : 'Work'}
            accessibilityHint={
              mode === 'agiwork'
                ? 'Your next messages run as AGI Work: planned, multi-step work with tools'
                : 'Your next messages get a direct answer'
            }
            accessibilityState={{ selected }}
            onPress={() => setWorkMode(mode)}
            style={{
              minWidth: 72,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              backgroundColor: selected ? colors.charcoal700 : colors.transparent,
            }}
          >
            <Text
              style={{ color: selected ? colors.textPrimary : colors.textMuted, fontWeight: '600' }}
            >
              {mode === 'chat' ? 'Chat' : 'Work'}
            </Text>
          </PressableBox>
        );
      })}
    </View>
  );
}
