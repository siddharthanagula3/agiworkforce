import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import * as Haptics from 'expo-haptics';
import {
  EFFORT_LABEL,
  getModelEffortOptions,
  getModelReasoning,
  type Effort,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useModelStore } from '@/src/features/model-picker/store';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { useAgentControlStore } from '@/stores/agentControlStore';
import { getShortDisplayName } from '@/src/features/model-picker/service';
import { resolveTurnEffort } from '@/src/features/chat/utils/turnEffort';
import { useTierStore } from '@/src/features/billing/store';
import { useThemeColors, radii } from '@/src/ui/theme';

interface ModelSelectorButtonProps {
  onPress: () => void;
}

export function ModelSelectorButton({ onPress }: ModelSelectorButtonProps) {
  const colors = useThemeColors();
  const selectedModel = useModelStore((s) => s.selectedModel);
  const thinkingEnabled = useModelStore((s) => s.thinkingEnabledPerModel[s.selectedModel] ?? false);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const subscriptionTier = useTierStore((s) => s.tier);
  const conversationId = useChatStore((s) => s.currentConversationId);
  const selectedEffort = useAgentControlStore((s) => s.resolve(conversationId ?? '', null).effort);

  const label = getShortDisplayName(selectedModel, subscriptionTier);
  const turnEffort = resolveTurnEffort({
    selectedEffort,
    supportedEfforts: getModelEffortOptions(selectedModel),
    reasoningControl: getModelReasoning(selectedModel).control,
    thinkingEnabled,
  });
  const effortLabel = turnEffort ? EFFORT_LABEL[turnEffort as Effort] : undefined;

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
        minHeight: 30,
        flexShrink: 1,
        paddingHorizontal: 6,
        borderRadius: radii.full,
        backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
      })}
      hitSlop={8}
      testID="chat.composer.model"
      accessibilityLabel={
        effortLabel ? `Model: ${label}, reasoning effort ${effortLabel}` : `Model: ${label}`
      }
      accessibilityRole="button"
      accessibilityHint="Opens the model picker"
    >
      <Text
        numberOfLines={1}
        style={{
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 16,
          fontWeight: '500',
          flexShrink: 1,
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
      {effortLabel ? (
        <Text
          numberOfLines={1}
          style={{
            color: colors.textMuted,
            fontSize: 13,
            lineHeight: 16,
            includeFontPadding: false,
          }}
        >
          {effortLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}
