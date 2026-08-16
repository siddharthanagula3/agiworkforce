import { useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { Image as ImageIcon, PenLine, Search } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export type TaskChipType = 'write' | 'research';
export type TaskSuggestionType = 'image' | TaskChipType;

export const TASK_CHIP_SEND_CONTEXT: Record<
  TaskChipType,
  { mode: 'create' | 'research'; taskInstruction: string }
> = {
  write: {
    mode: 'create',
    taskInstruction:
      'Task: Write. Draft, edit, or structure writing with practical language and a polished final answer.',
  },
  research: {
    mode: 'research',
    taskInstruction:
      'Task: Research. Analyze carefully, separate facts from uncertainty, and avoid claiming live web access unless a web-search tool is available.',
  },
};

interface ChipDef {
  type: TaskSuggestionType;
  label: string;
  cloudOnly?: boolean;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
}

const CHIPS: ChipDef[] = [
  { type: 'image', label: 'Create an image', Icon: ImageIcon, cloudOnly: true },
  { type: 'write', label: 'Write or edit', Icon: PenLine },
  { type: 'research', label: 'Search the web', Icon: Search, cloudOnly: true },
];

interface TaskChipsProps {
  activeChip?: TaskChipType | null;
  onChipPress: (chip: TaskSuggestionType) => void;
  showCloudSuggestions: boolean;
}

export function TaskChips({ activeChip, onChipPress, showCloudSuggestions }: TaskChipsProps) {
  const colors = useThemeColors();

  const handlePress = useCallback(
    (type: TaskSuggestionType) => {
      onChipPress(type);
    },
    [onChipPress],
  );

  return (
    <View style={{ width: '100%', gap: 2 }}>
      {CHIPS.filter((chip) => showCloudSuggestions || !chip.cloudOnly).map((chip) => {
        const active = activeChip === chip.type;
        const contentColor = active ? colors.teal : colors.textSecondary;
        return (
          <Pressable
            key={chip.type}
            onPress={() => handlePress(chip.type)}
            accessibilityLabel={chip.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 44,
                  paddingHorizontal: 8,
                  borderRadius: 10,
                  backgroundColor: active
                    ? colors.accentSurface
                    : pressed
                      ? colors.surfaceHover
                      : colors.transparent,
                }}
              >
                <chip.Icon size={17} color={contentColor} strokeWidth={1.75} />
                <Text
                  style={{
                    fontSize: 14,
                    color: contentColor,
                    fontWeight: active ? '500' : '400',
                  }}
                >
                  {chip.label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
