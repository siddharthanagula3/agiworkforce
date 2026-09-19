import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  Camera,
  GitCompareArrows,
  Mic,
  MoreHorizontal,
  ScanText,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useCapabilities } from '@/src/lib/capabilities';
import {
  resolveShellShortcuts,
  type ShellShortcutKey,
  type ShellShortcutRoute,
} from './capabilityShortcuts';
import { ShellSecondarySheet } from './ShellSecondarySheet';

const SHORTCUT_ICONS: Record<ShellShortcutKey, LucideIcon> = {
  voice: Mic,
  camera: Camera,
  scan: ScanText,
  compare: GitCompareArrows,
};

const MORE_LABEL = 'More shortcuts';

export function ShellCapabilityShortcuts({
  onOpen,
}: {
  onOpen: (route: ShellShortcutRoute) => void;
}) {
  const colors = useThemeColors();
  const capabilities = useCapabilities();
  const { row, overflow } = useMemo(() => resolveShellShortcuts(capabilities), [capabilities]);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (row.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 12 }}>
      {row.map((shortcut) => {
        const Icon = SHORTCUT_ICONS[shortcut.key];
        return (
          <Pressable
            key={shortcut.key}
            onPress={() => onOpen(shortcut.route)}
            accessibilityRole="button"
            accessibilityLabel={shortcut.label}
            style={{
              flex: 1,
              minHeight: 56,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              paddingHorizontal: 4,
            }}
          >
            <Icon size={18} color={colors.textPrimary} strokeWidth={1.8} />
            <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12 }}>
              {shortcut.label}
            </Text>
          </Pressable>
        );
      })}

      {overflow.length > 0 ? (
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={MORE_LABEL}
          style={{
            width: 44,
            minHeight: 56,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MoreHorizontal size={18} color={colors.textPrimary} strokeWidth={1.8} />
        </Pressable>
      ) : null}

      {sheetOpen ? (
        <ShellSecondarySheet
          title={MORE_LABEL}
          controls={overflow.map((shortcut) => ({
            key: shortcut.key,
            label: shortcut.label,
            icon: SHORTCUT_ICONS[shortcut.key],
            onPress: () => {
              setSheetOpen(false);
              onOpen(shortcut.route);
            },
          }))}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </View>
  );
}
