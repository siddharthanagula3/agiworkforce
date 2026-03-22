import { View, Pressable } from 'react-native';
import { Bot, Brain, ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { useModelStore } from '@/stores/modelStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { getDisplayName, isAutoMode, getModelById, PROVIDERS } from '@/lib/models';
import { colors } from '@/lib/theme';

interface ModelSelectorButtonProps {
  onPress: () => void;
}

/**
 * Compact button that sits inside the ChatInput bar.
 * Shows provider icon + current model name (or "Auto") and opens the ModelPickerSheet.
 * Displays a small Brain badge when thinking mode is enabled for the selected model.
 */
export function ModelSelectorButton({ onPress }: ModelSelectorButtonProps) {
  const selectedModel = useModelStore((s) => s.selectedModel);
  const thinkingEnabledPerModel = useModelStore((s) => s.thinkingEnabledPerModel);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const isAuto = isAutoMode(selectedModel);
  const label = getDisplayName(selectedModel);
  const thinkingOn = thinkingEnabledPerModel[selectedModel] ?? false;

  // Get provider color for non-auto models.
  const model = isAuto ? null : getModelById(selectedModel);
  const provider = model ? PROVIDERS.find((p) => p.id === model.provider) : null;
  const iconColor = isAuto ? colors.textMuted : (provider?.color ?? colors.teal);

  const handlePress = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center gap-1 px-1.5 py-1.5 rounded-lg active:bg-white/5"
      accessibilityLabel={`Model: ${label}${thinkingOn ? ', thinking mode on' : ''}`}
      accessibilityRole="button"
      accessibilityHint="Opens model picker"
    >
      {/* Provider icon with thinking indicator */}
      <View className="relative">
        <Bot size={18} color={iconColor} />

        {/* Per-model thinking indicator — small purple dot */}
        {thinkingOn && (
          <View className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-purple-500 border border-surface-base items-center justify-center">
            <Brain size={6} color="#fff" />
          </View>
        )}
      </View>

      {/* Truncated label */}
      <Text
        className={`text-xs font-medium max-w-[80px] ${isAuto ? 'text-white/50' : 'text-teal-400'}`}
        numberOfLines={1}
      >
        {label}
      </Text>

      <ChevronDown size={12} color={colors.textMuted} />
    </Pressable>
  );
}
