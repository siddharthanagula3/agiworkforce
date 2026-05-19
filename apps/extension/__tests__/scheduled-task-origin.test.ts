/**
 * Fire-time origin re-check for scheduled tasks (C-02 audit 2026-05-19).
 *
 * The attacker scenario: an origin briefly allowlisted by the user plants a
 * scheduled task. When the user removes the origin from the allowlist later,
 * the task's chrome.alarms entry is unchanged and continues to fire.
 *
 * The fix: at alarm-fire time, executeScheduledTask re-checks the task's
 * createdByOrigin against siteAllowlistCache and auto-deletes if absent.
 *
 * These tests mirror the fire-time check logic in isolation so they're
 * fast and don't pull the full Chrome API surface. The matching production
 * code lives in `background.ts` (executeScheduledTask) and the policy
 * sentinel in `src/background/policy.ts`.
 */

import { describe, expect, it } from 'vitest';
// Self-review #1 audit 2026-05-19: import the production helper instead of
// mirroring. `shouldExecuteScheduledTask` is the same function the live
// `executeScheduledTask` path calls — drift is impossible.
import {
  ORIGIN_EXTENSION_PAGE,
  shouldExecuteScheduledTask,
} from '../src/background/policy';
import type { ScheduledTask } from '../src/types';

// Thin alias so the rest of the suite reads naturally.
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
    // Tasks persisted before the C-02 fix have no createdByOrigin field.
    // Auto-deleting them would be a hostile change for legitimate users.
    // Instead: permit, and let the user's awareness of the Workflows tab
    // surface the legacy state if it matters.
    const task = makeTask({ createdByOrigin: '' });
    expect(shouldExecute(task, new Set())).toBe(true);
  });
});
