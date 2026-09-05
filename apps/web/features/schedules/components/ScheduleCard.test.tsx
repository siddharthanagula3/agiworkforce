import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { formatRelativeTime } from '@shared/utils/format';
import { ScheduleCard } from './ScheduleCard';
import type { ScheduleHistoryState } from './ScheduleRunHistory';
import type { ScheduleTask } from '../types';

const EMPTY_HISTORY: ScheduleHistoryState = {
  status: 'idle',
  runs: [],
  error: null,
  hasMore: false,
  nextOffset: 0,
  loadingMore: false,
};

const baseSchedule: ScheduleTask = {
  id: 'schedule-1',
  userId: 'user-1',
  name: 'Weekly digest',
  description: null,
  scheduleType: 'cron',
  cronExpression: '0 9 * * 1',
  executeAt: null,
  intervalMs: null,
  timezone: 'America/Chicago',
  isEnabled: true,
  expiresAt: null,
  maxExecutions: null,
  executionCount: 0,
  actionType: 'agent',
  actionConfig: null,
  prompt: 'Summarize the week.',
  model: 'auto-balanced',
  status: 'active',
  lastExecutedAt: null,
  nextExecutionAt: '2026-07-20T14:00:00.000Z',
  lastError: null,
  metadata: { productRecurrence: 'custom' },
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

function renderCard(schedule: ScheduleTask) {
  render(
    <ScheduleCard
      schedule={schedule}
      operation={null}
      error={null}
      isRunningNow={false}
      historyExpanded={false}
      history={EMPTY_HISTORY}
      onToggleEnabled={vi.fn()}
      onRunNow={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onToggleHistory={vi.fn()}
      onRetryHistory={vi.fn()}
      onLoadMoreHistory={vi.fn()}
      onShare={vi.fn()}
      onOpenNotificationSettings={vi.fn()}
      onViewResult={vi.fn()}
    />,
  );
}

describe('ScheduleCard timing', () => {
  it('renders a common cron shape in words, with the raw cron in a tooltip', () => {
    renderCard(baseSchedule);

    const timing = screen.getByText('Weekly on Monday at 9:00 AM');
    expect(timing).toBeInTheDocument();
    expect(timing).toHaveAttribute('title', '0 9 * * 1');
  });

  it('falls back to the raw cron for an unusual expression, with no tooltip duplicate', () => {
    renderCard({ ...baseSchedule, cronExpression: '0 9,17 * * *' });

    const timing = screen.getByText('0 9,17 * * *');
    expect(timing).toBeInTheDocument();
  });

  it('does not attach a cron tooltip to non-cron recurrences', () => {
    renderCard({
      ...baseSchedule,
      scheduleType: 'interval',
      cronExpression: null,
      intervalMs: 60 * 60_000,
      metadata: { productRecurrence: 'interval' },
    });

    const timing = screen.getByText('Every 1 hour');
    expect(timing).not.toHaveAttribute('title');
  });
});

describe('ScheduleCard summary line (slice E item 6)', () => {
  it('shows the next run as relative time under the title, not the absolute date', () => {
    renderCard(baseSchedule);

    const expected = `Next run ${formatRelativeTime(baseSchedule.nextExecutionAt as string)}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.getByText('Next Run').nextElementSibling).toHaveTextContent(/2026/);
  });

  it('shows Paused instead of a relative time when disabled', () => {
    renderCard({ ...baseSchedule, isEnabled: false });

    expect(screen.getAllByText('Paused')).toHaveLength(2);
    expect(screen.queryByText(/^Next run /)).toBeNull();
  });

  it('renders no summary line when enabled with no next run scheduled', () => {
    renderCard({ ...baseSchedule, nextExecutionAt: null });

    expect(screen.queryByText(/^Next run /)).toBeNull();
    expect(screen.queryByText('Paused')).toBeNull();
  });
});
