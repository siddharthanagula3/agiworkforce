import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Sidebar, type SidebarProps } from '../Sidebar';
import type { SidebarSession } from '../types';

afterEach(() => {
  cleanup();
});

const sessions: SidebarSession[] = [
  { id: 's1', title: 'Quarterly plan', updatedAt: new Date().toISOString() },
];

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  return render(
    <Sidebar
      sessions={sessions}
      onNewChat={vi.fn()}
      onOpenSearch={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      {...overrides}
    />,
  );
}

describe('sidebar Recents header', () => {
  it('labels the conversation list Recents', () => {
    renderSidebar();
    expect(screen.getByRole('heading', { name: 'Recents' })).toBeTruthy();
    expect(screen.queryByText('Chats')).toBeNull();
  });

  it('links to the full chats and tasks list and routes a plain click through the host', () => {
    const onOpenAllChats = vi.fn();
    renderSidebar({ onOpenAllChats, allChatsHref: '/chat/chats' });

    const link = screen.getByRole('link', { name: 'View all chats and tasks' });
    expect(link.getAttribute('href')).toBe('/chat/chats');
    expect(link.textContent).toBe('View all');
    expect(link.closest('[data-sidebar-region="recents-header"]')).not.toBeNull();

    fireEvent.click(link);
    expect(onOpenAllChats).toHaveBeenCalledTimes(1);
  });

  it('leaves a modified click to the browser so the list can open in a new tab', () => {
    const onOpenAllChats = vi.fn();
    renderSidebar({ onOpenAllChats, allChatsHref: '/chat/chats' });

    const link = screen.getByRole('link', { name: 'View all chats and tasks' });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    link.dispatchEvent(event);

    expect(onOpenAllChats).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('renders no link when the host has no chats page', () => {
    renderSidebar();
    expect(screen.queryByRole('link', { name: 'View all chats and tasks' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'View all chats and tasks' })).toBeNull();
  });
});
