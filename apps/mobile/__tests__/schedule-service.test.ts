import * as Crypto from 'expo-crypto';
import { api } from '@/services/api';
import {
  createSchedule,
  fetchScheduleRuns,
  fetchSchedules,
  toggleSchedule,
  triggerScheduleNow,
  updateSchedule,
} from '@/src/features/schedules/service';

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { schedules: true } }));
jest.mock('@/services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '12345678-abcd-4abc-8abc-1234567890ab'),
}));

const apiMock = api as jest.Mocked<typeof api>;

const serverSchedule = {
  id: 'schedule-1',
  userId: 'user-1',
  name: 'Morning brief',
  description: null,
  scheduleType: 'cron' as const,
  cronExpression: '0 9 * * 1-5',
  executeAt: null,
  intervalMs: null,
  timezone: 'America/Chicago',
  isEnabled: true,
  expiresAt: null,
  maxExecutions: null,
  executionCount: 3,
  actionType: 'agent' as const,
  actionConfig: null,
  prompt: 'Summarize my priorities.',
  model: 'auto-balanced',
  status: 'active' as const,
  lastExecutedAt: '2026-07-17T14:00:00.000Z',
  nextExecutionAt: '2026-07-18T14:00:00.000Z',
  lastError: null,
  metadata: {
    productRecurrence: 'weekly',
    timeOfDay: '09:00',
    daysOfWeek: [1, 2, 3, 4, 5],
  },
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-17T14:00:01.000Z',
};

const scheduleInput = {
  name: 'Morning brief',
  prompt: 'Summarize my priorities.',
  model: 'auto-balanced',
  recurrence: 'weekly' as const,
  scheduledAt: null,
  daysOfWeek: [1, 2, 3, 4, 5],
  timeOfDay: '09:00',
  timezone: 'America/Chicago',
  isActive: true,
};

const serverRun = {
  id: 'run-1',
  taskId: serverSchedule.id,
  status: 'timeout' as const,
  triggerSource: 'manual' as const,
  scheduledFor: null,
  startedAt: '2026-07-17T14:00:00.000Z',
  completedAt: '2026-07-17T14:00:40.000Z',
  durationMs: 40_000,
  result: { text: 'Partial result', model: 'auto-balanced' },
  error: 'Execution timed out',
  idempotencyKey: 'request-12345678',
  leaseExpiresAt: null,
  attemptCount: 1,
};

describe('mobile schedule service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps canonical schedule tasks into the mobile presentation model', async () => {
    apiMock.get.mockResolvedValueOnce({
      schedules: [serverSchedule],
      pagination: { limit: 50, offset: 0 },
    });

    await expect(fetchSchedules()).resolves.toEqual([
      {
        id: 'schedule-1',
        name: 'Morning brief',
        prompt: 'Summarize my priorities.',
        model: 'auto-balanced',
        recurrence: 'weekly',
        cronExpression: '0 9 * * 1-5',
        scheduledAt: null,
        daysOfWeek: [1, 2, 3, 4, 5],
        dayOfMonth: undefined,
        timeOfDay: '09:00',
        timezone: 'America/Chicago',
        isActive: true,
        lastRunAt: '2026-07-17T14:00:00.000Z',
        nextRunAt: '2026-07-18T14:00:00.000Z',
        lastRunStatus: 'success',
        createdAt: '2026-07-01T12:00:00.000Z',
        updatedAt: '2026-07-17T14:00:01.000Z',
      },
    ]);
  });

  it('rejects malformed server tasks instead of caching incomplete data', async () => {
    apiMock.get.mockResolvedValueOnce({
      schedules: [{ ...serverSchedule, prompt: undefined }],
      pagination: { limit: 50, offset: 0 },
    });

    await expect(fetchSchedules()).rejects.toThrow('Schedules returned an invalid response');
  });

  it('maps create and update responses while preserving canonical request bodies', async () => {
    apiMock.post.mockResolvedValueOnce({ schedule: serverSchedule });
    apiMock.put.mockResolvedValueOnce({ schedule: { ...serverSchedule, name: 'Updated brief' } });

    await expect(createSchedule(scheduleInput)).resolves.toMatchObject({ id: 'schedule-1' });
    await expect(updateSchedule('schedule/1', { name: 'Updated brief' })).resolves.toMatchObject({
      name: 'Updated brief',
    });

    expect(apiMock.post).toHaveBeenCalledWith('/api/schedules', scheduleInput);
    expect(apiMock.put).toHaveBeenCalledWith('/api/schedules/schedule%2F1', {
      name: 'Updated brief',
    });
  });

  it('uses the dedicated PATCH endpoint for activation changes', async () => {
    apiMock.patch.mockResolvedValueOnce({ schedule: { ...serverSchedule, isEnabled: false } });

    await expect(toggleSchedule('schedule/1', false)).resolves.toMatchObject({
      isActive: false,
    });
    expect(apiMock.patch).toHaveBeenCalledWith('/api/schedules/schedule%2F1', {
      isActive: false,
    });
  });

  it('maps terminal run states and extracts user-facing result text', async () => {
    apiMock.get.mockResolvedValueOnce({
      runs: [serverRun],
      pagination: { limit: 20, offset: 0 },
    });

    await expect(fetchScheduleRuns('schedule/1')).resolves.toEqual([
      {
        id: 'run-1',
        scheduleId: 'schedule-1',
        status: 'timeout',
        startedAt: '2026-07-17T14:00:00.000Z',
        completedAt: '2026-07-17T14:00:40.000Z',
        result: 'Partial result',
        error: 'Execution timed out',
      },
    ]);
    expect(apiMock.get).toHaveBeenCalledWith('/api/schedules/schedule%2F1/runs');
  });

  it('sends a retry-safe idempotency key when triggering a manual run', async () => {
    apiMock.post.mockResolvedValueOnce({ run: { ...serverRun, status: 'success' }, replay: false });

    await expect(triggerScheduleNow('schedule/1')).resolves.toMatchObject({
      status: 'success',
    });
    expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(apiMock.post).toHaveBeenCalledWith('/api/schedules/schedule%2F1/runs', undefined, {
      headers: {
        'Idempotency-Key': 'agi.schedule.mobile.12345678-abcd-4abc-8abc-1234567890ab',
      },
    });
  });
});
