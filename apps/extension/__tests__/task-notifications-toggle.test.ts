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

  it('gates Task Completed and Task Failed through the authority-aware toggle helper', () => {
    expect(background).toContain('publishAuthorizedScheduledTaskNotification(');
    expect(background).toMatch(
      /publishAuthorizedScheduledTaskNotification\([\s\S]{0,700}isEnabled: taskNotificationsEnabled[\s\S]{0,700}'Task Completed'/,
    );
    expect(background).toMatch(
      /publishAuthorizedScheduledTaskNotification\([\s\S]{0,700}isEnabled: taskNotificationsEnabled[\s\S]{0,700}'Task Failed'/,
    );
    const completedCalls = background.match(/showNotification\(\s*'Task Completed'/g) ?? [];
    const failedCalls = background.match(/showNotification\(\s*'Task Failed'/g) ?? [];
    expect(completedCalls.length).toBe(1);
    expect(failedCalls.length).toBe(1);
  });

  it('no longer inlines the raw storage read for the pre-run reminder', () => {
    const inlineReads = background.match(/agi_task_notifications: notificationsEnabled/g) ?? [];
    expect(inlineReads.length).toBe(0);
  });

  it('threads cancellation signals through every task terminal notification', () => {
    expect(background).toMatch(
      /notifyScheduledTaskCompleted\([\s\S]*?signal\?: AbortSignal[\s\S]*?publishAuthorizedScheduledTaskNotification\([\s\S]*?signal/,
    );
    expect(background).toMatch(
      /notifyScheduledTaskFailed\([\s\S]*?signal\?: AbortSignal[\s\S]*?publishAuthorizedScheduledTaskNotification\([\s\S]*?signal/,
    );
    expect(background).toMatch(
      /'Task Paused'[\s\S]{0,1200}signal: lease\.controller\.signal|signal: lease\.controller\.signal[\s\S]{0,1200}'Task Paused'/,
    );
    expect(background).toMatch(
      /'Task Continuing'[\s\S]{0,1200}signal: lease\.controller\.signal|signal: lease\.controller\.signal[\s\S]{0,1200}'Task Continuing'/,
    );
  });
});
