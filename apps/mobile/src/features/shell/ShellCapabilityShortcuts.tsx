import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { usePathname } from 'expo-router';
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

export const SHORTCUT_MIN_TOUCH_SIZE = 56;

export function isShortcutActive(route: ShellShortcutRoute, pathname: string): boolean {
  const screen = route.replace('/(app)', '');
  const current = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return current === screen || current.startsWith(`${screen}/`);
}

export function ShellCapabilityShortcuts({
  onOpen,
}: {
  onOpen: (route: ShellShortcutRoute) => void;
}) {
  const colors = useThemeColors();
  const capabilities = useCapabilities();
  const pathname = usePathname();
  const { row, overflow } = useMemo(() => resolveShellShortcuts(capabilities), [capabilities]);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (row.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 12 }}>
      {row.map((shortcut) => {
        const Icon = SHORTCUT_ICONS[shortcut.key];
        const active = isShortcutActive(shortcut.route, pathname);
        return (
          <Pressable
            key={shortcut.key}
            onPress={() => onOpen(shortcut.route)}
            accessibilityRole="button"
            accessibilityLabel={shortcut.label}
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              minHeight: SHORTCUT_MIN_TOUCH_SIZE,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: active ? colors.accentBorder : colors.border,
              backgroundColor: active ? colors.accentSurface : colors.surfaceElevated,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              paddingHorizontal: 4,
            }}
          >
            <Icon
              size={18}
              color={active ? colors.teal : colors.textPrimary}
              strokeWidth={active ? 2.2 : 1.8}
            />
            <Text
              numberOfLines={1}
              style={{
                color: active ? colors.textPrimary : colors.textSecondary,
                fontSize: 12,
                fontWeight: active ? '600' : '400',
              }}
            >
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
            minHeight: SHORTCUT_MIN_TOUCH_SIZE,
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
