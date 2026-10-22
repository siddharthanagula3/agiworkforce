import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleApi } from '@/features/schedules/services/schedule-api';
import type { ScheduleRun, ScheduleTask } from '@/features/schedules/types';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { AgentDeploymentsPanel } from '../components/AgentDeploymentsPanel';
import { fakeApi, managedAgent } from './agent-test-api';

const SCHEDULE_ID = '0190a000-0000-7000-8000-0000000000d1';

function schedule(patch: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    id: SCHEDULE_ID,
    userId: 'user-1',
    name: 'Weekday digest',
    description: null,
    scheduleType: 'cron',
    cronExpression: '0 7 * * 1-5',
    executeAt: null,
    intervalMs: null,
    timezone: 'America/Los_Angeles',
    isEnabled: true,
    expiresAt: null,
    maxExecutions: null,
    executionCount: 3,
    actionType: 'agent',
    actionConfig: null,
    prompt: 'Summarize the week.',
    model: null,
    status: 'active',
    lastExecutedAt: '2026-10-21T14:00:00.000Z',
    nextExecutionAt: '2026-10-22T14:00:00.000Z',
    lastError: null,
    metadata: { productRecurrence: 'custom' },
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...patch,
  };
}

function run(id: string, status: ScheduleRun['status']): ScheduleRun {
  return {
    id,
    taskId: SCHEDULE_ID,
    status,
    triggerSource: 'schedule',
    scheduledFor: null,
    startedAt: '2026-10-21T14:00:00.000Z',
    completedAt: '2026-10-21T14:00:05.000Z',
    durationMs: 5000,
    result: null,
    error: null,
    idempotencyKey: `schedule:${id}`,
    leaseExpiresAt: null,
    attemptCount: 1,
  };
}

function scheduleApiFake(patch: Partial<ScheduleApi> = {}): ScheduleApi {
  return {
    getSchedule: vi.fn(async () => schedule()),
    listRuns: vi.fn(async () => ({
      runs: [run('r1', 'success'), run('r2', 'failed')],
      pagination: { limit: 10, offset: 0 },
      hasMore: false,
    })),
    runNow: vi.fn(async () => ({ run: run('r3', 'running'), replay: false })),
    setScheduleEnabled: vi.fn(async (_id, isActive) => schedule({ isEnabled: isActive })),
    ...patch,
  } as unknown as ScheduleApi;
}

function agentApiWithRoutine() {
  return fakeApi({
    activity: vi.fn(async () => ({
      conversations: [],
      routines: [
        {
          id: SCHEDULE_ID,
          name: 'Weekday digest',
          status: 'active',
          lastExecutedAt: null,
          nextExecutionAt: null,
        },
      ],
    })),
  });
}

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T09:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AgentDeploymentsPanel', () => {
  it('shows each schedule bound to the agent with version, timing, next run and run activity', async () => {
    const agent = managedAgent({ publishedVersion: 2, hasUnpublishedChanges: false });
    render(
      <AgentDeploymentsPanel
        api={agentApiWithRoutine()}
        agent={agent}
        schedules={scheduleApiFake()}
      />,
    );
    const row = (await screen.findByRole('heading', { name: 'Weekday digest' })).closest('li')!;
    expect(within(row).getByText('v2')).toBeInTheDocument();
    expect(within(row).getByText(/Next in 5 hours/)).toBeInTheDocument();
    expect(within(row).getByText(/Last run/)).toBeInTheDocument();
    expect(within(row).getByRole('img')).toHaveAccessibleName('Last 2 runs: 1 succeeded, 1 failed');
    expect(within(row).getByRole('link', { name: 'View sessions' })).toHaveAttribute(
      'href',
      `/chat/schedules?schedule=${SCHEDULE_ID}`,
    );
  });

  it('labels the version Draft until the agent is published', async () => {
    render(
      <AgentDeploymentsPanel
        api={agentApiWithRoutine()}
        agent={managedAgent({ publishedVersion: null })}
        schedules={scheduleApiFake()}
      />,
    );
    const row = (await screen.findByRole('heading', { name: 'Weekday digest' })).closest('li')!;
    expect(within(row).getByText('Draft')).toBeInTheDocument();
  });

  it('runs the schedule now and refreshes its row', async () => {
    const schedules = scheduleApiFake();
    render(
      <AgentDeploymentsPanel
        api={agentApiWithRoutine()}
        agent={managedAgent()}
        schedules={schedules}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Run Weekday digest now' }));
    await waitFor(() =>
      expect(schedules.runNow).toHaveBeenCalledWith(SCHEDULE_ID, expect.any(String)),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Started Weekday digest.'));
    expect(schedules.listRuns).toHaveBeenCalledTimes(2);
  });

  it('cannot run a paused schedule, and resumes it from the menu', async () => {
    const schedules = scheduleApiFake({
      getSchedule: vi.fn(async () => schedule({ isEnabled: false, status: 'paused' })),
    });
    render(
      <AgentDeploymentsPanel
        api={agentApiWithRoutine()}
        agent={managedAgent()}
        schedules={schedules}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Run Weekday digest now' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Weekday digest' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Resume' }));
    await waitFor(() =>
      expect(schedules.setScheduleEnabled).toHaveBeenCalledWith(SCHEDULE_ID, true),
    );
  });

  it('offers a way to add a deployment when none exist', async () => {
    render(
      <AgentDeploymentsPanel
        api={fakeApi()}
        agent={managedAgent()}
        schedules={scheduleApiFake()}
      />,
    );
    expect(await screen.findByText('No deployments yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New deployment' })).toHaveAttribute(
      'href',
      '/chat/schedules?agent=0190a000-0000-7000-8000-0000000000a1',
    );
  });

  it('shows an error with a retry when the deployments cannot be loaded', async () => {
    const activity = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
      conversations: [],
      routines: [],
    });
    render(
      <AgentDeploymentsPanel
        api={fakeApi({ activity })}
        agent={managedAgent()}
        schedules={scheduleApiFake()}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No deployments yet.')).toBeInTheDocument();
  });
});
