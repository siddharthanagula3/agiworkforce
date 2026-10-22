import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from '../Sidebar';

afterEach(() => {
  cleanup();
});

function renderSidebar(props: { collapsed: boolean; hasUnreadConversations?: boolean }) {
  return render(
    <Sidebar
      sessions={[]}
      mode="cloud"
      onNewChat={vi.fn()}
      onOpenSearch={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onToggleCollapse={vi.fn()}
      {...props}
    />,
  );
}

describe('collapsed sidebar toggle carries the unread dot', () => {
  it('draws the dot on the rail toggle and names it for assistive tech', () => {
    renderSidebar({ collapsed: true, hasUnreadConversations: true });

    const toggle = screen.getByRole('button', { name: 'Toggle sidebar, Unread' });
    expect(toggle.querySelector('[data-testid="rail-unread-dot"]')).not.toBeNull();
  });

  it('draws nothing when no conversation is unread', () => {
    renderSidebar({ collapsed: true, hasUnreadConversations: false });

    expect(screen.queryByTestId('rail-unread-dot')).toBeNull();
    expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toBeTruthy();
  });

  it('keeps the expanded sidebar free of the dot, where the rows show the state', () => {
    renderSidebar({ collapsed: false, hasUnreadConversations: true });

    expect(screen.queryByTestId('rail-unread-dot')).toBeNull();
  });
});
