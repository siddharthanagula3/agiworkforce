import { describe, expect, it, vi } from 'vitest';
import {
  publishAuthorizedScheduledTaskNotification,
  scheduledTaskNotificationAuthority,
} from '../src/features/background/scheduled-task-notifications';

const OWNER_A = { accountId: 'account-a', authIncarnation: 'session-a' } as const;

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

describe('scheduledTaskNotificationAuthority feeding the fence', () => {
  function fence(authority: Parameters<typeof publishAuthorizedScheduledTaskNotification>[0]) {
    const publish = vi.fn();
    const isEnabled = vi.fn(async () => true);
    return {
      publish,
      isEnabled,
      published: publishAuthorizedScheduledTaskNotification(authority, {
        isEnabled,
        isOwnerRetired: () => false,
        publish,
      }),
    };
  }

  it('refuses an account-bound schedule when execution never resolved its owner', async () => {
    const run = fence(
      scheduledTaskNotificationAuthority({
        schedule: { managedCloudAccountId: 'account-a' },
        resolvedOwner: undefined,
      }),
    );

    await expect(run.published).resolves.toBe(false);
    expect(run.publish).not.toHaveBeenCalled();
    expect(run.isEnabled).not.toHaveBeenCalled();
  });

  it('publishes a device-local schedule whose run failed without any owner', async () => {
    const run = fence(scheduledTaskNotificationAuthority({ schedule: {} }));

    await expect(run.published).resolves.toBe(true);
    expect(run.publish).toHaveBeenCalledOnce();
  });

  it('publishes an account-bound schedule once execution resolved its owner', async () => {
    const run = fence(
      scheduledTaskNotificationAuthority({
        schedule: { managedCloudAccountId: 'account-a' },
        resolvedOwner: OWNER_A,
      }),
    );

    await expect(run.published).resolves.toBe(true);
    expect(run.publish).toHaveBeenCalledOnce();
  });

  it('carries the abort signal through, so a cancelled lease still wins', async () => {
    const controller = new AbortController();
    controller.abort();
    const run = fence(
      scheduledTaskNotificationAuthority({
        schedule: {},
        resolvedOwner: OWNER_A,
        signal: controller.signal,
      }),
    );

    await expect(run.published).resolves.toBe(false);
    expect(run.publish).not.toHaveBeenCalled();
  });
});
