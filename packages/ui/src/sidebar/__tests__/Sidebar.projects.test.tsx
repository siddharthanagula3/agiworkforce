import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar, type SidebarProps } from '../Sidebar';
import type { SidebarProject, SidebarSession } from '../types';

/**
 * Projects-section behavior (founder spec 2026-07-10, ChatGPT hover pattern):
 *   - header "+" / "…" hidden at rest, revealed on hover AND focus-within
 *   - project-row compose / "…" hidden at rest, revealed on hover/focus-within
 *   - row click expands inline: indented chats, "Show more", open-folder icon
 *
 * jsdom has no CSS engine, so hover/focus reveal is asserted via the
 * Tailwind class contract (opacity-0 + group-hover/group-focus-within
 * reveal classes on the action containers).
 */

const projects: SidebarProject[] = [
  { id: 'p1', name: 'Website Redesign' },
  { id: 'p2', name: 'Mobile App' },
];

const sessions: SidebarSession[] = [
  ...Array.from({ length: 7 }, (_, i) => ({
    id: `s${i}`,
    title: `Chat ${i}`,
    projectId: 'p1',
    updatedAt: new Date(2026, 5, 20 + (i % 5)).toISOString(),
  })),
  { id: 'loose', title: 'Loose chat', updatedAt: new Date().toISOString() },
];

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  return render(
    <Sidebar
      sessions={sessions}
      projects={projects}
      onNewChat={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onTogglePin={vi.fn()}
      onProjectOpen={vi.fn()}
      onProjectNewChat={vi.fn()}
      onProjectRename={vi.fn()}
      onProjectDelete={vi.fn()}
      onProjectCreate={vi.fn()}
      {...overrides}
    />,
  );
}

function revealContract(el: HTMLElement, group: string) {
  const cls = el.className;
  expect(cls).toContain('opacity-0');
  expect(cls).toContain(`group-hover/${group}:opacity-100`);
  expect(cls).toContain(`group-focus-within/${group}:opacity-100`);
}

describe('Sidebar projects section (hover pattern)', () => {
  it('hides the header "+" and "…" at rest, revealing on hover/focus-within', () => {
    renderSidebar();

    const newProject = screen.getByRole('button', { name: 'New project' });
    const organize = screen.getByRole('button', { name: 'Organize chats' });
    // Both live in the same hover-revealed container on the header row.
    const container = newProject.parentElement as HTMLElement;
    expect(container.contains(organize.parentElement as HTMLElement)).toBe(true);
    revealContract(container, 'projhdr');

    // The header row itself is the hover group.
    const headerRow = container.closest('.group\\/projhdr');
    expect(headerRow).not.toBeNull();
  });

  it('hides project-row compose and "…" at rest, revealing on hover/focus-within', () => {
    renderSidebar();

    const compose = screen.getByRole('button', { name: 'New chat in Website Redesign' });
    const more = screen.getByRole('button', { name: 'More options for Website Redesign' });
    const container = compose.parentElement as HTMLElement;
    expect(container.contains(more.parentElement as HTMLElement)).toBe(true);
    revealContract(container, 'projrow');

    const row = container.closest('.group\\/projrow');
    expect(row).not.toBeNull();
  });

  it('keeps header actions functional: "+" creates a project', () => {
    const onProjectCreate = vi.fn();
    renderSidebar({ onProjectCreate });
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(onProjectCreate).toHaveBeenCalledTimes(1);
  });

  it('expands a project inline on click: indented chats + Show more, collapses on second click', () => {
    renderSidebar();

    const expand = screen.getByRole('button', { name: 'Expand project Website Redesign' });
    expect(expand.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(expand);

    // Expanded: aria state flips and the row is now labeled Collapse.
    const collapse = screen.getByRole('button', { name: 'Collapse project Website Redesign' });
    expect(collapse.getAttribute('aria-expanded')).toBe('true');

    // Its chats render inline (most recent first, limit 5) with a Show more
    // control at the end. Chat 4 is the newest; Chat 0 is beyond the limit.
    expect(screen.getByText('Chat 4')).toBeTruthy();
    expect(screen.queryByText('Chat 0')).toBeNull();
    const showMore = screen.getByRole('button', { name: 'Show more' });
    expect(showMore).toBeTruthy();

    // Show more reveals the remaining chats and turns into Show less.
    fireEvent.click(showMore);
    expect(screen.getByText('Chat 0')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();

    // Second click on the row collapses the list again.
    fireEvent.click(screen.getByRole('button', { name: 'Collapse project Website Redesign' }));
    expect(
      screen
        .getByRole('button', { name: 'Expand project Website Redesign' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
    expect(screen.queryByText('Chat 0')).toBeNull();
  });

  it('opens a chat from the expanded project list', () => {
    const onSelect = vi.fn();
    renderSidebar({ onSelect });
    fireEvent.click(screen.getByRole('button', { name: 'Expand project Website Redesign' }));
    fireEvent.click(screen.getByText('Chat 4'));
    expect(onSelect).toHaveBeenCalledWith('s4');
  });

  it('keeps navigation to the project page via the row menu', () => {
    const onProjectOpen = vi.fn();
    renderSidebar({ onProjectOpen });
    fireEvent.click(screen.getByRole('button', { name: 'More options for Website Redesign' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Project home' }));
    expect(onProjectOpen).toHaveBeenCalledWith('p1');
  });
});
