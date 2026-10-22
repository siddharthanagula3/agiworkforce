import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { CHAT_SHORTCUTS, matchesShortcut } from '@agiworkforce/unified-chat';

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useHostShortcuts: () => [],
}));

import { KeyboardShortcutsDialog } from '../KeyboardShortcutsDialog';
import { KEYBOARD_SHORTCUT_DOCS } from '../../../hooks/use-keyboard-shortcuts';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { LOCAL_TERMINAL_SHORTCUT } from '@/features/code/local-code';

beforeEach(() => {
  useSettingsStore.setState({ disabledShortcutIds: [], shortcutBindings: {} });
});
afterEach(cleanup);

describe('KeyboardShortcutsDialog reads the shared registry', () => {
  it('is handed the registry itself, not a copy', () => {
    expect(KEYBOARD_SHORTCUT_DOCS).toBe(CHAT_SHORTCUTS);
  });

  it('lists every registered binding, composer keys included', () => {
    render(
      <KeyboardShortcutsDialog open onOpenChange={() => {}} shortcuts={KEYBOARD_SHORTCUT_DOCS} />,
    );

    for (const shortcut of CHAT_SHORTCUTS) {
      expect(screen.getByText(shortcut.description)).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'App' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Composer' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Code' })).toBeInTheDocument();
  });

  it('lists the Code terminal toggle with the chord the workspace matches, and nothing to rebind', () => {
    const terminal = CHAT_SHORTCUTS.find((shortcut) => shortcut.id === 'code-terminal-toggle')!;
    expect(terminal.scope).toBe('code');
    expect(terminal.key).toBe(LOCAL_TERMINAL_SHORTCUT.key);
    expect(terminal.control).toBe(LOCAL_TERMINAL_SHORTCUT.control);
    const controlBacktick = {
      key: '`',
      metaKey: false,
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
    };
    expect(matchesShortcut(controlBacktick, terminal, true)).toBe(true);
    expect(
      matchesShortcut({ ...controlBacktick, metaKey: true, ctrlKey: false }, terminal, true),
    ).toBe(false);

    render(
      <KeyboardShortcutsDialog open onOpenChange={() => {}} shortcuts={KEYBOARD_SHORTCUT_DOCS} />,
    );
    const code = screen.getByRole('region', { name: 'Code' });
    expect(within(code).getByText('Show or hide the terminal')).toBeInTheDocument();
    expect(within(code).queryAllByRole('button')).toHaveLength(0);
    expect(within(code).queryAllByRole('switch')).toHaveLength(0);
  });

  it('offers an off switch for app shortcuts only', () => {
    render(
      <KeyboardShortcutsDialog open onOpenChange={() => {}} shortcuts={KEYBOARD_SHORTCUT_DOCS} />,
    );
    const dialog = screen.getByRole('dialog');

    for (const shortcut of CHAT_SHORTCUTS) {
      const toggle = within(dialog).queryByRole('switch', { name: shortcut.description });
      if (shortcut.scope === 'app') expect(toggle).toBeInTheDocument();
      else expect(toggle).toBeNull();
    }
  });
});
