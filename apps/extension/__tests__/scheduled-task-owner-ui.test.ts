import { describe, expect, it } from 'vitest';
import { ManagedCloudOwnerRequestFence } from '../src/features/side-panel/managed-owner-request-fence';
import type { ManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';

const OWNER_A = { accountId: 'account-a', authIncarnation: 'session-a' } as const;
const OWNER_B = { accountId: 'account-b', authIncarnation: 'session-b' } as const;

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('scheduled-task side-panel owner fence', () => {
  it('discards a delayed account A list after the panel transitions to account B', async () => {
    const fence = new ManagedCloudOwnerRequestFence();
    let currentOwner: ManagedCloudOwner | null = OWNER_A;
    const delayedA = deferred<string[]>();
    const immediateB = deferred<string[]>();
    const rendered: string[][] = [];

    const renderWhenCurrent = async (
      snapshot: ReturnType<ManagedCloudOwnerRequestFence['begin']>,
      response: Promise<string[]>,
    ): Promise<void> => {
      const rows = await response;
      if (fence.isCurrent(snapshot, currentOwner)) rendered.push(rows);
    };

    const requestA = fence.begin(currentOwner);
    const pendingA = renderWhenCurrent(requestA, delayedA.promise);

    fence.invalidate();
    currentOwner = OWNER_B;
    const requestB = fence.begin(currentOwner);
    const pendingB = renderWhenCurrent(requestB, immediateB.promise);
    immediateB.resolve(['B task']);
    await pendingB;
    delayedA.resolve(['A private task']);
    await pendingA;

    expect(rendered).toEqual([['B task']]);
  });

  it('rejects an older response for the same owner and a replacement session', () => {
    const fence = new ManagedCloudOwnerRequestFence();
    const first = fence.begin(OWNER_A);
    const newer = fence.begin(OWNER_A);

    expect(fence.isCurrent(first, OWNER_A)).toBe(false);
    expect(fence.isCurrent(newer, OWNER_A)).toBe(true);
    expect(fence.isCurrent(newer, { ...OWNER_A, authIncarnation: 'session-a-replacement' })).toBe(
      false,
    );
  });

  it('discards a delayed account A create callback after transition to account B', () => {
    const fence = new ManagedCloudOwnerRequestFence();
    let currentOwner: ManagedCloudOwner | null = OWNER_A;
    const createA = fence.begin(currentOwner);

    fence.invalidate();
    currentOwner = OWNER_B;

    expect(fence.isCurrent(createA, currentOwner)).toBe(false);
  });
});
