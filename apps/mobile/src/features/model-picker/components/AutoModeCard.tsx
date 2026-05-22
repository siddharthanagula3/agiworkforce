import { View, Pressable } from 'react-native';
import { Check, Cpu } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/src/ui/theme';
import type { AutoModeDef } from '@/src/features/model-picker/service';

interface AutoModeCardProps {
  mode: AutoModeDef;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function SingleCard({ mode, isSelected, onSelect }: AutoModeCardProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const handlePress = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSelect(mode.id);
  };

  return (
    <Pressable
      onPress={handlePress}
      className={`flex-row items-center justify-between rounded-xl px-4 py-3 border ${
        isSelected
          ? 'border-teal-500/40 bg-teal-500/10'
          : 'border-white/8 bg-surface-elevated active:bg-white/5'
      }`}
      accessibilityLabel={`${mode.name}: ${mode.description}`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
    >
      <View className="flex-row items-center gap-3 flex-1">
        <View
          className="w-8 h-8 rounded-lg items-center justify-center"
          style={{ backgroundColor: isSelected ? `${colors.teal}22` : 'rgba(255,255,255,0.06)' }}
        >
          <Cpu size={16} color={isSelected ? colors.teal : colors.textMuted} />
        </View>
        <View className="gap-0.5 flex-1">
          <Text className={`text-sm font-semibold ${isSelected ? 'text-teal-400' : 'text-white'}`}>
            {mode.name}
          </Text>
          <Text className="text-xs text-white/50" numberOfLines={1}>
            {mode.description}
          </Text>
        </View>
      </View>

      {isSelected && <Check size={18} color={colors.teal} />}
    </Pressable>
  );
}

interface AutoModeCardsProps {
  modes: AutoModeDef[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function AutoModeCards({ modes, selectedId, onSelect }: AutoModeCardsProps) {
  return (
    <View className="gap-2 px-4 mb-2">
      {modes.map((mode) => (
        <SingleCard
          key={mode.id}
          mode={mode}
          isSelected={selectedId === mode.id}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}
