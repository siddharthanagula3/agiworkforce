import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/Text';
import { useModelStore } from '@/src/features/model-picker/store';
import { useSettingsStore } from '@/stores/settingsStore';
import { useMobileFastMode } from '@/src/features/model-picker/fastMode';
import { getShortDisplayName } from '@/src/features/model-picker/service';
import { useTierStore } from '@/src/features/billing/store';
import { useThemeColors, radii } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

interface ModelSelectorButtonProps {
  onPress: () => void;
}

/**
 * The Fast token shows only when fast mode is on and allowed for this model,
 * which is when the send path attaches the fast speed. Reasoning effort is not
 * named here: the composer's effort button owns it.
 */
export function ModelSelectorButton({ onPress }: ModelSelectorButtonProps) {
  const colors = useThemeColors();
  const selectedModel = useModelStore((s) => s.selectedModel);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const subscriptionTier = useTierStore((s) => s.tier);

  const label = getShortDisplayName(selectedModel, subscriptionTier);
  const fastMode = useMobileFastMode(selectedModel);
  const fastOn = fastMode.offersFast && fastMode.enabled && fastMode.allowed;

  const handlePress = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        minHeight: 44,
        minWidth: 44,
        flexShrink: 1,
        paddingHorizontal: 6,
        borderRadius: radii.full,
        backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
      })}
      testID="chat.composer.model"
      accessibilityLabel={fastOn ? `Model: ${label}, fast mode on` : `Model: ${label}`}
      accessibilityRole="button"
      accessibilityHint="Opens the model picker"
    >
      <Text
        numberOfLines={1}
        style={{
          color: colors.textSecondary,
          fontSize: typeScale.body,
          lineHeight: 20,
          fontWeight: '500',
          flexShrink: 1,
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
      {fastOn ? (
        <Text
          numberOfLines={1}
          style={{
            color: colors.textMuted,
            fontSize: typeScale.body,
            lineHeight: 20,
            includeFontPadding: false,
          }}
        >
          Fast
        </Text>
      ) : null}
    </Pressable>
  );
}
