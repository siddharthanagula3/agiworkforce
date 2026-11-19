import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { canUseBillingPlanCapability } from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { useChatStore } from '@/stores/chatStore';
import { useTierStore } from '@/src/features/billing/store';
import { useThemeColors } from '@/src/ui/theme';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/ui/theme/tokens';

const SEGMENT_HEIGHT = 36;
const SEGMENT_HIT_SLOP = { top: 4, bottom: 4 };

export { HEADER_TEXT_SCALE_LIMIT };

interface WorkModeSwitchProps {
  workReady?: boolean;
  onSelectWork?: () => void;
}

export function WorkModeSwitch({ workReady = true, onSelectWork }: WorkModeSwitchProps = {}) {
  const colors = useThemeColors();
  const workMode = useChatStore((s) => s.workMode);
  const setWorkMode = useChatStore((s) => s.setWorkMode);
  const subscriptionTier = useTierStore((s) => s.tier);

  if (!canUseBillingPlanCapability(subscriptionTier, 'agi_work')) return null;
  const shownMode = workReady ? workMode : 'chat';

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Chat or Work"
      style={{
        flexDirection: 'row',
        borderRadius: 999,
        backgroundColor: colors.surfaceElevated,
        padding: 3,
      }}
    >
      {(['chat', 'agiwork'] as const).map((mode) => {
        const selected = mode === shownMode;
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
            onPress={mode === 'agiwork' && onSelectWork ? onSelectWork : () => setWorkMode(mode)}
            hitSlop={SEGMENT_HIT_SLOP}
            style={{
              minWidth: 72,
              minHeight: SEGMENT_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              backgroundColor: selected ? colors.charcoal700 : colors.transparent,
            }}
          >
            <Text
              maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
              numberOfLines={1}
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
