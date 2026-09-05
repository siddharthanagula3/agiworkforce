import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Sidebar, type SidebarProps } from '../Sidebar';
import type { SidebarProject, SidebarSession } from '../types';

const projects: SidebarProject[] = [{ id: 'p1', name: 'files-2 qa project 1788541264027 json' }];
const sessions: SidebarSession[] = [];

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

function stubOverflow(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
}

function forceRemeasure() {
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

describe('Sidebar project row title tooltip', () => {
  it('carries no tooltip content while the title fits the row', () => {
    renderSidebar();
    const title = screen.getByText(projects[0]!.name);
    stubOverflow(title, 100, 100);

    forceRemeasure();

    expect(screen.queryByText(projects[0]!.name, { selector: '[role="tooltip"] *' })).toBeNull();
  });

  it('exposes the full title on hover once the row is actually clipped', async () => {
    renderSidebar();
    const title = screen.getByText(projects[0]!.name);
    stubOverflow(title, 320, 180);

    forceRemeasure();

    fireEvent.pointerEnter(title);
    fireEvent.pointerMove(title);

    await screen.findByRole('tooltip');
    expect(screen.getAllByText(projects[0]!.name).length).toBeGreaterThan(1);
  });
});
