import { View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useModelStore } from '@/src/features/model-picker/store';
import { useTierStore } from '@/src/features/billing/store';
import { getModelById } from '@/lib/models';

/**
 * Banner shown above the composer when a premium-tier (Opus-class) model is
 * selected by a free-tier user. Informs them that credits may be limited.
 *
 * Placement: render directly above <Composer /> in the chat[id] screen.
 */
export function ModelTierWarningBanner() {
  const colors = useThemeColors();
  const selectedModel = useModelStore((s) => s.selectedModel);
  const userTier = useTierStore((s) => s.tier);

  const model = getModelById(selectedModel);
  const isPremiumModel = model?.tier === 'premium';
  const isFreeTier = userTier === 'free';

  if (!isPremiumModel || !isFreeTier) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: colors.warningSurface,
        borderTopWidth: 1,
        borderTopColor: colors.warningBorder,
        gap: 8,
      }}
      accessibilityRole="alert"
      accessibilityLabel="Premium model selected on free tier"
    >
      <Zap size={13} color={colors.agentWarning} strokeWidth={2} />
      <Text
        style={{ fontSize: 12, color: colors.agentWarning, fontWeight: '500', flex: 1 }}
        numberOfLines={1}
      >
        {model?.name ?? 'This model'} uses premium credits. Upgrade for unlimited access.
      </Text>
    </View>
  );
}
