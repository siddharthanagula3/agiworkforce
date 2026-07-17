import { useCallback } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Code2, PenLine, Search } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export type TaskChipType = 'code' | 'write' | 'research';

export const TASK_CHIP_SEND_CONTEXT: Record<
  TaskChipType,
  { mode: 'create' | 'research'; taskInstruction: string }
> = {
  code: {
    mode: 'create',
    taskInstruction:
      'Task: Code. Help with software development using precise steps, code examples when useful, and clear caveats for unverified assumptions.',
  },
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
  type: TaskChipType;
  label: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
}

const CHIPS: ChipDef[] = [
  { type: 'code', label: 'Code', Icon: Code2 },
  { type: 'write', label: 'Write', Icon: PenLine },
  { type: 'research', label: 'Research', Icon: Search },
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
        const contentColor = active ? colors.teal : colors.textSecondary;
        return (
          // No `style` prop on Pressable — see MOBILE-PRESSABLE-CSSINTEROP-FLEXDIR-01
          // (docs/agent-context/known-flaws.md): a function-style `style` prop
          // silently drops flexDirection/alignItems/padding in this stack, which
          // would stack the icon above the label instead of beside it inside the
          // pill. `children`-as-function keeps pressed state while every real
          // style lives on a plain View.
          <Pressable
            key={chip.type}
            onPress={() => handlePress(chip.type)}
            accessibilityLabel={`${chip.label} mode`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  height: 34,
                  paddingHorizontal: 12,
                  borderWidth: 1,
                  borderRadius: 999,
                  borderColor: active
                    ? colors.accentBorder
                    : pressed
                      ? colors.border
                      : colors.border,
                  backgroundColor: active
                    ? colors.accentSurface
                    : pressed
                      ? colors.surfaceHover
                      : colors.transparent,
                }}
              >
                <chip.Icon size={14} color={contentColor} strokeWidth={1.75} />
                <Text
                  style={{
                    fontSize: 13,
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
    </ScrollView>
  );
}
