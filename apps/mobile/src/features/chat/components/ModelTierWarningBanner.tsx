import { View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useModelStore } from '@/src/features/model-picker/store';
import { useTierStore } from '@/src/features/billing/store';
import { getModelById } from '@/lib/models';
import { canAccessCloudModelForTier } from '@/src/features/model-picker/service';

export function ModelTierWarningBanner({ onChooseModel }: { onChooseModel?: () => void }) {
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
        paddingLeft: 16,
        paddingRight: onChooseModel ? 4 : 16,
        paddingVertical: onChooseModel ? 0 : 8,
        backgroundColor: colors.warningSurface,
        borderTopWidth: 1,
        borderTopColor: colors.warningBorder,
        gap: 8,
      }}
      accessibilityRole="alert"
    >
      <Zap size={13} color={colors.agentWarning} strokeWidth={2} />
      <Text
        style={{
          fontSize: typeScale.caption,
          color: colors.agentWarning,
          fontWeight: '500',
          flex: 1,
        }}
        numberOfLines={2}
      >
        {model.name} is not included in your plan. Choose an available model.
      </Text>
      {onChooseModel ? (
        <PressableBox
          onPress={onChooseModel}
          accessibilityRole="button"
          accessibilityLabel="Choose a model"
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}
        >
          <Text
            style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textPrimary }}
          >
            Choose model
          </Text>
        </PressableBox>
      ) : null}
    </View>
  );
}
