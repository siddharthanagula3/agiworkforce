
import { describe, expect, it } from 'vitest';
import { ORIGIN_EXTENSION_PAGE, shouldExecuteScheduledTask } from '../src/background/policy';
import type { ScheduledTask } from '../src/types';

const shouldExecute = (task: ScheduledTask, allowlist: Set<string>): boolean =>
  shouldExecuteScheduledTask(task, allowlist);

function makeTask(overrides: Partial<ScheduledTask>): ScheduledTask {
  return {
    id: 'task_test',
    name: 'test',
    enabled: true,
    scheduleType: 'hourly',
    scheduleValue: '60',
    createdAt: Date.now(),
    createdByOrigin: ORIGIN_EXTENSION_PAGE,
    ...overrides,
  };
}

describe('C-02 fire-time origin re-check', () => {
  it('extension-page tasks always execute', () => {
    const task = makeTask({ createdByOrigin: ORIGIN_EXTENSION_PAGE });
    expect(shouldExecute(task, new Set())).toBe(true);
    expect(shouldExecute(task, new Set(['https://other.com']))).toBe(true);
  });

  it('web-origin tasks execute only when the origin is currently allowlisted', () => {
    const task = makeTask({ createdByOrigin: 'https://example.com' });
    expect(shouldExecute(task, new Set(['https://example.com']))).toBe(true);
    expect(shouldExecute(task, new Set())).toBe(false);
    expect(shouldExecute(task, new Set(['https://different.com']))).toBe(false);
  });

  it('legacy task with empty createdByOrigin is permitted (migration grace)', () => {
    const task = makeTask({ createdByOrigin: '' });
    expect(shouldExecute(task, new Set())).toBe(true);
  });
});
