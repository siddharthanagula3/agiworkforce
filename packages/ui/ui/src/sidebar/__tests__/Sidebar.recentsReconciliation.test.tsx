import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar, type SidebarProps } from '../Sidebar';
import type { SidebarSession } from '../types';

/**
 * Recents is a view over the list its host holds, never a second copy of it.
 * `Sidebar.loadMore` owns the paging control and `Sidebar.loadFailure` owns the
 * failure and retry card; what this file fixes is the other half, that every
 * change the host makes to a conversation reaches the row without a refetch,
 * and that a refresh behind an already-drawn list never replaces it with
 * placeholders.
 */

const now = new Date();
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

const loaded: SidebarSession[] = [
  { id: 's1', title: 'Quarterly revenue model', updatedAt: minutesAgo(10) },
  { id: 's2', title: 'Hiring plan', updatedAt: minutesAgo(20) },
];

function renderRecents(overrides: Partial<SidebarProps> = {}) {
  const props: SidebarProps = {
    sessions: loaded,
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

const skeleton = () => screen.queryByRole('status', { name: 'Loading conversations' });
const titles = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-session-index]'))
    .map((row) => row.querySelector<HTMLElement>('a, button')?.textContent?.trim() ?? '')
    .filter(Boolean);

describe('the first page of history', () => {
  it('draws placeholder rows while the account has nothing loaded yet', () => {
    renderRecents({ sessions: [], isLoading: true });

    const placeholder = skeleton();
    expect(placeholder).toBeTruthy();
    expect(placeholder!.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('No conversations yet')).toBeNull();
  });

  it('replaces the placeholders with the rows once the page arrives', () => {
    const { update } = renderRecents({ sessions: [], isLoading: true });

    update({ sessions: loaded, isLoading: false });

    expect(skeleton()).toBeNull();
    expect(screen.getByText('Quarterly revenue model')).toBeTruthy();
    expect(screen.getByText('Hiring plan')).toBeTruthy();
  });
});

describe('a refresh behind an already drawn list', () => {
  it('keeps the rows on screen instead of swapping them for placeholders', () => {
    const { update } = renderRecents();

    update({ isLoading: true });

    expect(skeleton()).toBeNull();
    expect(screen.getByText('Quarterly revenue model')).toBeTruthy();
  });

  it('keeps the rows when a refresh behind them fails outright', () => {
    const { update } = renderRecents();

    update({ isLoading: false, error: 'Too many requests' });

    expect(screen.getByText('Quarterly revenue model')).toBeTruthy();
    expect(screen.queryByText("Couldn't load conversations")).toBeNull();
  });
});

describe('what the host does to a conversation reaches its row', () => {
  it('shows a newly created chat at the head of the list without waiting for a reload', () => {
    const { update } = renderRecents();

    update({
      sessions: [{ id: 's3', title: 'Untitled', updatedAt: now.toISOString() }, ...loaded],
    });

    expect(titles()[0]).toBe('Untitled');
    expect(titles()).toHaveLength(3);
  });

  it('carries a rename the server settled on, not the text that was typed', () => {
    const { update } = renderRecents();

    update({
      sessions: [{ ...loaded[0]!, title: 'Revenue model FY26' }, loaded[1]!],
    });

    expect(screen.queryByText('Quarterly revenue model')).toBeNull();
    expect(screen.getByText('Revenue model FY26')).toBeTruthy();
  });

  it('drops a deleted conversation and keeps the rest of the page', () => {
    const { update } = renderRecents();

    update({ sessions: [loaded[1]!] });

    expect(screen.queryByText('Quarterly revenue model')).toBeNull();
    expect(screen.getByText('Hiring plan')).toBeTruthy();
  });

  it('moves an archived conversation out of the active list and into the archived view', () => {
    const { update } = renderRecents();

    update({ sessions: [{ ...loaded[0]!, archived: true }, loaded[1]!] });
    expect(screen.queryByText('Quarterly revenue model')).toBeNull();
    expect(screen.getByLabelText('Archived (1)')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Archived (1)'));
    expect(screen.getByText('Quarterly revenue model')).toBeTruthy();
    expect(screen.queryByText('Hiring plan')).toBeNull();
  });

  it('moves a pinned conversation into the pinned group and back out again', () => {
    const { update } = renderRecents();

    update({ sessions: [loaded[0]!, { ...loaded[1]!, pinned: true }] });
    expect(titles()[0]).toBe('Hiring plan');

    update({ sessions: loaded });
    expect(titles()[0]).toBe('Quarterly revenue model');
  });

  it('never keeps a row the host has stopped sending', () => {
    const { update } = renderRecents();

    update({ sessions: [] });

    expect(titles()).toEqual([]);
    expect(screen.getByText('No conversations yet')).toBeTruthy();
  });
});
