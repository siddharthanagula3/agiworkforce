import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Sidebar,
  TOGGLE_SIDEBAR_SHORTCUT,
  toggleSidebarAriaKeyShortcuts,
  toggleSidebarShortcutLabel,
} from '../Sidebar';

afterEach(() => {
  cleanup();
});

function renderSidebar(collapsed: boolean) {
  return render(
    <Sidebar
      sessions={[]}
      mode="cloud"
      collapsed={collapsed}
      onNewChat={vi.fn()}
      onOpenSearch={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onToggleCollapse={vi.fn()}
    />,
  );
}

async function hoverToggle() {
  const toggle = screen.getByRole('button', { name: 'Toggle sidebar' });
  fireEvent.pointerEnter(toggle);
  fireEvent.pointerMove(toggle);
  return { toggle, tooltip: await screen.findByRole('tooltip') };
}

describe('sidebar toggle names its shortcut', () => {
  it.each([
    ['expanded', false],
    ['collapsed rail', true],
  ])('shows the label and the chord in the %s tooltip', async (_name, collapsed) => {
    renderSidebar(collapsed);

    const { toggle, tooltip } = await hoverToggle();

    expect(tooltip.textContent).toContain('Toggle sidebar');
    expect(tooltip.textContent).toContain(toggleSidebarShortcutLabel());
    expect(toggle.getAttribute('aria-keyshortcuts')).toBe(toggleSidebarAriaKeyShortcuts());
  });

  it('opens the expanded tooltip on keyboard focus too', async () => {
    renderSidebar(false);

    fireEvent.focus(screen.getByRole('button', { name: 'Toggle sidebar' }));

    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByText(toggleSidebarShortcutLabel())).toBeTruthy();
  });

  it('formats the chord for each platform', () => {
    expect(TOGGLE_SIDEBAR_SHORTCUT).toEqual({ key: 'B', ctrl: true, meta: true });
    expect(toggleSidebarShortcutLabel(true)).toBe('⌘B');
    expect(toggleSidebarShortcutLabel(false)).toBe('Ctrl+B');
    expect(toggleSidebarAriaKeyShortcuts(true)).toBe('Meta+B');
    expect(toggleSidebarAriaKeyShortcuts(false)).toBe('Control+B');
  });

  it('gives the other rail buttons no shortcut badge', async () => {
    renderSidebar(true);

    const newChat = screen.getByRole('button', { name: 'New chat' });
    fireEvent.pointerEnter(newChat);
    fireEvent.pointerMove(newChat);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.querySelector('kbd')).toBeNull();
    expect(newChat.hasAttribute('aria-keyshortcuts')).toBe(false);
  });
});
