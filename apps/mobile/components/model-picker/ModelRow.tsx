import { View, Pressable } from 'react-native';
import { Eye, Brain, Star } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { colors } from '@/lib/theme';
import { formatContextWindow } from '@/lib/models';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ModelDef } from '@/lib/models';

interface ModelRowProps {
  model: ModelDef;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export function ModelRow({
  model,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: ModelRowProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const handlePress = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSelect(model.id);
  };

  const handleLongPress = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onToggleFavorite(model.id);
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={400}
      className={`flex-row items-center px-4 py-3 gap-3 ${
        isSelected ? 'bg-teal-500/10' : 'active:bg-white/5'
      }`}
    >
      {/* Left: model name + badges */}
      <View className="flex-1 gap-1">
        <Text
          className={`text-sm font-medium ${
            isSelected ? 'text-teal-400' : 'text-white'
          }`}
          numberOfLines={1}
        >
          {model.name}
        </Text>

        {/* Capability badges row */}
        <View className="flex-row items-center gap-1.5 flex-wrap">
          <Badge label={formatContextWindow(model.contextWindow)} color="gray" />

          {model.supportsVision && (
            <View className="flex-row items-center gap-0.5 bg-blue-500/15 px-1.5 py-0.5 rounded-full">
              <Eye size={10} color="#60a5fa" />
              <Text className="text-[9px] text-blue-400 font-medium">Vision</Text>
            </View>
          )}

          {model.supportsThinking && (
            <View className="flex-row items-center gap-0.5 bg-purple-500/15 px-1.5 py-0.5 rounded-full">
              <Brain size={10} color="#a78bfa" />
              <Text className="text-[9px] text-purple-400 font-medium">Thinking</Text>
            </View>
          )}
        </View>
      </View>

      {/* Right: favorite star */}
      <Star
        size={16}
        color={isFavorite ? '#f59e0b' : 'rgba(255,255,255,0.2)'}
        fill={isFavorite ? '#f59e0b' : 'transparent'}
      />
    </Pressable>
  );
}
