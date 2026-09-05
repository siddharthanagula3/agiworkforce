import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import type { SidebarSession } from '../types';

const sessions: SidebarSession[] = [
  {
    id: 'task',
    title: 'Pricing research',
    updatedAt: new Date().toISOString(),
    agiWork: true,
  },
  { id: 'chat', title: 'Weekend plans', updatedAt: new Date().toISOString() },
];

function renderSidebar() {
  render(
    <Sidebar
      sessions={sessions}
      projects={[]}
      onNewChat={vi.fn()}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onTogglePin={vi.fn()}
    />,
  );
}

// Both leaders mark a task inline in the one shared recents list rather than
// filing it elsewhere; ours marked nothing, so a task and a chat were identical.
describe('Sidebar AGI Work marker', () => {
  it('marks a task started in AGI Work with a dot', () => {
    renderSidebar();

    expect(screen.getByTestId('session-agi-work-task')).not.toBeNull();
  });

  it('leaves an ordinary chat unmarked', () => {
    renderSidebar();

    expect(screen.queryByTestId('session-agi-work-chat')).toBeNull();
  });

  it('names the mode in the row accessible name, not by colour alone', () => {
    renderSidebar();

    expect(screen.getByRole('button', { name: 'Pricing research, AGI Work' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Weekend plans' })).not.toBeNull();
  });
});
