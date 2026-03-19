import { useCallback } from 'react';
import { View, FlatList, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Image, Mic, GitCompare, Download } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

/**
 * Slash-command palette shown above the chat input when the user types "/".
 * Displays a short list of available commands with icons and descriptions.
 * Tapping a command calls onSelectCommand with the command string (e.g. "/image").
 */

interface Command {
  label: string;
  command: string;
  description: string;
  icon: React.ReactNode;
}

const COMMANDS: Command[] = [
  {
    label: 'image',
    command: '/image',
    description: 'Generate an image',
    icon: <Image size={16} color={colors.teal} />,
  },
  {
    label: 'voice',
    command: '/voice',
    description: 'Start voice conversation',
    icon: <Mic size={16} color={colors.teal} />,
  },
  {
    label: 'compare',
    command: '/compare',
    description: 'Compare model responses',
    icon: <GitCompare size={16} color={colors.teal} />,
  },
  {
    label: 'export',
    command: '/export',
    description: 'Export conversation',
    icon: <Download size={16} color={colors.teal} />,
  },
];

export interface CommandPaletteProps {
  visible: boolean;
  query: string;
  onSelectCommand: (command: string) => void;
}

export function CommandPalette({ visible, query, onSelectCommand }: CommandPaletteProps) {
  const filtered = COMMANDS.filter((cmd) => cmd.label.startsWith(query.slice(1).toLowerCase()));

  const renderItem = useCallback(
    ({ item }: { item: Command }) => (
      <Pressable
        onPress={() => onSelectCommand(item.command)}
        className="flex-row items-center gap-3 px-3 py-2.5 active:bg-white/5"
        accessibilityLabel={`Command ${item.command}: ${item.description}`}
        accessibilityRole="button"
      >
        <View className="w-7 h-7 rounded-lg bg-teal-500/15 items-center justify-center">
          {item.icon}
        </View>
        <View className="flex-1">
          <Text className="text-[13px] font-semibold text-white">{item.command}</Text>
          <Text className="text-[11px] text-white/50">{item.description}</Text>
        </View>
      </Pressable>
    ),
    [onSelectCommand],
  );

  const keyExtractor = useCallback((item: Command) => item.command, []);

  if (!visible || filtered.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(100)}
      className="mb-1 rounded-xl border border-white/8 overflow-hidden"
      style={{ backgroundColor: colors.surfaceOverlay }}
      accessibilityLabel="Command suggestions"
      accessibilityRole="menu"
    >
      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        scrollEnabled={false}
        keyboardShouldPersistTaps="handled"
      />
    </Animated.View>
  );
}
