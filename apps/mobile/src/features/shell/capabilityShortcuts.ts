import type { PlatformCapability } from '@agiworkforce/types';

export type ShellShortcutKey = 'voice' | 'camera' | 'scan' | 'compare';

export type ShellShortcutRoute =
  '/(app)/voice' | '/(app)/camera' | '/(app)/scan' | '/(app)/compare';

export interface ShellCapabilityShortcut {
  key: ShellShortcutKey;
  label: string;
  capability: PlatformCapability;
  route: ShellShortcutRoute;
}

export const SHELL_CAPABILITY_SHORTCUTS: readonly ShellCapabilityShortcut[] = [
  { key: 'voice', label: 'Voice', capability: 'canUseVoice', route: '/(app)/voice' },
  { key: 'camera', label: 'Camera', capability: 'canUseCamera', route: '/(app)/camera' },
  { key: 'scan', label: 'Scan', capability: 'canUseCamera', route: '/(app)/scan' },
  { key: 'compare', label: 'Compare', capability: 'canUseCloudModels', route: '/(app)/compare' },
];

export const SHELL_SHORTCUT_ROW_LIMIT = 3;
export const SHELL_SHORTCUT_ROW_MINIMUM = 2;

export interface ShellShortcutPlacement {
  row: ShellCapabilityShortcut[];
  overflow: ShellCapabilityShortcut[];
}

/**
 * The row earns its space only where the device can reach at least two of these
 * capabilities; one shortcut is a stray button, none is a blank strip.
 */
export function resolveShellShortcuts(
  capabilities: Readonly<Record<PlatformCapability, boolean>>,
): ShellShortcutPlacement {
  const enabled = SHELL_CAPABILITY_SHORTCUTS.filter(
    (shortcut) => capabilities[shortcut.capability],
  );
  if (enabled.length < SHELL_SHORTCUT_ROW_MINIMUM) return { row: [], overflow: [] };
  return {
    row: enabled.slice(0, SHELL_SHORTCUT_ROW_LIMIT),
    overflow: enabled.slice(SHELL_SHORTCUT_ROW_LIMIT),
  };
}
