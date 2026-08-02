/**
 * task-notifications-toggle.test.ts
 *
 * Regression: the options "Task notifications" toggle (agi_task_notifications)
 * only gated the pre-run reminder — Task Completed / Task Failed fired
 * regardless, so turning it OFF still produced a notification on every scheduled
 * run. Both the pre-run reminder and the completion/failure notifications now
 * route through the single taskNotificationsEnabled() helper. Asserted at the
 * source level (background.ts is not unit-importable).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const background = readFileSync(resolve(here, '..', 'src/background.ts'), 'utf8');

describe('agi_task_notifications gates all task notifications', () => {
  it('has a single taskNotificationsEnabled() helper reading the pref (default on)', () => {
    expect(background).toMatch(/async function taskNotificationsEnabled\(\)/);
    expect(background).toMatch(/agi_task_notifications: true/);
  });

  it('gates Task Completed and Task Failed on the toggle', () => {
    // SIX-04 moved the result snippet into the guarded block, so the call is no
    // longer the first statement after the brace. The contract under test is
    // unchanged: neither notification may be reachable outside the guard, and
    // `[^}]*` keeps the match inside the same block.
    expect(background).toMatch(
      /if \(await taskNotificationsEnabled\(\)\) \{[^}]*showNotification\(\s*'Task Completed'/,
    );
    expect(background).toMatch(
      /if \(await taskNotificationsEnabled\(\)\) \{[^}]*showNotification\(\s*'Task Failed'/,
    );
    // No ungated call site for either notification.
    const completedCalls = background.match(/showNotification\(\s*'Task Completed'/g) ?? [];
    const failedCalls = background.match(/showNotification\(\s*'Task Failed'/g) ?? [];
    expect(completedCalls.length).toBe(1);
    expect(failedCalls.length).toBe(1);
  });

  it('no longer inlines the raw storage read for the pre-run reminder', () => {
    // The pre-run alarm reminder was refactored onto the same helper.
    const inlineReads = background.match(/agi_task_notifications: notificationsEnabled/g) ?? [];
    expect(inlineReads.length).toBe(0);
  });
});
