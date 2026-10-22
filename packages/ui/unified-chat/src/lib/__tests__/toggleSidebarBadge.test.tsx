import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@agiworkforce/ui';

import { CHAT_SHORTCUTS, formatShortcutKeys } from '../shortcutRegistry';

afterEach(() => {
  cleanup();
});

describe('the sidebar toggle renders the registry chord as its aria-keyshortcuts', () => {
  it.each([false, true])('matches toggle-sidebar when collapsed is %s', (collapsed) => {
    const binding = CHAT_SHORTCUTS.find((shortcut) => shortcut.id === 'toggle-sidebar');
    expect(binding).toBeDefined();

    render(
      <Sidebar
        sessions={[]}
        collapsed={collapsed}
        onNewChat={vi.fn()}
        onOpenSearch={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onToggleCollapse={vi.fn()}
      />,
    );

    const advertised = screen
      .getByRole('button', { name: 'Toggle sidebar' })
      .getAttribute('aria-keyshortcuts');
    const bound = formatShortcutKeys(binding!, false)
      .map((key) => (key === 'Ctrl' ? 'Control' : key))
      .join('+');
    expect(advertised).toBe(bound);
  });
});
