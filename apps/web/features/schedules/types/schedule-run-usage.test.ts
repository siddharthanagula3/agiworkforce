import { describe, expect, it } from 'vitest';
import { getModels, isModelLive } from '@agiworkforce/types';

import { formatCostCents, formatTokenCount, scheduleModelLabel, scheduleRunUsage } from './index';
import type { ScheduleRun } from './index';

function run(result: Record<string, unknown> | null): ScheduleRun {
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
  } as ScheduleRun;
}

describe('scheduleRunUsage', () => {
  it('reads what the executor recorded', () => {
    const usage = scheduleRunUsage(
      run({
        text: 'done',
        model: 'fixture-model',
        provider: 'anthropic',
        usage: { promptTokens: 1200, completionTokens: 300, totalTokens: 1500, costCents: 0.45 },
      }),
    );

    expect(usage).toEqual({
      model: 'fixture-model',
      provider: 'anthropic',
      totalTokens: 1500,
      costCents: 0.45,
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
      costCents: null,
    });
  });

  it('rejects non-finite and wrongly-typed values instead of rendering them', () => {
    const usage = scheduleRunUsage(
      run({ model: 42, usage: { totalTokens: Number.NaN, costCents: '0.45' } }),
    );

    expect(usage).toBeNull();
  });

  it('survives a result whose usage field is not an object', () => {
    expect(() => scheduleRunUsage(run({ usage: 'unavailable' }))).not.toThrow();
    expect(scheduleRunUsage(run({ usage: 'unavailable' }))).toBeNull();
  });
});

describe('formatCostCents', () => {
  it('shows an exact zero as free, because it is', () => {
    expect(formatCostCents(0)).toBe('$0.00');
  });

  it('does not round a real cost down to free', () => {
    expect(formatCostCents(0.45)).toBe('<$0.01');
    expect(formatCostCents(0.0001)).toBe('<$0.01');
  });

  it('formats ordinary costs as dollars', () => {
    expect(formatCostCents(150)).toBe('$1.50');
    expect(formatCostCents(1)).toBe('$0.01');
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
