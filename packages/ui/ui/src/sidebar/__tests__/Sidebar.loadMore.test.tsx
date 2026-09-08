import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../Sidebar';
import type { SidebarSession } from '../types';

const SHOW_MORE = 'Show more';
const LOADING_MORE = 'Loading conversations';

const loadedSessions: SidebarSession[] = [
  { id: 'a', title: 'Release notes', updatedAt: new Date().toISOString() },
  { id: 'b', title: 'Design review', updatedAt: new Date().toISOString() },
];

function renderSidebar(overrides: {
  sessions?: SidebarSession[];
  hasMoreSessions?: boolean;
  isLoadingMoreSessions?: boolean;
  onLoadMoreSessions?: () => void;
}) {
  render(
    <Sidebar
      sessions={overrides.sessions ?? loadedSessions}
      projects={[]}
      hasMoreSessions={overrides.hasMoreSessions ?? false}
      isLoadingMoreSessions={overrides.isLoadingMoreSessions ?? false}
      {...(overrides.onLoadMoreSessions
        ? { onLoadMoreSessions: overrides.onLoadMoreSessions }
        : {})}
      onNewChat={vi.fn()}
      onOpenSearch={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onTogglePin={vi.fn()}
    />,
  );
}

describe('WEB-WEB-CHAT-PAGE-SIDEBAR-RECENTS-LIST-HARD-01', () => {
  it('offers the next page when the host reports more history behind the loaded one', async () => {
    const onLoadMoreSessions = vi.fn();
    renderSidebar({ hasMoreSessions: true, onLoadMoreSessions });

    await userEvent.click(screen.getByRole('button', { name: SHOW_MORE }));

    expect(onLoadMoreSessions).toHaveBeenCalledTimes(1);
  });

  it('stays out of the way when the loaded list is the whole history', () => {
    renderSidebar({ hasMoreSessions: false, onLoadMoreSessions: vi.fn() });

    expect(screen.queryByRole('button', { name: SHOW_MORE })).toBeNull();
  });

  it('never renders for a host that does not page', () => {
    renderSidebar({ hasMoreSessions: true });

    expect(screen.queryByRole('button', { name: SHOW_MORE })).toBeNull();
  });

  it('says the page is on its way and refuses a second request while it is', async () => {
    const onLoadMoreSessions = vi.fn();
    renderSidebar({
      hasMoreSessions: true,
      isLoadingMoreSessions: true,
      onLoadMoreSessions,
    });

    const control = screen.getByRole('button', { name: new RegExp(LOADING_MORE, 'i') });
    expect((control as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(control);
    expect(onLoadMoreSessions).not.toHaveBeenCalled();
  });

  it('does not offer more history under an empty list, where the page would be the first', () => {
    renderSidebar({ sessions: [], hasMoreSessions: true, onLoadMoreSessions: vi.fn() });

    expect(screen.queryByRole('button', { name: SHOW_MORE })).toBeNull();
  });
});
