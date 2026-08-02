import { describe, expect, it, vi } from 'vitest';
import { publishAuthorizedScheduledTaskNotification } from '../src/features/background/scheduled-task-notifications';

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
});
