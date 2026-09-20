import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar, type SidebarProps } from '../Sidebar';
import type { SidebarProject, SidebarSession } from '../types';

/**
 * What one row in Recents has to be able to say about its conversation:
 * which one it is, which project it belongs to, whether it is the one on
 * screen, whether it is pinned, starred, unread or still running, and how to
 * reach its actions. `Sidebar.runState` and `Sidebar.agiWorkBadge` own the two
 * markers they are named for; this file covers the rest of the row's states.
 */

const now = new Date().toISOString();

const projects: SidebarProject[] = [{ id: 'p1', name: 'Atlas' }];

const base: SidebarSession = { id: 's1', title: 'Quarterly revenue model', updatedAt: now };

function renderRow(session: Partial<SidebarSession> = {}, overrides: Partial<SidebarProps> = {}) {
  const merged = { ...base, ...session };
  const utils = render(
    <Sidebar
      sessions={[merged]}
      projects={projects}
      activeSessionId={overrides.activeSessionId}
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
  return { ...utils, session: merged };
}

const rowLink = () => screen.getByRole('link', { name: /Quarterly revenue model|Atlas/ });

function openRowMenu(name = 'More options for Quarterly revenue model'): HTMLElement {
  fireEvent.click(screen.getByLabelText(name));
  return screen.getByRole('menu');
}

const itemLabels = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent?.trim() ?? '');

describe('a Recents row says which conversation it is', () => {
  it('shows the title, and a named placeholder rather than an empty row', () => {
    const { unmount } = renderRow();
    expect(screen.getByText('Quarterly revenue model')).toBeTruthy();
    unmount();

    renderRow({ title: '' });
    expect(screen.getByText('Untitled')).toBeTruthy();
  });

  it('names the project the conversation sits in, on the row itself', () => {
    const { container } = renderRow({ projectId: 'p1' }, { onProjectOpen: undefined });
    const row = container.querySelector('a[href="/chat/s1"]') as HTMLAnchorElement;
    expect(row.getAttribute('title')).toBe('Quarterly revenue model (in Atlas)');
  });

  it('leaves the project note off a conversation that belongs to none', () => {
    renderRow();
    expect(rowLink().getAttribute('title')).toBe('Quarterly revenue model');
  });

  it('marks the conversation on screen as the current page, not by colour alone', () => {
    const { container } = renderRow({}, { activeSessionId: 's1' });
    const row = rowLink();

    expect(row.getAttribute('aria-current')).toBe('page');
    const shell = container.querySelector('[data-sidebar-session-index]')
      ?.firstElementChild as HTMLElement;
    expect(shell.getAttribute('class')).toContain('bg-[hsl(var(--accent))]');
  });

  it('leaves a conversation that is not on screen unmarked', () => {
    renderRow({}, { activeSessionId: 'another' });
    expect(rowLink().getAttribute('aria-current')).toBeNull();
  });
});

describe('a Recents row says what has been done to the conversation', () => {
  it('draws a starred conversation with its mark and an unstarred one without', () => {
    const { container, unmount } = renderRow({ starred: true });
    expect(container.querySelector('.fill-amber-400')).toBeTruthy();
    unmount();

    const plain = renderRow();
    expect(plain.container.querySelector('.fill-amber-400')).toBeNull();
  });

  it('offers Unpin on a pinned conversation and Pin on one that is not', () => {
    const { unmount } = renderRow({ pinned: true });
    expect(itemLabels(openRowMenu())).toContain('Unpin');
    unmount();

    renderRow();
    expect(itemLabels(openRowMenu())).toContain('Pin');
  });

  it('weights an unread title more heavily and offers to mark it read again', () => {
    const { unmount } = renderRow({ unread: true });
    expect(screen.getByText('Quarterly revenue model').getAttribute('class')).toContain(
      'font-semibold',
    );
    expect(itemLabels(openRowMenu())).toContain('Mark as read');
    unmount();

    renderRow();
    expect(screen.getByText('Quarterly revenue model').getAttribute('class')).toContain(
      'font-medium',
    );
    expect(itemLabels(openRowMenu())).toContain('Mark as unread');
  });

  it('says a turn is still running in words, not only with a moving dot', () => {
    renderRow({ runState: 'running' });
    const marker = screen.getByTestId('session-running-s1');
    expect(within(marker).getByText('Running').getAttribute('class')).toContain('sr-only');
  });

  it('gives every row its own actions trigger, named for that conversation', () => {
    renderRow();
    const trigger = screen.getByLabelText('More options for Quarterly revenue model');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
  });
});

describe('a Recents row can be renamed in place', () => {
  it('replaces the row with a focused, pre-selected field and keeps the old title until it is submitted', () => {
    const onRename = vi.fn();
    renderRow({}, { onRename });

    fireEvent.click(within(openRowMenu()).getByRole('menuitem', { name: 'Rename' }));

    const field = screen.getByDisplayValue('Quarterly revenue model') as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect(screen.queryByRole('link')).toBeNull();
    expect(onRename).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: 'Revenue model v2' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledWith('s1', 'Revenue model v2');
  });

  it('does not ask the host to rename a conversation to what it is already called', () => {
    const onRename = vi.fn();
    renderRow({}, { onRename });

    fireEvent.click(within(openRowMenu()).getByRole('menuitem', { name: 'Rename' }));
    fireEvent.keyDown(screen.getByDisplayValue('Quarterly revenue model'), { key: 'Enter' });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText('Quarterly revenue model')).toBeTruthy();
  });
});
