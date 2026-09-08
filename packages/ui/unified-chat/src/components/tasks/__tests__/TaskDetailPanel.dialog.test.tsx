import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import { TaskDetailPanel } from '../TaskDetailPanel';

afterEach(cleanup);

const run: CloudAgentRun = {
  id: '0190a000-0000-7000-8000-0000000000dd',
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: 'conversation-1',
  originSurface: 'web',
  workMode: 'agiwork',
  state: 'completed',
  provider: 'openai',
  model: 'fixture-task-model',
  lastEventSequence: 0,
  cancellationRequestedAt: null,
  completedAt: '2026-08-02T12:05:00.000Z',
  createdAt: '2026-08-02T12:00:00.000Z',
  updatedAt: '2026-08-02T12:05:00.000Z',
};

function mockViewport(narrow: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: narrow,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('TaskDetailPanel as a phone takeover', () => {
  beforeEach(() => mockViewport(true));

  it('announces itself as a modal dialog, keeps focus inside, and closes on Escape', () => {
    const onClose = vi.fn();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    render(
      <TaskDetailPanel
        run={run}
        events={[]}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        onClose={onClose}
        onOpenConversation={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Task details' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    opener.remove();
  });

  it('is a plain complementary region beside the list on a wide viewport', () => {
    mockViewport(false);
    render(
      <TaskDetailPanel
        run={run}
        events={[]}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
        onOpenConversation={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Task details' })).toBeTruthy();
  });
});
