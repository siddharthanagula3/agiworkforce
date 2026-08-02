import { useCallback } from 'react';
import { View, FlatList } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Image, Mic, GitCompare, Download } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

/**
 * Slash-command palette shown above the chat input when the user types "/".
 * Displays a short list of available commands with icons and descriptions.
 * Tapping a command calls onSelectCommand with the command string (e.g. "/image").
 */

export type ChatCommand = '/image' | '/voice' | '/compare' | '/export';

interface Command {
  label: string;
  command: ChatCommand;
  description: string;
  Icon: typeof Image;
  /**
   * Trust boundary the command leaves the device through. Rendered as a pill
   * so a command that is only reachable in AGI Cloud says so before it is
   * tapped, instead of the user discovering it on a refused request.
   */
  boundary?: 'cloud';
}

const COMMANDS: Command[] = [
  {
    label: 'image',
    command: '/image',
    description: 'Generate an image',
    Icon: Image,
  },
  {
    label: 'voice',
    command: '/voice',
    description: 'Start voice conversation',
    Icon: Mic,
  },
  {
    label: 'compare',
    command: '/compare',
    description: 'Compare model responses',
    Icon: GitCompare,
    // Both panes stream through the managed-cloud gateway; there is no
    // on-device comparison path. Hosts only offer it in Cloud mode.
    boundary: 'cloud',
  },
  {
    label: 'export',
    command: '/export',
    description: 'Export conversation',
    Icon: Download,
  },
];

export interface CommandPaletteProps {
  visible: boolean;
  query: string;
  availableCommands: ChatCommand[];
  onSelectCommand: (command: ChatCommand) => void;
}

export function CommandPalette({
  visible,
  query,
  availableCommands,
  onSelectCommand,
}: CommandPaletteProps) {
  const colors = useThemeColors();
  const filtered = COMMANDS.filter(
    (cmd) =>
      availableCommands.includes(cmd.command) && cmd.label.startsWith(query.slice(1).toLowerCase()),
  );

  const renderItem = useCallback(
    ({ item }: { item: Command }) => {
      const Icon = item.Icon;
      return (
        <Pressable
          onPress={() => onSelectCommand(item.command)}
          className="flex-row items-center gap-3 px-3 py-2.5"
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
          })}
          accessibilityLabel={
            item.boundary === 'cloud'
              ? `Command ${item.command}: ${item.description}. Runs on AGI Cloud.`
              : `Command ${item.command}: ${item.description}`
          }
          accessibilityRole="button"
        >
          <View
            className="w-7 h-7 rounded-lg items-center justify-center"
            style={{ backgroundColor: colors.accentSurface }}
          >
            <Icon size={16} color={colors.teal} />
          </View>
          <View className="flex-1">
            <Text className="text-[13px] font-semibold" style={{ color: colors.textPrimary }}>
              {item.command}
            </Text>
            <Text className="text-[11px]" style={{ color: colors.textMuted }}>
              {item.description}
            </Text>
          </View>
          {item.boundary === 'cloud' ? (
            <View
              testID={`command-palette-boundary-${item.label}`}
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: colors.accentBorder,
                backgroundColor: colors.accentSurface,
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: '700',
                  color: colors.teal,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Cloud
              </Text>
            </View>
          ) : null}
        </Pressable>
      );
    },
    [colors, onSelectCommand],
  );

  const keyExtractor = useCallback((item: Command) => item.command, []);

  if (!visible || filtered.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(100)}
      className="mb-1 rounded-xl border overflow-hidden"
      style={{ backgroundColor: colors.surfaceOverlay, borderColor: colors.border }}
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
