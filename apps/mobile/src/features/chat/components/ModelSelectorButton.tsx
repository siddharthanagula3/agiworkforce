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

/**
 * The model label on the composer's control row (PAR-M19).
 *
 * Both references keep the answering model readable and one tap from being
 * changed: Claude renders "Opus 5 High" — display name plus reasoning effort as
 * a muted suffix (IMG_0730) — and ChatGPT renders its model and effort beside the mic
 * (IMG_0689). Neither draws a chip: no icon, no chevron, no filled pill. This
 * was previously a 150pt icon+chevron chip that was exported and mounted
 * nowhere while the composer's `onOpenModelPicker` prop sat unused, so the model
 * in use was invisible everywhere in the app.
 *
 * The effort suffix is the effort the NEXT turn will actually carry, resolved
 * through the same helpers as the send path (`resolveTurnEffort` +
 * `getModelEffortOptions`) rather than the raw stored value — a model with no
 * effort axis, or a stale effort it does not support, renders no suffix instead
 * of advertising a setting that will be dropped.
 */
export function ModelSelectorButton({ onPress }: ModelSelectorButtonProps) {
  const colors = useThemeColors();
  const selectedModel = useModelStore((s) => s.selectedModel);
  const thinkingEnabled = useModelStore((s) => s.thinkingEnabledPerModel[s.selectedModel] ?? false);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const subscriptionTier = useTierStore((s) => s.tier);
  // Effort resolution mirrors ModelPickerSheet/chatExecutionStore: the open
  // conversation's override first, else the '__default__' project default.
  // `currentConversationId` is null on the new-chat tab, which is exactly the
  // conversation-less case the picker resolves the same way.
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
