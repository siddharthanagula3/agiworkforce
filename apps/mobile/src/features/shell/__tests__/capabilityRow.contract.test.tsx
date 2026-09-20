/* eslint-disable @typescript-eslint/no-require-imports */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react-native';
import { ALL_PLATFORM_CAPABILITIES, getPlatformCapabilities } from '@agiworkforce/types';
import type { PlatformCapability } from '@agiworkforce/types';

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

const mockCapabilities = { value: getPlatformCapabilities('mobile') };
const mockPathname = { value: '/chats' };
jest.mock('@/src/lib/capabilities', () => ({ useCapabilities: () => mockCapabilities.value }));
jest.mock('expo-router', () => ({ usePathname: () => mockPathname.value }));

jest.mock('../ShellSecondarySheet', () => {
  const { View } = require('react-native');
  return { ShellSecondarySheet: () => <View testID="shell.secondary-sheet" /> };
});

import {
  resolveShellShortcuts,
  SHELL_CAPABILITY_SHORTCUTS,
  SHELL_SHORTCUT_ROW_LIMIT,
} from '../capabilityShortcuts';
import {
  isShortcutActive,
  ShellCapabilityShortcuts,
  SHORTCUT_MIN_TOUCH_SIZE,
} from '../ShellCapabilityShortcuts';

const DRAWER_SOURCE = readFileSync(
  join(__dirname, '..', '..', 'drawer', 'components', 'DrawerContent.tsx'),
  'utf8',
);

function capabilities(enabled: PlatformCapability[]): Record<PlatformCapability, boolean> {
  const row = {} as Record<PlatformCapability, boolean>;
  for (const capability of ALL_PLATFORM_CAPABILITIES)
    row[capability] = enabled.includes(capability);
  return row;
}

beforeEach(() => {
  mockCapabilities.value = getPlatformCapabilities('mobile');
  mockPathname.value = '/chats';
});

describe('the capability row', () => {
  it('reaches every touch target at the minimum size, including the overflow button', () => {
    const { getByLabelText } = render(<ShellCapabilityShortcuts onOpen={jest.fn()} />);
    const { row, overflow } = resolveShellShortcuts(getPlatformCapabilities('mobile'));

    for (const shortcut of row) {
      const style = getByLabelText(shortcut.label).props.style as { minHeight?: number };
      expect(style.minHeight).toBeGreaterThanOrEqual(SHORTCUT_MIN_TOUCH_SIZE);
    }
    if (overflow.length > 0) {
      const more = getByLabelText('More shortcuts').props.style as {
        minHeight?: number;
        width?: number;
      };
      expect(more.minHeight).toBeGreaterThanOrEqual(SHORTCUT_MIN_TOUCH_SIZE);
      expect(more.width).toBeGreaterThanOrEqual(44);
    }
  });

  it('marks the shortcut whose screen is open and leaves the others unmarked', () => {
    mockPathname.value = '/voice';
    const { getByLabelText } = render(<ShellCapabilityShortcuts onOpen={jest.fn()} />);

    expect(getByLabelText('Voice').props.accessibilityState).toMatchObject({ selected: true });
    expect(getByLabelText('Camera').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('matches a nested screen of a shortcut but not a route that merely starts alike', () => {
    expect(isShortcutActive('/(app)/camera', '/camera')).toBe(true);
    expect(isShortcutActive('/(app)/camera', '/camera/review')).toBe(true);
    expect(isShortcutActive('/(app)/scan', '/scanner')).toBe(false);
  });

  it('stays one row deep whatever the device can do, so the chat list keeps its space', () => {
    for (const enabled of [
      ALL_PLATFORM_CAPABILITIES,
      ['canUseVoice', 'canUseCamera'] as PlatformCapability[],
      ['canUseCamera', 'canUseCloudModels'] as PlatformCapability[],
    ]) {
      const { row } = resolveShellShortcuts(capabilities([...enabled]));
      expect(row.length).toBeLessThanOrEqual(SHELL_SHORTCUT_ROW_LIMIT);
    }
  });

  it('keeps every label short enough to read rather than truncate in one line', () => {
    for (const shortcut of SHELL_CAPABILITY_SHORTCUTS) {
      expect(shortcut.label.trim()).toBe(shortcut.label);
      expect(shortcut.label.length).toBeGreaterThan(2);
      expect(shortcut.label.length).toBeLessThanOrEqual(12);
    }
    expect(new Set(SHELL_CAPABILITY_SHORTCUTS.map((s) => s.label)).size).toBe(
      SHELL_CAPABILITY_SHORTCUTS.length,
    );
  });

  // The row is an accelerator. Nothing may be reachable only through it, or a
  // device that switched a capability off would lose a destination entirely.
  it('duplicates no navigation destination the drawer owns', () => {
    const drawerRoutes = new Set(
      Array.from(DRAWER_SOURCE.matchAll(/route: '(\/\(app\)\/[^']+)'/g), (match) => match[1]),
    );

    expect(drawerRoutes.size).toBeGreaterThan(5);
    for (const shortcut of SHELL_CAPABILITY_SHORTCUTS) {
      expect(drawerRoutes.has(shortcut.route)).toBe(false);
    }
  });

  it('renders nothing at all on a device that reaches fewer than two of them', () => {
    mockCapabilities.value = capabilities(['canUseVoice']);
    const { toJSON } = render(<ShellCapabilityShortcuts onOpen={jest.fn()} />);

    expect(toJSON()).toBeNull();
  });
});
