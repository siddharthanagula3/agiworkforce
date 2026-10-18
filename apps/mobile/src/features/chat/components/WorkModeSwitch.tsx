import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import { canUseBillingPlanCapability } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useTierStore } from '@/src/features/billing/store';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';

export function WorkModeSwitch() {
  const colors = useThemeColors();
  const router = useRouter();
  const workMode = useChatStore((s) => s.workMode);
  const setWorkMode = useChatStore((s) => s.setWorkMode);
  const subscriptionTier = useTierStore((s) => s.tier);
  const entitled = canUseBillingPlanCapability(subscriptionTier, 'agi_work');
  const activeMode = entitled ? workMode : 'chat';

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
        const selected = mode === activeMode;
        const disabled = mode === 'agiwork' && !entitled && !FEATURES.nativePurchases;
        return (
          <PressableBox
            key={mode}
            accessibilityRole="tab"
            accessibilityLabel={mode === 'chat' ? 'Chat' : 'Work'}
            accessibilityHint={
              disabled
                ? 'Work is unavailable on your plan'
                : mode === 'agiwork'
                  ? 'Your next messages run as AGI Work: planned, multi-step work with tools'
                  : 'Your next messages get a direct answer'
            }
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => {
              if (mode === 'agiwork' && !entitled) {
                if (FEATURES.nativePurchases) {
                  router.push('/(app)/settings/cloud-billing' as Parameters<typeof router.push>[0]);
                }
                return;
              }
              setWorkMode(mode);
            }}
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
