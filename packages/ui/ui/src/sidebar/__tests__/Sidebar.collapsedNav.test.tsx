import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import type { SidebarNavItem } from '../types';

const Dot = () => <svg />;

const navItems: SidebarNavItem[] = [
  { id: 'projects', label: 'Projects', icon: Dot, onClick: vi.fn() },
  { id: 'library', label: 'Library', icon: Dot, onClick: vi.fn(), isActive: true },
  { id: 'tasks', label: 'Tasks', icon: Dot, onClick: vi.fn() },
];

// Collapsing the rail used to drop every destination: the collapsed branch
// rendered New chat, Search and a mode dot, and never looked at navItems. The
// only way anything else appeared was a pair of hardcoded Projects/Skills
// handlers no caller ever passed, so in practice a collapsed sidebar could not
// navigate anywhere. ChatGPT and Claude both keep an icon rail when collapsed.
describe('collapsed sidebar keeps its destinations', () => {
  const renderCollapsed = () =>
    render(
      <Sidebar
        collapsed
        sessions={[]}
        projects={[]}
        navItems={navItems}
        onNewChat={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onToggleCollapse={vi.fn()}
      />,
    );

  it('renders every destination as a rail button', () => {
    renderCollapsed();
    for (const item of navItems) {
      expect(screen.getByRole('button', { name: item.label })).toBeTruthy();
    }
  });

  it('routes a rail button to the destination it names', () => {
    renderCollapsed();
    screen.getByRole('button', { name: 'Tasks' }).click();
    expect(navItems[2]!.onClick).toHaveBeenCalled();
  });

  it('marks the active destination for assistive tech', () => {
    renderCollapsed();
    expect(screen.getByRole('button', { name: 'Library' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('button', { name: 'Tasks' }).getAttribute('aria-current')).toBeNull();
  });
});
