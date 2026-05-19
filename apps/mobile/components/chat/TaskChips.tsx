import { useCallback } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Code2, PenLine, Search, Image as ImageIcon, Film, Monitor } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useTheme';

export type TaskChipType = 'code' | 'write' | 'research' | 'image' | 'video' | 'computer';

interface ChipDef {
  type: TaskChipType;
  label: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
}

const CHIPS: ChipDef[] = [
  { type: 'code', label: 'Code', Icon: Code2 },
  { type: 'write', label: 'Write', Icon: PenLine },
  { type: 'research', label: 'Research', Icon: Search },
  { type: 'image', label: 'Image', Icon: ImageIcon },
  { type: 'video', label: 'Video', Icon: Film },
  { type: 'computer', label: 'Computer', Icon: Monitor },
];

interface TaskChipsProps {
  activeChip?: TaskChipType | null;
  onChipPress: (chip: TaskChipType) => void;
}

export function TaskChips({ activeChip, onChipPress }: TaskChipsProps) {
  const colors = useThemeColors();

  const handlePress = useCallback(
    (type: TaskChipType) => {
      onChipPress(type);
    },
    [onChipPress],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}
    >
      {CHIPS.map((chip) => {
        const active = activeChip === chip.type;
        return (
          <Pressable
            key={chip.type}
            onPress={() => handlePress(chip.type)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              height: 34,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderRadius: 999,
              borderColor: active
                ? `${colors.teal}66`
                : pressed
                  ? 'rgba(255,255,255,0.15)'
                  : colors.border,
              backgroundColor: active
                ? `${colors.teal}22`
                : pressed
                  ? colors.surfaceHover
                  : 'transparent',
            })}
            accessibilityLabel={`${chip.label} mode`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <chip.Icon
              size={14}
              color={active ? colors.teal : colors.textSecondary}
              strokeWidth={1.75}
            />
            <Text
              style={{
                fontSize: 13,
                color: active ? colors.teal : colors.textSecondary,
                fontWeight: active ? '500' : '400',
              }}
            >
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
