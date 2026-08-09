/**
 * KeybindingsSettings — the rebinding surface must not lie.
 *
 * Two properties are load-bearing here:
 *  1. Every id this page sends to `shortcuts_update` is an id the Rust registry
 *     actually holds. It used to send the renderer ids ("new-chat", …), which
 *     `shortcuts.rs` has never heard of, so every sync failed.
 *  2. A rejected sync is reported. The rejection used to be swallowed by a
 *     `console.warn` under an unconditional "Shortcut updated" toast.
 */
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

// ── Mocks ────────────────────────────────────────────────────────────────────

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

// The cheatsheet overlay is a separate surface with its own stores; this file
// is about the rebinding rows.
vi.mock('@/features/chat/KeyboardShortcutsOverlay', () => ({
  KeyboardShortcutsOverlay: () => null,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname);

/** Shortcut ids `ShortcutsState::with_defaults()` inserts into the registry. */
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

/** Rebinds one row by pressing an unused combo into its capture field. */
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('KeybindingsSettings backend sync', () => {
  it('only sends shortcut ids the Rust registry defines', async () => {
    const registryIds = rustRegistryIds();
    expect(registryIds.length).toBeGreaterThan(0);

    render(<KeybindingsSettings />);

    // Function keys are used by no default binding, so no edit trips the
    // "combo already used" path instead of syncing.
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
    // The row must not show a binding the OS never took.
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

/**
 * The rows this page edits are dispatched by the App shell keydown router
 * (`App.tsx`), which asks `matchesBinding` which row an event belongs to. The
 * old ad-hoc handler compared only "meta or ctrl held", so Cmd+Shift+K opened
 * the search modal on its way to the command palette.
 */
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
});
