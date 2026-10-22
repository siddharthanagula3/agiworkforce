import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import { TasksBoard, type TasksBoardProps } from '../TasksBoard';
import { isTaskUnread, loadTaskViews, markTaskViewed } from '../task-display';

const NOW = new Date('2026-10-22T12:00:00.000Z');
const BEFORE_FIRST_VISIT = '2026-10-22T11:00:00.000Z';
const AFTER_FIRST_VISIT = '2026-10-22T12:10:00.000Z';
const STORAGE_KEY = 'agi-task-views';

function makeRun(id: string, overrides: Partial<CloudAgentRun> = {}): CloudAgentRun {
  return {
    id,
    userId: 'user-1',
    requestId: `request-${id}`,
    conversationId: null,
    originSurface: 'web',
    workMode: 'agiwork',
    state: 'completed',
    provider: 'openai',
    model: 'fixture-task-model',
    lastEventSequence: 1,
    cancellationRequestedAt: null,
    completedAt: AFTER_FIRST_VISIT,
    createdAt: '2026-10-20T09:00:00.000Z',
    updatedAt: AFTER_FIRST_VISIT,
    ...overrides,
  };
}

function boardProps(runs: CloudAgentRun[], selectedRunId: string | null = null): TasksBoardProps {
  return {
    runs,
    showEmptyStages: false,
    selectedRunId,
    runTitle: (run) => ({ title: `Task ${run.id}`, isFallback: false }),
    cancellingId: null,
    pausingId: null,
    archivingId: null,
    resolvingApprovalId: null,
    canArchive: true,
    onSelect: vi.fn(),
    onOpenConversation: vi.fn(),
    onApprove: vi.fn(),
    onDeny: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onCancel: vi.fn(),
    onArchive: vi.fn(),
  };
}

function firstVisit() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ since: NOW.toISOString(), seen: {} }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T12:15:00.000Z'));
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('task board rows', () => {
  it('shows when each run last changed, not when it started', () => {
    firstVisit();
    render(<TasksBoard {...boardProps([makeRun('a')])} />);

    const time = screen.getByTestId('tasks-board-card-a').querySelector('time');
    expect(time?.getAttribute('datetime')).toBe(AFTER_FIRST_VISIT);
    expect(time?.textContent).toBe('5 minutes ago');
  });

  it('marks a run that finished since the last look, and only that run', () => {
    firstVisit();
    render(
      <TasksBoard
        {...boardProps([
          makeRun('fresh'),
          makeRun('old', { updatedAt: BEFORE_FIRST_VISIT }),
          makeRun('working', { state: 'running', completedAt: null }),
        ])}
      />,
    );

    expect(screen.getByTestId('tasks-board-unread-fresh')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Task fresh, Completed, unread/ })).toBeTruthy();
    expect(screen.queryByTestId('tasks-board-unread-old')).toBeNull();
    expect(screen.queryByTestId('tasks-board-unread-working')).toBeNull();
  });

  it('marks a run waiting for an answer', () => {
    firstVisit();
    render(<TasksBoard {...boardProps([makeRun('ask', { state: 'awaiting_input' })])} />);

    expect(screen.getByTestId('tasks-board-unread-ask')).toBeTruthy();
    expect(screen.getByText('Waiting for input')).toBeTruthy();
  });

  it('clears the mark once the run is opened and keeps it cleared', () => {
    firstVisit();
    const runs = [makeRun('a')];
    const { rerender, unmount } = render(<TasksBoard {...boardProps(runs)} />);
    expect(screen.getByTestId('tasks-board-unread-a')).toBeTruthy();

    rerender(<TasksBoard {...boardProps(runs, 'a')} />);
    rerender(<TasksBoard {...boardProps(runs, null)} />);
    expect(screen.queryByTestId('tasks-board-unread-a')).toBeNull();

    unmount();
    render(<TasksBoard {...boardProps(runs)} />);
    expect(screen.queryByTestId('tasks-board-unread-a')).toBeNull();
  });

  it('does not mark a run for a change the user made from the card', () => {
    firstVisit();
    const run = makeRun('a', { updatedAt: BEFORE_FIRST_VISIT, completedAt: BEFORE_FIRST_VISIT });
    const props = boardProps([run]);
    const { rerender } = render(<TasksBoard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive: Task a' }));
    expect(props.onArchive).toHaveBeenCalledWith(run, true);
    rerender(
      <TasksBoard
        {...props}
        runs={[{ ...run, state: 'completed', updatedAt: AFTER_FIRST_VISIT }]}
      />,
    );

    expect(screen.queryByTestId('tasks-board-unread-a')).toBeNull();
  });

  it('marks a later change once a card action finished without changing the run', () => {
    firstVisit();
    const run = makeRun('a', { updatedAt: BEFORE_FIRST_VISIT, completedAt: BEFORE_FIRST_VISIT });
    const props = boardProps([run]);
    const { rerender } = render(<TasksBoard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive: Task a' }));
    rerender(<TasksBoard {...props} archivingId="a" />);
    rerender(<TasksBoard {...props} archivingId={null} />);
    rerender(<TasksBoard {...props} runs={[{ ...run, updatedAt: AFTER_FIRST_VISIT }]} />);

    expect(screen.getByTestId('tasks-board-unread-a')).toBeTruthy();
  });
});

describe('task view marks', () => {
  it('starts a first visit from now so past runs are not unread', () => {
    const views = loadTaskViews(NOW);
    expect(views).toEqual({ since: NOW.toISOString(), seen: {} });
    expect(isTaskUnread(makeRun('a', { updatedAt: BEFORE_FIRST_VISIT }), views)).toBe(false);
    expect(isTaskUnread(makeRun('a'), views)).toBe(true);
  });

  it('shows no marks when storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadTaskViews(NOW)).toBeNull();
    expect(isTaskUnread(makeRun('a'), null)).toBe(false);
    getItem.mockRestore();
  });

  it('ignores a malformed stored value', () => {
    window.localStorage.setItem(STORAGE_KEY, '{"since":"never","seen":[]}');
    expect(loadTaskViews(NOW)).toEqual({ since: NOW.toISOString(), seen: {} });
  });

  it('returns the same marks when the run has not changed since it was seen', () => {
    const views = markTaskViewed({ since: NOW.toISOString(), seen: {} }, makeRun('a'), NOW);
    expect(markTaskViewed(views, makeRun('a'), new Date(AFTER_FIRST_VISIT))).toBe(views);
    expect(isTaskUnread(makeRun('a'), views)).toBe(false);
  });
});
