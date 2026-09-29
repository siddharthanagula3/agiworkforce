import { View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useModelStore } from '@/src/features/model-picker/store';
import { useTierStore } from '@/src/features/billing/store';
import { getModelById } from '@/lib/models';
import { canAccessCloudModelForTier } from '@/src/features/model-picker/service';

export function ModelTierWarningBanner() {
  const colors = useThemeColors();
  const selectedModel = useModelStore((s) => s.selectedModel);
  const userTier = useTierStore((s) => s.tier);

  const model = getModelById(selectedModel);
  if (!model || canAccessCloudModelForTier(selectedModel, userTier)) return null;

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
      accessibilityLabel="Selected model is not available on your plan"
    >
      <Zap size={13} color={colors.agentWarning} strokeWidth={2} />
      <Text
        style={{
          fontSize: typeScale.caption,
          color: colors.agentWarning,
          fontWeight: '500',
          flex: 1,
        }}
        numberOfLines={1}
      >
        {model.name} is not included in your plan. Choose an available model.
      </Text>
    </View>
  );
}
