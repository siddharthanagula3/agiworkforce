import { View, Pressable } from 'react-native';
import { Bot, Brain, ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { useModelStore } from '@/src/features/model-picker/store';
import { useSettingsStore } from '@/stores/settingsStore';
import { getShortDisplayName, isAutoMode, getModelById } from '@/src/features/model-picker/service';
import { useThemeColors, radii } from '@/src/ui/theme';

interface ModelSelectorButtonProps {
  onPress: () => void;
}

/**
 * Compact button that sits inside the ChatInput bar.
 * Shows provider icon + current model name (or "Auto") and opens the ModelPickerSheet.
 * Displays a small Brain badge when thinking mode is enabled for the selected model.
 */
export function ModelSelectorButton({ onPress }: ModelSelectorButtonProps) {
  const colors = useThemeColors();
  const selectedModel = useModelStore((s) => s.selectedModel);
  const thinkingEnabledPerModel = useModelStore((s) => s.thinkingEnabledPerModel);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const isAuto = isAutoMode(selectedModel);
  const label = getShortDisplayName(selectedModel);
  const thinkingOn = thinkingEnabledPerModel[selectedModel] ?? false;

  const model = isAuto ? null : getModelById(selectedModel);
  const iconColor = isAuto ? colors.textMuted : colors.teal;

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
        minWidth: 150,
        height: 36,
        borderRadius: radii.full,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        backgroundColor: pressed ? colors.surfaceHover : colors.inputSurface,
      })}
      hitSlop={6}
      accessibilityLabel={`Model: ${label}${thinkingOn ? ', thinking mode on' : ''}`}
      accessibilityRole="button"
      accessibilityHint="Opens model picker"
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          minWidth: 128,
        }}
      >
        {/* Provider icon with thinking indicator */}
        <View style={{ position: 'relative', width: 18, height: 18 }}>
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
                borderRadius: 5,
                borderWidth: 1,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.purple,
                borderColor: colors.surfaceBase,
              }}
            >
              <Brain size={6} color={colors.accentText} />
            </View>
          )}
        </View>

        {/* Truncated label */}
        <Text
          style={{
            color: model ? colors.teal : colors.textMuted,
            fontSize: 12,
            lineHeight: 15,
            fontWeight: '500',
            maxWidth: 88,
            flexShrink: 1,
            includeFontPadding: false,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>

        <ChevronDown size={12} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}
