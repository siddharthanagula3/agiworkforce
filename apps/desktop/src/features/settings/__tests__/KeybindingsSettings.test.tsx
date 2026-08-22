import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { KeybindingsSettings } from '../KeybindingsSettings';
import {
  DEFAULT_SHORTCUTS,
  GLOBAL_SHORTCUTS,
  RENDERER_SHORTCUTS,
  matchesBinding,
  resolveBinding,
} from '../../../constants/shortcuts';

let mockCustomKeybindings: Record<string, string> = {};
const mockSetCustomKeybinding = vi.fn();
const mockResetCustomKeybinding = vi.fn();
const mockResetAllCustomKeybindings = vi.fn();

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      customKeybindings: mockCustomKeybindings,
      setCustomKeybinding: mockSetCustomKeybinding,
      resetCustomKeybinding: mockResetCustomKeybinding,
      resetAllCustomKeybindings: mockResetAllCustomKeybindings,
    }),
}));

const mockUpdate = vi.fn();
const mockReset = vi.fn();

vi.mock('../../../stores/shortcutStore', () => ({
  useShortcutStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      init: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn(),
      update: mockUpdate,
      reset: mockReset,
    }),
}));

const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/features/chat/KeyboardShortcutsOverlay', () => ({
  KeyboardShortcutsOverlay: () => null,
}));

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname);

function rustRegistryIds(): string[] {
  const source = readFileSync(
    path.resolve(TEST_DIR, '../../../../src-tauri/src/sys/commands/shortcuts.rs'),
    'utf8',
  );
  const defaults = source.slice(
    source.indexOf('pub fn with_defaults()'),
    source.indexOf('impl Default for ShortcutsState'),
  );
  return [...defaults.matchAll(/id:\s*"([a-z_]+)"\.to_string\(\)/g)].map((match) => match[1]!);
}

function rebindRow(description: string, key: string, modifiers: Record<string, boolean> = {}) {
  fireEvent.click(screen.getByRole('button', { name: `Edit shortcut for ${description}` }));
  fireEvent.keyDown(screen.getByLabelText('Press new key combination'), {
    key,
    metaKey: true,
    ...modifiers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCustomKeybindings = {};
  mockUpdate.mockResolvedValue({});
  mockReset.mockResolvedValue([{ id: 'quick_summon' }]);
});

describe('KeybindingsSettings backend sync', () => {
  it('only sends shortcut ids the Rust registry defines', async () => {
    const registryIds = rustRegistryIds();
    expect(registryIds.length).toBeGreaterThan(0);

    render(<KeybindingsSettings />);

    DEFAULT_SHORTCUTS.forEach((shortcut, index) => {
      rebindRow(shortcut.description, `F${index + 1}`);
    });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(GLOBAL_SHORTCUTS.length);
    });

    for (const call of mockUpdate.mock.calls) {
      const id = call[0] as string;
      expect(registryIds, `"${id}" is not registered in shortcuts.rs`).toContain(id);
    }
  });

  it('sends the primary modifier as an accelerator Rust understands', async () => {
    render(<KeybindingsSettings />);
    rebindRow('Quick screen capture', 'F9');

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('quick_capture', 'CommandOrControl+f9');
    });
  });

  it('reports a rejected rebind instead of claiming success', async () => {
    mockUpdate.mockRejectedValue('Shortcut not found');

    render(<KeybindingsSettings />);
    rebindRow('Quick screen capture', 'F9');

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('Shortcut not found'));
    });
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockSetCustomKeybinding).not.toHaveBeenCalled();
  });

  it('reports a reset-all the registry refused', async () => {
    mockCustomKeybindings = { 'quick-capture': 'meta+shift+p' };
    mockReset.mockResolvedValue([]);

    render(<KeybindingsSettings />);
    fireEvent.click(screen.getByRole('button', { name: /Reset all to defaults/ }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.stringContaining('system hotkeys could not be restored'),
      );
    });
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('keeps in-app shortcuts off the backend entirely', async () => {
    render(<KeybindingsSettings />);
    rebindRow('Search', 'F9', { shiftKey: true });

    await waitFor(() => {
      expect(mockSetCustomKeybinding).toHaveBeenCalledWith('search', 'shift+meta+f9');
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('Shortcut updated');
  });
});

describe('renderer shortcut matching', () => {
  function bindingFor(id: string) {
    const row = RENDERER_SHORTCUTS.find((s) => s.id === id);
    if (!row) throw new Error(`RENDERER_SHORTCUTS has no "${id}" row`);
    return resolveBinding(row, {});
  }

  function press(key: string, held: { metaKey?: boolean; shiftKey?: boolean } = {}) {
    return { key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...held };
  }

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
  });

  it('does not let Cmd+Shift+K fire the Cmd+K search binding on its way past', () => {
    const event = press('k', { metaKey: true, shiftKey: true });
    expect(matchesBinding(event, bindingFor('search'))).toBe(false);
    expect(matchesBinding(event, bindingFor('command-palette'))).toBe(true);
  });

  it('routes a bare Cmd+K to search only', () => {
    const event = press('k', { metaKey: true });
    expect(matchesBinding(event, bindingFor('search'))).toBe(true);
    expect(matchesBinding(event, bindingFor('command-palette'))).toBe(false);
  });

  it('leaves Cmd+Z to the focused text field rather than reverting agent work', () => {
    const event = press('z', { metaKey: true });
    expect(matchesBinding(event, bindingFor('undo-last'))).toBe(false);
  });
});

describe('undo shortcut discoverability', () => {
  it('lists the undo binding as an editable row', () => {
    render(<KeybindingsSettings />);

    expect(screen.getByText('Undo last agent change')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit shortcut for Undo last agent change' }),
    ).toBeInTheDocument();
  });
});
