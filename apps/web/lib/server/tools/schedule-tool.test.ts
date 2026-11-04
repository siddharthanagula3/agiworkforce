import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/entitlement-resolution', () => ({
  resolveEntitledPlanTier: vi.fn(),
}));
vi.mock('@/lib/services/schedule-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/schedule-service')>()),
  assertScheduleQuota: vi.fn(),
  createSchedule: vi.fn(),
}));

import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { assertScheduleQuota, createSchedule, ScheduleLimitError } from '@/lib/services/schedule-service';
import { executeScheduleTool } from './schedule-tool';

const args = {
  name: 'Daily briefing',
  prompt: 'Brief me',
  recurrence: 'daily',
  timeOfDay: '12:00',
};

function harness() {
  const controller = new AbortController();
  const execute = vi.fn(async () => 0);
  const tx = { execute } as unknown as DatabaseAdapter;
  const transaction = vi.fn(async <T>(callback: (db: DatabaseAdapter) => Promise<T>) => callback(tx));
  const context = {
    db: { transaction } as unknown as DatabaseAdapter,
    userId: 'user-1',
    temporaryChat: false,
    signal: controller.signal,
  };
  return { controller, execute, transaction, context };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveEntitledPlanTier).mockResolvedValue('max');
  vi.mocked(assertScheduleQuota).mockResolvedValue(undefined);
  vi.mocked(createSchedule).mockResolvedValue({
    id: 'schedule-1',
    name: 'Daily briefing',
    nextExecutionAt: null,
  } as Awaited<ReturnType<typeof createSchedule>>);
});

describe('native schedule cancellation admission', () => {
  it('preserves a domain-error-shaped cancellation after entitlement resolves', async () => {
    const { controller, transaction, context } = harness();
    const reason = new ScheduleLimitError('Stopped', 'max', 0);
    vi.mocked(resolveEntitledPlanTier).mockImplementationOnce(async () => {
      controller.abort(reason);
      return 'max';
    });
    await expect(executeScheduleTool(args, context)).rejects.toBe(reason);
    expect(transaction).not.toHaveBeenCalled();
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('does not create after cancellation while acquiring the advisory lock', async () => {
    const { controller, execute, context } = harness();
    const reason = new Error('Stopped while waiting for lock');
    execute.mockImplementationOnce(async () => {
      controller.abort(reason);
      return 0;
    });
    await expect(executeScheduleTool(args, context)).rejects.toBe(reason);
    expect(assertScheduleQuota).not.toHaveBeenCalled();
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('does not create after cancellation during quota lookup', async () => {
    const { controller, context } = harness();
    const reason = new Error('Stopped during quota lookup');
    vi.mocked(assertScheduleQuota).mockImplementationOnce(async () => {
      controller.abort(reason);
    });
    await expect(executeScheduleTool(args, context)).rejects.toBe(reason);
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('keeps the successful transaction receipt after cancellation', async () => {
    const { controller, transaction, context } = harness();
    transaction.mockImplementationOnce(async (callback) => {
      const result = await callback({ execute: vi.fn(async () => 0) } as unknown as DatabaseAdapter);
      controller.abort();
      return result;
    });
    const result = await executeScheduleTool(args, context);
    expect(JSON.parse(result.content)).toMatchObject({ created: true, id: 'schedule-1' });
    expect(createSchedule).toHaveBeenCalledWith(expect.anything(), 'user-1', expect.anything(), {
      planTier: 'max',
      signal: controller.signal,
    });
  });
});
