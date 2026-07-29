import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedCloudScheduleTask } from '@agiworkforce/cloud-contracts';
import type { DesktopCloudSchedulesApi } from '../../../services/desktopCloudSchedules';

const auth = vi.hoisted(() => ({ signedIn: true }));

vi.mock('../../../stores/auth', () => ({
  selectHasCloudAccountSession: () => auth.signedIn,
  useAuthStore: (selector: (state: unknown) => unknown) => selector({}),
}));

const schedule: ManagedCloudScheduleTask = {
  id: 'schedule-1',
  userId: 'user-1',
  name: 'Morning brief',
  description: 'Daily priorities',
  scheduleType: 'cron',
  cronExpression: '0 9 * * *',
  executeAt: null,
  intervalMs: null,
  timezone: 'America/Chicago',
  isEnabled: true,
  expiresAt: null,
  maxExecutions: null,
  executionCount: 3,
  actionType: 'agent',
  actionConfig: null,
  prompt: 'Summarize my priorities.',
  model: 'auto-balanced',
  status: 'active',
  lastExecutedAt: null,
  nextExecutionAt: '2026-08-01T14:00:00.000Z',
  lastError: null,
  metadata: { productRecurrence: 'daily', timeOfDay: '09:00' },
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-29T12:00:00.000Z',
};

function makeApi(): DesktopCloudSchedulesApi {
  return {
    listSchedules: vi.fn(async () => ({
      schedules: [schedule],
      pagination: { limit: 50, offset: 0 },
      hasMore: false,
    })),
    getSchedule: vi.fn(async () => schedule),
    createSchedule: vi.fn(async () => schedule),
    updateSchedule: vi.fn(async () => schedule),
    setScheduleEnabled: vi.fn(async (_id, enabled) => ({
      ...schedule,
      isEnabled: enabled,
    })),
    deleteSchedule: vi.fn(async () => undefined),
    listRuns: vi.fn(async () => ({
      runs: [],
      pagination: { limit: 20, offset: 0 },
      hasMore: false,
    })),
    runNow: vi.fn(),
  };
}

const { DesktopCloudSchedules } = await import('../DesktopCloudSchedules');

describe('DesktopCloudSchedules', () => {
  beforeEach(() => {
    auth.signedIn = true;
  });

  it('keeps the Cloud surface honest while signed out', () => {
    auth.signedIn = false;
    render(<DesktopCloudSchedules api={makeApi()} />);

    expect(screen.getByText(/Sign in to manage Cloud schedules/i)).toBeTruthy();
    expect(screen.queryByText('Morning brief')).toBeNull();
  });

  it('lists account schedules and toggles them through the Cloud adapter', async () => {
    const api = makeApi();
    render(<DesktopCloudSchedules api={api} />);

    expect(await screen.findByText('Morning brief')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      expect(api.setScheduleEnabled).toHaveBeenCalledWith('schedule-1', false);
    });
    expect(await screen.findByText('Paused')).toBeTruthy();
  });

  it('loads run history instead of presenting a decorative History control', async () => {
    const api = makeApi();
    render(<DesktopCloudSchedules api={api} />);

    await screen.findByText('Morning brief');
    fireEvent.click(screen.getByRole('button', { name: /History/i }));

    await waitFor(() => {
      expect(api.listRuns).toHaveBeenCalledWith('schedule-1', {
        limit: 20,
        offset: 0,
      });
    });
    expect(await screen.findByText(/has not run yet/i)).toBeTruthy();
  });
});
