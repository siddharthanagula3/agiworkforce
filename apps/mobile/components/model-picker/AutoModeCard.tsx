import { View, Pressable } from 'react-native';
import { Zap, Scale, Crown, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import type { AutoModeDef } from '@/lib/models';

// Map icon name strings to Lucide components so we can render dynamically.

const ICON_MAP: Record<string, LucideIcon> = {
  Zap,
  Scale,
  Crown,
};

interface AutoModeCardProps {
  mode: AutoModeDef;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function SingleCard({ mode, isSelected, onSelect }: AutoModeCardProps) {
  const Icon = ICON_MAP[mode.icon] ?? Zap;

  return (
    <Pressable
      onPress={() => onSelect(mode.id)}
      className={`flex-1 items-center gap-1.5 rounded-xl px-3 py-3 border ${
        isSelected
          ? 'border-teal-500 bg-teal-500/10'
          : 'border-white/8 bg-surface-elevated active:bg-white/5'
      }`}
    >
      <Icon size={18} color={isSelected ? colors.teal : colors.textMuted} />
      <Text className={`text-xs font-semibold ${isSelected ? 'text-teal-400' : 'text-white'}`}>
        {mode.name}
      </Text>
      <Text className="text-[10px] text-white/50 text-center">{mode.description}</Text>
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
    <View className="flex-row gap-2 px-4 mb-4">
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
