import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import type { SidebarSession } from '../types';

const sessions: SidebarSession[] = [
  {
    id: 'running',
    title: 'Nightly report',
    updatedAt: new Date().toISOString(),
    runState: 'running',
  },
  { id: 'idle', title: 'Old thread', updatedAt: new Date().toISOString() },
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

// shell-04 / agentic-modes-gap-03: the recents list had no run-state awareness at
// all, so a conversation with a turn in flight looked identical to a dead one.
describe('Sidebar run-state indicator', () => {
  it('marks a conversation whose turn is in flight', () => {
    renderSidebar();

    expect(screen.getByTestId('session-running-running')).not.toBeNull();
    expect(screen.getAllByText('Running').length).toBeGreaterThan(0);
  });

  it('leaves a conversation with no known run state unmarked', () => {
    renderSidebar();

    expect(screen.queryByTestId('session-running-idle')).toBeNull();
  });
});
