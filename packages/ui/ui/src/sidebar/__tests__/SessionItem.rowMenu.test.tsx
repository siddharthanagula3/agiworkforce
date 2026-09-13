import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Sidebar, type SidebarProps } from '../Sidebar';
import type { SidebarProject, SidebarSession } from '../types';

/**
 * Slice E item 2: the chat row menu must carry Share, Rename, then Pin,
 * Mark as unread, Archive, Delete, then Move to project last as a flyout
 * (both leaders), with Star and Copy link dropped (Claude's mark-as-unread
 * kept) and no inline per-project list (which grew the panel past the
 * viewport and broke its own anchoring).
 * `Menu.keyboard.test.tsx` already covers the arrow/Home/End/Escape contract
 * every `role="menu"` panel inherits from the shared `Menu` primitive; this
 * file only checks this menu's own entries, order, and the submenu.
 */

const session: SidebarSession = {
  id: 's1',
  title: 'Repository structure overview',
  updatedAt: new Date().toISOString(),
};

const projects: SidebarProject[] = [
  { id: 'p1', name: 'agiworkforce' },
  { id: 'p2', name: 'Marketing launch' },
];

function renderRowMenu(overrides: Partial<SidebarProps> = {}) {
  render(
    <Sidebar
      sessions={[session]}
      projects={projects}
      onNewChat={vi.fn()}
      onOpenSearch={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onTogglePin={vi.fn()}
      onArchive={vi.fn()}
      onShare={vi.fn()}
      onMarkUnread={vi.fn()}
      onMoveToProject={vi.fn()}
      getSessionHref={(s) => `/chat/${s.id}`}
      {...overrides}
    />,
  );
  fireEvent.click(screen.getByLabelText('More options for Repository structure overview'));
  return screen.getByRole('menu');
}

function itemLabels(menu: HTMLElement): string[] {
  return within(menu)
    .getAllByRole('menuitem')
    .map((el) => el.textContent?.trim() ?? '');
}

describe('chat row menu (Sidebar > SessionItem)', () => {
  it('lists Share, Rename, Pin, Mark as unread, Archive, Delete, Move to project in that order', () => {
    const menu = renderRowMenu();
    expect(itemLabels(menu)).toEqual([
      'Share',
      'Rename',
      'Pin',
      'Mark as unread',
      'Archive',
      'Delete',
      'Move to project',
    ]);
  });

  it('never shows Star or Copy link', () => {
    const menu = renderRowMenu();
    expect(itemLabels(menu)).not.toContain('Star');
    expect(itemLabels(menu)).not.toContain('Copy link');
  });

  it('calls onMarkUnread with the session id', () => {
    const onMarkUnread = vi.fn();
    const menu = renderRowMenu({ onMarkUnread });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Mark as unread' }));
    expect(onMarkUnread).toHaveBeenCalledWith('s1');
  });

  it('shows Mark as read once the session is unread', () => {
    const menu = renderRowMenu({ sessions: [{ ...session, unread: true }] });
    expect(within(menu).getByRole('menuitem', { name: 'Mark as read' })).toBeTruthy();
  });

  it('keeps the panel to a fixed set of rows regardless of project count', () => {
    const manyProjects = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      name: `Project ${i}`,
    }));
    const menu = renderRowMenu({ projects: manyProjects });
    expect(itemLabels(menu)).toEqual([
      'Share',
      'Rename',
      'Pin',
      'Mark as unread',
      'Archive',
      'Delete',
      'Move to project',
    ]);
  });

  it('opens the Move to project flyout on click and lists the projects there, not inline', () => {
    const onMoveToProject = vi.fn();
    const menu = renderRowMenu({ onMoveToProject });

    expect(within(menu).queryByRole('menuitem', { name: 'agiworkforce' })).toBeNull();

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move to project' }));
    const submenu = screen.getByRole('menu', { name: 'Move to project' });
    fireEvent.click(within(submenu).getByRole('menuitem', { name: 'agiworkforce' }));

    expect(onMoveToProject).toHaveBeenCalledWith('s1', 'p1');
  });

  it('omits Move to project entirely when there are no projects', () => {
    const menu = renderRowMenu({ projects: [] });
    expect(itemLabels(menu)).not.toContain('Move to project');
  });

  it('names each row trigger for its own conversation', () => {
    render(
      <Sidebar
        sessions={[session, { ...session, id: 's2', title: 'Launch checklist' }]}
        projects={projects}
        onNewChat={vi.fn()}
        onOpenSearch={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        getSessionHref={(s) => `/chat/${s.id}`}
      />,
    );
    expect(screen.getByLabelText('More options for Repository structure overview')).toBeTruthy();
    expect(screen.getByLabelText('More options for Launch checklist')).toBeTruthy();
    expect(screen.queryByLabelText('Conversation actions')).toBeNull();
  });

  it('offers Restore instead of Archive once the conversation is archived', () => {
    render(
      <Sidebar
        sessions={[{ ...session, archived: true }]}
        projects={projects}
        onNewChat={vi.fn()}
        onOpenSearch={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onArchive={vi.fn()}
        onRestore={vi.fn()}
        getSessionHref={(s) => `/chat/${s.id}`}
      />,
    );
    fireEvent.click(screen.getByLabelText('Archived (1)'));
    fireEvent.click(screen.getByLabelText('More options for Repository structure overview'));
    const labels = itemLabels(screen.getByRole('menu'));
    expect(labels).toContain('Restore');
    expect(labels).not.toContain('Archive');
  });

  it('hands focus back to the row trigger when a menu item is chosen', () => {
    // The panel unmounts with focus inside it, so without this the reader lands
    // on <body>, and anything the selection opens records <body> as its opener.
    const menu = renderRowMenu();
    const trigger = screen.getByLabelText('More options for Repository structure overview');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Pin' }));
    expect(document.activeElement).toBe(trigger);
  });
});
