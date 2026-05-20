import { View, Pressable } from 'react-native';
import { Bot, Brain, ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { useModelStore } from '@/stores/modelStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { getDisplayName, isAutoMode, getModelById, PROVIDERS } from '@/lib/models';
import { useThemeColors } from '@/hooks/useTheme';

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
  const colors = useThemeColors();

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
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: pressed ? colors.surfaceHover : 'transparent',
      })}
      accessibilityLabel={`Model: ${label}${thinkingOn ? ', thinking mode on' : ''}`}
      accessibilityRole="button"
      accessibilityHint="Opens model picker"
    >
      {/* Provider icon with thinking indicator */}
      <View style={{ position: 'relative' }}>
        <Bot size={18} color={iconColor} />

        {/* Per-model thinking indicator — small purple dot */}
        {thinkingOn && (
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 10,
              height: 10,
              borderRadius: 999,
              backgroundColor: colors.agentThinking,
              borderWidth: 1,
              borderColor: colors.surfaceBase,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Brain size={6} color={colors.white} />
          </View>
        )}
      </View>

      {/* Truncated label */}
      <Text
        style={{
          maxWidth: 80,
          fontSize: 12,
          fontWeight: '500',
          color: isAuto ? colors.textMuted : colors.teal,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>

      <ChevronDown size={12} color={colors.textMuted} />
    </Pressable>
  );
}
