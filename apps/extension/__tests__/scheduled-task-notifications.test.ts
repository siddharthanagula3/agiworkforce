import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { publishAuthorizedScheduledTaskNotification } from '../src/features/background/scheduled-task-notifications';

const OWNER_A = { accountId: 'account-a', authIncarnation: 'session-a' } as const;

const backgroundSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
  'utf8',
);

function deferredBoolean() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('scheduled task notification authority', () => {
  it('suppresses account A content when A retires during the preference read', async () => {
    const enabled = deferredBoolean();
    const retired = new Set<string>();
    const publish = vi.fn();
    const pending = publishAuthorizedScheduledTaskNotification(
      { owner: OWNER_A },
      {
        isEnabled: () => enabled.promise,
        isOwnerRetired: (owner) => retired.has(owner.authIncarnation),
        publish,
      },
    );

    retired.add(OWNER_A.authIncarnation);
    enabled.resolve(true);

    await expect(pending).resolves.toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('suppresses a running notification when disable aborts during the preference read', async () => {
    const enabled = deferredBoolean();
    const controller = new AbortController();
    const publish = vi.fn();
    const pending = publishAuthorizedScheduledTaskNotification(
      { signal: controller.signal },
      { isEnabled: () => enabled.promise, isOwnerRetired: () => false, publish },
    );

    controller.abort();
    enabled.resolve(true);

    await expect(pending).resolves.toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes once when preference and authority remain current', async () => {
    const publish = vi.fn();

    await expect(
      publishAuthorizedScheduledTaskNotification(
        { owner: OWNER_A },
        { isEnabled: async () => true, isOwnerRetired: () => false, publish },
      ),
    ).resolves.toBe(true);
    expect(publish).toHaveBeenCalledOnce();
  });

  it('refuses a Managed Cloud schedule whose owner could not be resolved', async () => {
    const publish = vi.fn();
    const isEnabled = vi.fn(async () => true);

    await expect(
      publishAuthorizedScheduledTaskNotification(
        { boundAccountId: 'account-a' },
        { isEnabled, isOwnerRetired: () => false, publish },
      ),
    ).resolves.toBe(false);
    expect(publish).not.toHaveBeenCalled();
    // The refusal is decided before the storage read, so a signed-out alarm
    // period costs nothing beyond the fence check.
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it('still publishes a device-local schedule that has no account binding', async () => {
    const publish = vi.fn();

    await expect(
      publishAuthorizedScheduledTaskNotification(
        {},
        { isEnabled: async () => true, isOwnerRetired: () => false, publish },
      ),
    ).resolves.toBe(true);
    expect(publish).toHaveBeenCalledOnce();
  });
});

/**
 * The alarm handler is the only production entry point into this fence:
 * `chrome.alarms.onAlarm` -> `executeScheduledTask` -> the notification calls
 * below. background.ts is a side-effecting service-worker module that cannot be
 * imported into jsdom, so the wiring is asserted against its source.
 */
describe('executeScheduledTask notification wiring', () => {
  const executeStart = backgroundSource.indexOf('async function executeScheduledTask(');
  const executeSource = backgroundSource.slice(
    executeStart,
    backgroundSource.indexOf('\n// EXT-1, EXT-2', executeStart),
  );

  it('reaches the fence from the chrome.alarms entry point', () => {
    expect(backgroundSource).toContain('chrome.alarms.onAlarm.addListener');
    expect(backgroundSource).toContain('await executeScheduledTask(task, expectedGeneration)');
    expect(executeStart).toBeGreaterThan(-1);
    expect(executeSource).not.toBe('');
  });

  it('passes the schedule binding on every ownerless failure notification', () => {
    // "Task Paused" and "Task Continuing" are raised by throws that happen
    // before the credential resolves, so managedExecutionOwner is undefined
    // exactly when the authorizing account is signed out or replaced.
    for (const marker of ["'Task Paused'", "'Task Continuing'"]) {
      const noticeStart = executeSource.lastIndexOf(
        'publishAuthorizedScheduledTaskNotification',
        executeSource.indexOf(marker),
      );
      expect(noticeStart).toBeGreaterThan(-1);
      expect(executeSource.slice(noticeStart, executeSource.indexOf(marker))).toContain(
        'boundAccountId: task.managedCloudAccountId',
      );
    }
  });

  it('passes the schedule binding when a run fails before its credential resolves', () => {
    const failStart = executeSource.lastIndexOf('await notifyScheduledTaskFailed(');
    expect(failStart).toBeGreaterThan(-1);
    expect(executeSource.slice(failStart)).toContain('task.managedCloudAccountId');
  });
});
