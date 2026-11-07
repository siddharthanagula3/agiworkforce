import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import * as Haptics from 'expo-haptics';
import {
  EFFORT_LABEL,
  ROUTING_PROFILE_CHOICE_OPTIONS,
  getModelEffortOptions,
  getModelReasoning,
  type Effort,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { useModelStore } from '@/src/features/model-picker/store';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { useAgentControlStore } from '@/stores/agentControlStore';
import { useMobileFastMode } from '@/src/features/model-picker/fastMode';
import { DEFAULT_AUTO_MODE_ID, getShortDisplayName } from '@/src/features/model-picker/service';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { resolveTurnEffort } from '@/src/features/chat/utils/turnEffort';
import { useTierStore } from '@/src/features/billing/store';
import { useThemeColors, radii } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

interface ModelSelectorButtonProps {
  onPress: () => void;
}

/**
 * The model label on the composer's control row (PAR-M19).
 *
 * Both references keep the answering model readable and one tap from being
 * changed: Claude renders "Opus 5 High", display name plus reasoning effort as
 * a muted suffix (IMG_0730), and ChatGPT renders its model and effort beside the mic
 * (IMG_0689). Neither draws a chip: no icon, no chevron, no filled pill.
 *
 * The effort suffix is the effort the NEXT turn will actually carry, resolved
 * through the same helpers as the send path (`resolveTurnEffort` +
 * `getModelEffortOptions`) rather than the raw stored value, a model with no
 * effort axis, or a stale effort it does not support, renders no suffix instead
 * of advertising a setting that will be dropped. The Fast token follows the
 * same rule: it shows only when fast mode is on and allowed for this model,
 * which is when the send path attaches the fast speed.
 */
export function ModelSelectorButton({ onPress }: ModelSelectorButtonProps) {
  const colors = useThemeColors();
  const selectedModel = useModelStore((s) => s.selectedModel);
  const routingProfile = useModelStore((s) => s.routingProfile);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const thinkingEnabled = useModelStore((s) => s.thinkingEnabledPerModel[s.selectedModel] ?? false);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const subscriptionTier = useTierStore((s) => s.tier);
  const conversationId = useChatStore((s) => s.currentConversationId);
  const selectedEffort = useAgentControlStore((s) => s.resolve(conversationId ?? '', null).effort);

  const routingProfileLabel =
    appMode === 'cloud' && selectedModel === DEFAULT_AUTO_MODE_ID && routingProfile !== 'auto'
      ? ROUTING_PROFILE_CHOICE_OPTIONS.find((option) => option.choice === routingProfile)?.label
      : undefined;
  const label = routingProfileLabel ?? getShortDisplayName(selectedModel, subscriptionTier);
  const turnEffort = resolveTurnEffort({
    selectedEffort,
    supportedEfforts: getModelEffortOptions(selectedModel),
    reasoningControl: getModelReasoning(selectedModel).control,
    thinkingEnabled,
  });
  const effortLabel = turnEffort ? EFFORT_LABEL[turnEffort as Effort] : undefined;
  const fastMode = useMobileFastMode(selectedModel);
  const fastOn = fastMode.offersFast && fastMode.enabled && fastMode.allowed;
  const accessibilityDetail = [
    fastOn ? 'fast mode on' : null,
    effortLabel ? `reasoning effort ${effortLabel}` : null,
  ]
    .filter(Boolean)
    .join(', ');

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
      accessibilityLabel={
        accessibilityDetail ? `Model: ${label}, ${accessibilityDetail}` : `Model: ${label}`
      }
      accessibilityRole="button"
      accessibilityHint="Opens the model picker"
    >
      <Text
        numberOfLines={1}
        style={{
          color: colors.textSecondary,
          fontSize: typeScale.footnote,
          lineHeight: 16,
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
            fontSize: typeScale.footnote,
            lineHeight: 16,
            includeFontPadding: false,
          }}
        >
          Fast
        </Text>
      ) : null}
      {effortLabel ? (
        <Text
          numberOfLines={1}
          style={{
            color: colors.textMuted,
            fontSize: typeScale.footnote,
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
