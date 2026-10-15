import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { CHAT_SHORTCUTS } from '@agiworkforce/unified-chat';

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useHostShortcuts: () => [],
}));

import { KeyboardShortcutsDialog } from '../KeyboardShortcutsDialog';
import { KEYBOARD_SHORTCUT_DOCS } from '../../../hooks/use-keyboard-shortcuts';
import { useSettingsStore } from '@shared/stores/web-settings-store';

beforeEach(() => {
  useSettingsStore.setState({ disabledShortcutIds: [] });
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
    expect(screen.getByRole('heading', { name: 'Message composer' })).toBeInTheDocument();
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
