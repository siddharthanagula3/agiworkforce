import { describe, expect, it } from 'vitest';
import { getModels, isModelLive } from '@agiworkforce/types';

import { formatRunCredits, formatTokenCount, scheduleModelLabel, scheduleRunUsage } from './index';
import type { ScheduleRun } from './index';

function run(result: Record<string, unknown> | null, creditsUsed?: number | null): ScheduleRun {
  return {
    id: 'run-1',
    taskId: 'task-1',
    status: 'success',
    triggerSource: 'schedule',
    scheduledFor: '2026-08-06T00:00:00.000Z',
    startedAt: '2026-08-06T00:00:00.000Z',
    completedAt: '2026-08-06T00:00:04.000Z',
    durationMs: 4000,
    result,
    error: null,
    idempotencyKey: 'key-1',
    leaseExpiresAt: null,
    attemptCount: 1,
    ...(creditsUsed === undefined ? {} : { creditsUsed }),
  } as ScheduleRun;
}

describe('scheduleRunUsage', () => {
  it('reads what the executor recorded and the credits the run was charged', () => {
    const usage = scheduleRunUsage(
      run(
        {
          text: 'done',
          model: 'fixture-model',
          provider: 'anthropic',
          usage: { promptTokens: 1200, completionTokens: 300, totalTokens: 1500 },
        },
        0.9,
      ),
    );

    expect(usage).toEqual({
      model: 'fixture-model',
      provider: 'anthropic',
      totalTokens: 1500,
      credits: 0.9,
    });
  });

  it('returns null when the run recorded no usage at all', () => {
    expect(scheduleRunUsage(run({ text: 'done' }))).toBeNull();
    expect(scheduleRunUsage(run(null))).toBeNull();
  });

  it('keeps partial data rather than discarding the whole record', () => {
    const usage = scheduleRunUsage(run({ model: 'fixture-model' }));

    expect(usage).toEqual({
      model: 'fixture-model',
      provider: null,
      totalTokens: null,
      credits: null,
    });
  });

  it('rejects non-finite and wrongly-typed values instead of rendering them', () => {
    const usage = scheduleRunUsage(
      run({ model: 42, usage: { totalTokens: Number.NaN } }, Number.NaN),
    );

    expect(usage).toBeNull();
  });

  it('survives a result whose usage field is not an object', () => {
    expect(() => scheduleRunUsage(run({ usage: 'unavailable' }))).not.toThrow();
    expect(scheduleRunUsage(run({ usage: 'unavailable' }))).toBeNull();
  });
});

describe('formatRunCredits', () => {
  it('shows an exact zero as zero credits, because it is', () => {
    expect(formatRunCredits(0)).toBe('0 credits');
  });

  it('does not round the smallest real charge down to nothing', () => {
    expect(formatRunCredits(0.01)).toBe('0.01 credits');
    expect(formatRunCredits(0.05)).toBe('0.05 credits');
  });

  it('formats ordinary amounts in credits', () => {
    expect(formatRunCredits(300)).toBe('300 credits');
    expect(formatRunCredits(1)).toBe('1 credit');
  });
});

describe('formatTokenCount', () => {
  it('keeps small counts exact and abbreviates large ones', () => {
    expect(formatTokenCount(999)).toBe('999');
    expect(formatTokenCount(1500)).toBe('1.5K');
    expect(formatTokenCount(2_400_000)).toBe('2.4M');
  });
});

describe('scheduleModelLabel', () => {
  it('renders canonical managed model names and hides retired identifiers', () => {
    const currentModel = getModels().find(
      (model) => isModelLive(model) && model.modelType !== 'image' && model.modelType !== 'video',
    );
    expect(currentModel).toBeTruthy();
    expect(scheduleModelLabel(currentModel?.id)).toBe(currentModel?.name);
    expect(scheduleModelLabel('fixture-retired-schedule-model')).toBe('Unavailable model');
  });
});
