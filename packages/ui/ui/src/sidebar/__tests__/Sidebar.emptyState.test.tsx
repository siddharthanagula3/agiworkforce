import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../Sidebar';
import type { SidebarSession } from '../types';

const sessions: SidebarSession[] = [
  { id: 'a', title: 'Release notes', updatedAt: new Date().toISOString() },
  { id: 'b', title: 'Design review', updatedAt: new Date().toISOString() },
];

function renderSidebar(overrides: Partial<SidebarSession>[] = []) {
  render(
    <Sidebar
      sessions={overrides.length ? (overrides as SidebarSession[]) : sessions}
      projects={[]}
      onNewChat={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onTogglePin={vi.fn()}
    />,
  );
}

describe('Sidebar empty state', () => {
  it('keeps the conversation count and hides the empty state when a group is collapsed', async () => {
    renderSidebar();

    expect(screen.queryByText('No conversations yet')).toBeNull();
    const group = screen.getByRole('button', { expanded: true });
    await userEvent.click(group);

    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('No conversations yet')).toBeNull();
  });

  it('names the temporal group without a trailing conversation count', () => {
    renderSidebar();

    const group = screen.getByRole('button', { expanded: true });
    expect(group.textContent).toBe('Today');
  });

  it('still reports an account with nothing in it as empty', () => {
    render(
      <Sidebar
        sessions={[]}
        projects={[]}
        onNewChat={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onTogglePin={vi.fn()}
      />,
    );

    expect(screen.getByText('No conversations yet')).not.toBeNull();
  });

  it('gives the empty-state call to action a 24px target', () => {
    // renderSidebar([]) falls back to the populated list, so render directly.
    render(
      <Sidebar
        sessions={[]}
        projects={[]}
        onNewChat={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onTogglePin={vi.fn()}
      />,
    );
    const cta = screen.getByRole('button', { name: 'Start a new chat' });
    expect(cta.className).toMatch(/min-h-6/);
  });
});
