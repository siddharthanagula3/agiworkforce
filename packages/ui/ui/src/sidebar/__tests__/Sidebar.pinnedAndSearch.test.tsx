import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar, type SidebarProps } from '../Sidebar';
import type { SidebarProject, SidebarSession } from '../types';

/**
 * Pinned content, the Projects section and the Search entry. `Sidebar.projects`
 * owns the hover pattern and the inline expansion; `Sidebar.searchShortcut`
 * owns the binding badge. What is here is the rest: which rows are pinned and
 * in what order, what happens to a pinned conversation that is archived or
 * deleted, that no list silently caps itself, that the rail carries no state
 * from one account to the next, and that opening Search does not take the
 * conversation on screen away with it.
 */

const now = new Date();
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  const props: SidebarProps = {
    sessions: [],
    onNewChat: vi.fn(),
    onOpenSearch: vi.fn(),
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onTogglePin: vi.fn(),
    onArchive: vi.fn(),
    ...overrides,
  };
  const utils = render(<Sidebar {...props} />);
  return {
    ...utils,
    update: (next: Partial<SidebarProps>) => utils.rerender(<Sidebar {...props} {...next} />),
  };
}

const projectHandlers = {
  onProjectOpen: vi.fn(),
  onProjectNewChat: vi.fn(),
  onProjectRename: vi.fn(),
  onProjectSettings: vi.fn(),
  onProjectShare: vi.fn(),
  onProjectPin: vi.fn(),
  onProjectDelete: vi.fn(),
  onProjectCreate: vi.fn(),
};

/** Rows under the pinned heading, in the order they are painted. */
function pinnedTitles(): string[] {
  const heading = screen
    .getAllByText('Pinned')
    .find(
      (element) => element.parentElement?.querySelector('[data-sidebar-session-index]') != null,
    );
  if (!heading) return [];
  const group = heading.parentElement as HTMLElement;
  return Array.from(group.querySelectorAll<HTMLElement>('[data-sidebar-session-index]')).map(
    (row) => row.querySelector<HTMLElement>('a, button')?.textContent?.trim() ?? '',
  );
}

const allRowTitles = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-session-index]'))
    .map((row) => row.querySelector<HTMLElement>('a, button')?.textContent?.trim() ?? '')
    .filter(Boolean);

describe('pinned conversations', () => {
  const pinnedSessions: SidebarSession[] = [
    { id: 'p-old', title: 'Older pin', updatedAt: minutesAgo(90), pinned: true },
    { id: 'p-new', title: 'Newer pin', updatedAt: minutesAgo(5), pinned: true },
    { id: 'plain', title: 'Unpinned thread', updatedAt: minutesAgo(1) },
  ];

  it('lifts them out of the temporal groups into their own section', () => {
    renderSidebar({ sessions: pinnedSessions });

    expect(pinnedTitles()).toEqual(['Newer pin', 'Older pin']);
    expect(allRowTitles()).toContain('Unpinned thread');
  });

  it('orders them the same way every time it is asked', () => {
    const { update } = renderSidebar({ sessions: pinnedSessions });
    const first = pinnedTitles();

    update({ sessions: [...pinnedSessions].reverse() });

    expect(pinnedTitles()).toEqual(first);
  });

  it('keeps the pin where the host put it across a fresh mount, holding none of its own', () => {
    const { unmount } = renderSidebar({ sessions: pinnedSessions });
    expect(pinnedTitles()).toEqual(['Newer pin', 'Older pin']);
    unmount();

    renderSidebar({ sessions: pinnedSessions });
    expect(pinnedTitles()).toEqual(['Newer pin', 'Older pin']);
  });

  it('caps nothing: every pinned conversation the host sends is drawn', () => {
    const many = Array.from({ length: 24 }, (_, index) => ({
      id: `pin-${index}`,
      title: `Pinned ${index}`,
      updatedAt: minutesAgo(index),
      pinned: true,
    }));

    renderSidebar({ sessions: many });

    expect(pinnedTitles()).toHaveLength(24);
  });

  it('shows an archived pin in the archived view only, never beside the active chats', () => {
    renderSidebar({
      sessions: [
        {
          id: 'a1',
          title: 'Archived pin',
          updatedAt: minutesAgo(30),
          pinned: true,
          archived: true,
        },
        { id: 'a2', title: 'Active thread', updatedAt: minutesAgo(2) },
      ],
    });

    expect(allRowTitles()).toEqual(['Active thread']);

    fireEvent.click(screen.getByLabelText('Archived (1)'));

    expect(pinnedTitles()).toEqual(['Archived pin']);
    expect(allRowTitles()).not.toContain('Active thread');
  });

  it('loses the pinned row once the host stops sending the conversation', () => {
    const { update } = renderSidebar({ sessions: pinnedSessions });

    update({ sessions: pinnedSessions.filter((session) => session.id !== 'p-new') });

    expect(pinnedTitles()).toEqual(['Older pin']);
  });

  /**
   * Nothing here may outlive the account that produced it. A module-level cache
   * would survive the unmount and leak one workspace's history into the next.
   */
  it('carries no conversation from one account to the next', () => {
    const { unmount } = renderSidebar({
      sessions: [{ id: 'w1', title: 'Workspace one thread', updatedAt: minutesAgo(3) }],
    });
    expect(allRowTitles()).toEqual(['Workspace one thread']);
    unmount();
    cleanup();

    renderSidebar({
      sessions: [{ id: 'w2', title: 'Workspace two thread', updatedAt: minutesAgo(3) }],
    });

    expect(allRowTitles()).toEqual(['Workspace two thread']);
  });
});

describe('the Projects section', () => {
  const projects: SidebarProject[] = [
    { id: 'pinned-1', name: 'Atlas', pinned: true },
    ...Array.from({ length: 7 }, (_, index) => ({
      id: `p-${index}`,
      name: `Project ${index}`,
    })),
  ];

  it('heads the section, names the create action and pins what the host pinned', () => {
    renderSidebar({ projects, ...projectHandlers });

    expect(screen.getAllByText('Projects').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('New project')).toBeTruthy();
    expect(screen.getAllByText('Pinned').length).toBeGreaterThan(0);
    expect(screen.getByText('Atlas')).toBeTruthy();
  });

  it('asks the host to create a project rather than inventing one', () => {
    const onProjectCreate = vi.fn();
    renderSidebar({ projects, ...projectHandlers, onProjectCreate });

    fireEvent.click(screen.getByLabelText('New project'));

    expect(onProjectCreate).toHaveBeenCalledTimes(1);
  });

  it('collapses the whole section and brings it back', () => {
    renderSidebar({ projects, ...projectHandlers });

    fireEvent.click(screen.getByLabelText('Collapse projects'));
    expect(screen.queryByText('Atlas')).toBeNull();

    fireEvent.click(screen.getByLabelText('Expand projects'));
    expect(screen.getByText('Atlas')).toBeTruthy();
  });

  /**
   * The short list is a disclosure, not a cap: every project stays reachable
   * without leaving the rail.
   */
  it('shows a first few and reaches the rest through Show more', () => {
    renderSidebar({ projects, ...projectHandlers });

    expect(screen.queryByText('Project 6')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(screen.getByText('Project 6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText('Project 6')).toBeNull();
  });

  it('gives a project row the actions its menu promises', () => {
    renderSidebar({ projects, ...projectHandlers });

    fireEvent.click(screen.getByLabelText('More options for Atlas'));

    const entries = within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .map((item) => item.textContent?.trim());

    expect(entries).toEqual([
      'Share project',
      'Rename project',
      'Project settings',
      'Project home',
      'Unpin project',
      'Delete project',
    ]);
  });
});

describe('the Search entry', () => {
  const sessions: SidebarSession[] = [
    { id: 's1', title: 'Quarterly revenue model', updatedAt: minutesAgo(4) },
  ];

  it('carries an icon and a name a screen reader can read', () => {
    const { container } = renderSidebar({ sessions });
    const header = container.querySelector('[data-sidebar-region="header"]') as HTMLElement;
    const search = within(header).getByRole('button', { name: /Search/ });

    expect(search.querySelector('svg')).toBeTruthy();
    expect(search.textContent).toContain('Search');
  });

  /**
   * Search is an overlay the host opens over the conversation, not a
   * destination. A link here would be a navigation, and a navigation would take
   * the open conversation with it.
   */
  it('asks the host to open search without navigating away from the conversation', () => {
    const onOpenSearch = vi.fn();
    const onSelect = vi.fn();
    const { container } = renderSidebar({
      sessions,
      activeSessionId: 's1',
      onOpenSearch,
      onSelect,
    });
    const header = container.querySelector('[data-sidebar-region="header"]') as HTMLElement;
    const search = within(header).getByRole('button', { name: /Search/ });

    expect(search.tagName).toBe('BUTTON');
    expect(search.getAttribute('href')).toBeNull();

    fireEvent.click(search);

    expect(onOpenSearch).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText('Quarterly revenue model')).toBeTruthy();
    expect(
      document.querySelector('[data-sidebar-session-index] [aria-current="page"]'),
    ).toBeTruthy();
  });

  it('offers the same entry from the collapsed rail', () => {
    const onOpenSearch = vi.fn();
    const { container } = renderSidebar({ collapsed: true, onOpenSearch });
    const rail = container.querySelector('[data-sidebar-region="rail"]') as HTMLElement;

    fireEvent.click(within(rail).getByRole('button', { name: 'Search' }));

    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });
});
