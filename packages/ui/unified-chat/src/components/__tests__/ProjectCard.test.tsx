import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectCard } from '../ProjectCard';
import { useProjectStore } from '../../stores/projectStore';
import type { Project } from '../../lib/types';

const PROJECT: Project = {
  id: 'proj_card_1',
  name: 'Design System',
  description: 'Shared tokens',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  starred: false,
  conversationIds: [],
};

beforeEach(() => {
  useProjectStore.setState({ projects: [{ ...PROJECT }], activeProjectId: null });
});

describe('ProjectCard, valid HTML nesting', () => {
  it('does not render a <button> nested inside another <button>', () => {
    const { container } = render(<ProjectCard project={PROJECT} onDelete={vi.fn()} />);
    const nested = container.querySelectorAll('button button');
    expect(nested.length).toBe(0);
  });

  /**
   * The previous fix for nested <button> markup made the card a
   * `div role="button"` wrapping the star and menu buttons. That satisfies an
   * HTML validator but is the same defect to assistive tech, a control cannot
   * contain controls, and axe reports nested-interactive on the live page. The
   * open action is now a sibling stretched over the card instead.
   */
  it('never makes the open control an ancestor of the other controls', () => {
    render(<ProjectCard project={PROJECT} onDelete={vi.fn()} onEdit={vi.fn()} />);
    const open = screen.getByRole('button', { name: /open project design system/i });
    const others = screen.getAllByRole('button').filter((element) => element !== open);

    expect(others.length).toBeGreaterThan(0);
    for (const other of others) {
      expect(open.contains(other)).toBe(false);
    }
  });

  it('gives the open action a real button so keyboard activation is native', () => {
    render(<ProjectCard project={PROJECT} />);
    const open = screen.getByRole('button', { name: /open project design system/i });
    expect(open.tagName).toBe('BUTTON');
    expect(open.getAttribute('tabindex')).toBeNull();
  });
});

describe('ProjectCard, independent click handlers', () => {
  it('renders the canonical server conversation count when ids are not loaded', () => {
    render(
      <ProjectCard project={{ ...PROJECT, conversationIds: undefined, conversationCount: 2 }} />,
    );

    expect(screen.getByText('2 conversations')).toBeTruthy();
  });

  it('opens the project when the card body is clicked', () => {
    const onSelect = vi.fn();
    render(<ProjectCard project={PROJECT} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /open project design system/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(PROJECT);
  });

  it('opens the project from the keyboard without a hand-rolled key handler', () => {
    const onSelect = vi.fn();
    render(<ProjectCard project={PROJECT} onSelect={onSelect} />);
    const open = screen.getByRole('button', { name: /open project design system/i });

    // A native button turns Enter and Space into click itself; jsdom models that
    // through the click, which is the behaviour a real browser produces.
    open.focus();
    expect(document.activeElement).toBe(open);
    fireEvent.click(open);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('toggles the star WITHOUT opening the project (stopPropagation preserved)', () => {
    const onSelect = vi.fn();
    render(<ProjectCard project={PROJECT} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /star project/i }));

    expect(useProjectStore.getState().projects[0]!.starred).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('ProjectCard, archive/unarchive menu', () => {
  it('shows Archive for an active project and calls onArchive', () => {
    const onArchive = vi.fn();
    render(<ProjectCard project={PROJECT} onArchive={onArchive} onUnarchive={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Project options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalledWith(PROJECT);
  });

  it('shows Unarchive for an archived project and calls onUnarchive', () => {
    const archived = { ...PROJECT, isArchived: true };
    const onUnarchive = vi.fn();
    render(<ProjectCard project={archived} onArchive={vi.fn()} onUnarchive={onUnarchive} />);
    fireEvent.click(screen.getByRole('button', { name: 'Project options' }));
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unarchive' }));
    expect(onUnarchive).toHaveBeenCalledWith(archived);
  });
});

describe('ProjectCard, kebab menu (leader-matched shape)', () => {
  it('lists Share, Edit details, Archive, Delete in that order, without a duplicate Star', () => {
    render(
      <ProjectCard
        project={PROJECT}
        onShare={vi.fn()}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Project options' }));
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent?.trim());
    expect(items).toEqual(['Share', 'Edit details', 'Archive', 'Delete']);
  });

  it('calls onShare with the project and closes the menu', () => {
    const onShare = vi.fn();
    render(<ProjectCard project={PROJECT} onShare={onShare} onEdit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Project options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Share' }));
    expect(onShare).toHaveBeenCalledWith(PROJECT);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('omits Share when the host supplies no handler', () => {
    render(<ProjectCard project={PROJECT} onEdit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Project options' }));
    expect(screen.queryByRole('menuitem', { name: 'Share' })).toBeNull();
  });
});
