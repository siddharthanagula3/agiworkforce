import { ALL_PLATFORM_CAPABILITIES, getPlatformCapabilities } from '@agiworkforce/types';
import type { PlatformCapability } from '@agiworkforce/types';
import {
  resolveShellShortcuts,
  SHELL_CAPABILITY_SHORTCUTS,
  SHELL_SHORTCUT_ROW_LIMIT,
} from '../capabilityShortcuts';

function capabilities(enabled: PlatformCapability[]): Record<PlatformCapability, boolean> {
  const row = {} as Record<PlatformCapability, boolean>;
  for (const capability of ALL_PLATFORM_CAPABILITIES)
    row[capability] = enabled.includes(capability);
  return row;
}

describe('resolveShellShortcuts', () => {
  it('caps the row and sends the rest to the sheet on a mobile device', () => {
    const { row, overflow } = resolveShellShortcuts(getPlatformCapabilities('mobile'));

    expect(row).toHaveLength(SHELL_SHORTCUT_ROW_LIMIT);
    expect(row.length + overflow.length).toBe(SHELL_CAPABILITY_SHORTCUTS.length);
    expect([...row, ...overflow].map((shortcut) => shortcut.key)).toEqual(
      SHELL_CAPABILITY_SHORTCUTS.map((shortcut) => shortcut.key),
    );
  });

  it('drops a shortcut whose capability the server switched off', () => {
    const { row, overflow } = resolveShellShortcuts(
      capabilities(['canUseCamera', 'canUseCloudModels']),
    );

    expect(row.map((shortcut) => shortcut.key)).toEqual(['camera', 'scan', 'compare']);
    expect(overflow).toHaveLength(0);
  });

  it('renders nothing rather than a one-button row', () => {
    expect(resolveShellShortcuts(capabilities(['canUseVoice']))).toEqual({ row: [], overflow: [] });
    expect(resolveShellShortcuts(capabilities([]))).toEqual({ row: [], overflow: [] });
  });
});
