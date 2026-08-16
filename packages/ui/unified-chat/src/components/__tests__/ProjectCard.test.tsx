
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

describe('ProjectCard — valid HTML nesting', () => {
  it('does not render a <button> nested inside another <button>', () => {
    const { container } = render(<ProjectCard project={PROJECT} onDelete={vi.fn()} />);
    const nested = container.querySelectorAll('button button');
    expect(nested.length).toBe(0);
  });

  it('renders the card as a role="button" element, not a native button', () => {
    render(<ProjectCard project={PROJECT} />);
    const card = screen.getByRole('button', { name: /open project design system/i });
    expect(card.tagName).toBe('DIV');
  });
});

describe('ProjectCard — independent click handlers', () => {
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

  it('opens the project on Enter/Space keyboard activation', () => {
    const onSelect = vi.fn();
    render(<ProjectCard project={PROJECT} onSelect={onSelect} />);
    const card = screen.getByRole('button', { name: /open project design system/i });
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('toggles the star WITHOUT opening the project (stopPropagation preserved)', () => {
    const onSelect = vi.fn();
    render(<ProjectCard project={PROJECT} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /star project/i }));

    expect(useProjectStore.getState().projects[0]!.starred).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('ProjectCard — archive/unarchive menu', () => {
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
