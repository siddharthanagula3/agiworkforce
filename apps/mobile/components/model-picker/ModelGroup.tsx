import { useState, useCallback } from 'react';
import { View, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  Easing,
} from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { ModelRow } from './ModelRow';
import { colors } from '@/lib/theme';
import type { ModelDef, ProviderDef } from '@/lib/models';

interface ModelGroupProps {
  provider: ProviderDef;
  models: ModelDef[];
  selectedModelId: string;
  favorites: string[];
  onSelectModel: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  /** Whether the group starts expanded (e.g. the selected model's provider). */
  initiallyExpanded?: boolean;
}

export function ModelGroup({
  provider,
  models,
  selectedModelId,
  favorites,
  onSelectModel,
  onToggleFavorite,
  initiallyExpanded = false,
}: ModelGroupProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const rotation = useSharedValue(initiallyExpanded ? 0 : -90);

  const toggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    rotation.value = withTiming(next ? 0 : -90, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${rotation.value}deg` }],
  }));

  if (models.length === 0) return null;

  return (
    <View className="mb-1">
      {/* Header */}
      <Pressable
        onPress={toggle}
        className="flex-row items-center justify-between px-4 py-3 active:bg-white/5"
        accessibilityLabel={`${provider.name}, ${models.length} models`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View className="flex-row items-center gap-2.5">
          <View
            className="w-6 h-6 rounded-md items-center justify-center"
            style={{ backgroundColor: `${provider.color}20` }}
          >
            <Text className="text-[11px] font-bold" style={{ color: provider.color }}>
              {provider.name.charAt(0)}
            </Text>
          </View>

          <Text className="text-sm font-medium text-white">{provider.name}</Text>
          <Text className="text-xs text-white/40">{models.length}</Text>
        </View>

        <Animated.View style={chevronStyle}>
          <ChevronDown size={16} color={colors.textMuted} />
        </Animated.View>
      </Pressable>

      {/* Model rows (conditionally rendered) */}
      {expanded &&
        models.map((model) => (
          <ModelRow
            key={model.id}
            model={model}
            isSelected={selectedModelId === model.id}
            isFavorite={favorites.includes(model.id)}
            onSelect={onSelectModel}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
    </View>
  );
}
