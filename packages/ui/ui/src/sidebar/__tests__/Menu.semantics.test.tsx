import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar, type SidebarProps } from '../Sidebar';
import type { SidebarProject, SidebarSession } from '../types';

/**
 * `Menu.keyboard.test.tsx` covers the arrow/Home/End/Escape movement inside an
 * open panel. This file covers what the trigger and the panel have to say
 * about themselves before anyone presses a key, and how the panel is dismissed
 * without one.
 */

const session: SidebarSession = {
  id: 's1',
  title: 'Quarterly revenue model',
  updatedAt: new Date().toISOString(),
};

const projects: SidebarProject[] = [{ id: 'p1', name: 'Atlas' }];

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  return render(
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
      onProjectOpen={vi.fn()}
      onProjectRename={vi.fn()}
      onProjectSettings={vi.fn()}
      onProjectPin={vi.fn()}
      onProjectDelete={vi.fn()}
      onProjectShare={vi.fn()}
      {...overrides}
    />,
  );
}

const rowTrigger = () => screen.getByLabelText('More options for Quarterly revenue model');
const projectTrigger = () => screen.getByLabelText('More options for Atlas');

/**
 * Panel children in DOM order, separators included, so "Delete sits apart from
 * everything above it" is a statement about the rendered panel rather than
 * about the order of two lines in the source.
 */
function panelRows(menu: HTMLElement): string[] {
  return Array.from(menu.children).map((child) =>
    child.getAttribute('role') === 'separator'
      ? '---'
      : (child.textContent?.trim() ?? '').replace(/\s+/g, ' '),
  );
}

describe('a sidebar menu announces itself before it is opened', () => {
  it.each([
    ['conversation row', rowTrigger],
    ['project row', projectTrigger],
  ])('tells a screen reader that the %s trigger opens a menu', (_label, trigger) => {
    renderSidebar();
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('reports the panel as showing while it is open, and closed again afterwards', () => {
    renderSidebar();

    fireEvent.click(rowTrigger());
    expect(rowTrigger().getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(rowTrigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('gives the panel menu semantics and every entry a menu-item role', () => {
    renderSidebar();
    fireEvent.click(rowTrigger());

    const menu = screen.getByRole('menu');
    expect(menu.getAttribute('role')).toBe('menu');

    const interactive = Array.from(menu.querySelectorAll<HTMLElement>('button, a[href]'));
    expect(interactive.length).toBeGreaterThan(0);
    expect(interactive.filter((item) => item.getAttribute('role') !== 'menuitem')).toEqual([]);
  });
});

describe('a sidebar menu can be dismissed without choosing anything', () => {
  it('closes on a pointer press outside it and leaves the conversation alone', () => {
    const onDelete = vi.fn();
    const onArchive = vi.fn();
    renderSidebar({ onDelete, onArchive });

    fireEvent.click(rowTrigger());
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onArchive).not.toHaveBeenCalled();
  });

  it('stays open for a pointer press on its own panel', () => {
    renderSidebar();
    fireEvent.click(rowTrigger());

    fireEvent.pointerDown(screen.getByRole('menu'));

    expect(screen.queryByRole('menu')).toBeTruthy();
  });

  it('hands focus back to the trigger when Escape closes it', () => {
    renderSidebar();
    fireEvent.click(rowTrigger());

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(document.activeElement).toBe(rowTrigger());
  });
});

describe('the one action that cannot be taken back is set apart', () => {
  it('separates Delete from Archive in the conversation row menu', () => {
    renderSidebar();
    fireEvent.click(rowTrigger());

    const rows = panelRows(screen.getByRole('menu'));
    const deleteIndex = rows.indexOf('Delete');

    expect(deleteIndex).toBeGreaterThan(0);
    expect(rows[deleteIndex - 1]).toBe('---');
    expect(rows[deleteIndex - 2]).toBe('Archive');
  });

  it('separates Delete project from the project actions above it', () => {
    renderSidebar();
    fireEvent.click(projectTrigger());

    const rows = panelRows(screen.getByRole('menu'));
    const deleteIndex = rows.indexOf('Delete project');

    expect(deleteIndex).toBeGreaterThan(0);
    expect(rows[deleteIndex - 1]).toBe('---');
  });

  it.each([
    ['conversation', rowTrigger, 'Delete'],
    ['project', projectTrigger, 'Delete project'],
  ])('paints the %s delete entry apart from its neighbours', (_label, trigger, entry) => {
    renderSidebar();
    fireEvent.click(trigger());

    const menu = screen.getByRole('menu');
    const destructive = within(menu).getByRole('menuitem', { name: entry });
    const neighbour = within(menu).getAllByRole('menuitem')[0]!;

    expect(destructive.getAttribute('class')).toContain('text-red-500');
    expect(neighbour.getAttribute('class')).not.toContain('text-red-500');
  });

  /**
   * The row menu hands `onDelete` straight to the host: choosing it must not be
   * the deletion. Both web shells answer it with `useConfirmAction`; what
   * belongs here is that the menu asks rather than acts.
   */
  it('asks the host to delete rather than removing the row itself', () => {
    const onDelete = vi.fn();
    renderSidebar({ onDelete });

    fireEvent.click(rowTrigger());
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith('s1');
    expect(screen.getByText('Quarterly revenue model')).toBeTruthy();
  });
});

describe('every entry in the row menu reaches the host handler it names', () => {
  it.each([
    ['Share', 'onShare'],
    ['Pin', 'onTogglePin'],
    ['Mark as unread', 'onMarkUnread'],
    ['Archive', 'onArchive'],
    ['Delete', 'onDelete'],
  ] as const)('%s calls %s with the conversation id', (label, handler) => {
    const spy = vi.fn();
    renderSidebar({ [handler]: spy } as Partial<SidebarProps>);

    fireEvent.click(rowTrigger());
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: label }));

    expect(spy).toHaveBeenCalledWith('s1');
  });

  it('moves the conversation into the project the flyout names', () => {
    const onMoveToProject = vi.fn();
    renderSidebar({ onMoveToProject });

    fireEvent.click(rowTrigger());
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to project/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Atlas' }));

    expect(onMoveToProject).toHaveBeenCalledWith('s1', 'p1');
  });
});
