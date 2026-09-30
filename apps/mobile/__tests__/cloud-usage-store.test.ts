import { useCloudUsageStore } from '../src/features/settings/cloud-usage/store';

const mockFetchUsageSnapshot = jest.fn();
let mockAccountOwner: string | null = 'user-a';
let mockAccountEpoch = 1;

jest.mock('@/services/usage', () => ({
  fetchUsageSnapshot: (...args: unknown[]) => mockFetchUsageSnapshot(...args),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () =>
    mockAccountOwner ? { ownerId: mockAccountOwner, epoch: mockAccountEpoch } : null,
  isCloudAccountEpochCurrent: (account: { ownerId: string; epoch: number }) =>
    account.ownerId === mockAccountOwner && account.epoch === mockAccountEpoch,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function usage(percentage: number) {
  return {
    planTier: 'pro',
    usagePercentage: percentage,
    usageResetAt: '2026-10-01T00:00:00Z',
    hasUsageRemaining: true,
    periodStart: null,
    periodEnd: null,
    subscriptionStatus: 'active',
    sessionUsagePercentage: 0,
    sessionResetAt: null,
    weeklyUsagePercentage: 0,
    weeklyResetAt: null,
    flagshipWeeklyUsagePercentage: 0,
    flagshipWeeklyResetAt: null,
    credits: null,
  };
}

describe('Cloud usage account scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountOwner = 'user-a';
    mockAccountEpoch = 1;
    useCloudUsageStore.getState().clear();
  });

  it('keeps a late response from the previous account out of the current account', async () => {
    const first = deferred<ReturnType<typeof usage>>();
    mockFetchUsageSnapshot.mockReturnValueOnce(first.promise).mockResolvedValueOnce(usage(7));

    const accountA = useCloudUsageStore.getState().refresh();
    mockAccountOwner = 'user-b';
    mockAccountEpoch = 2;
    const accountB = useCloudUsageStore.getState().refresh();
    await accountB;
    first.resolve(usage(99));
    await accountA;

    expect(useCloudUsageStore.getState().ownerId).toBe('user-b');
    expect(useCloudUsageStore.getState().snapshot?.usagePercentage).toBe(7);
  });

  it('coalesces duplicate reads and cannot restore usage after account teardown', async () => {
    const pending = deferred<ReturnType<typeof usage>>();
    mockFetchUsageSnapshot.mockReturnValueOnce(pending.promise);

    const first = useCloudUsageStore.getState().refresh();
    const duplicate = useCloudUsageStore.getState().refresh();
    expect(mockFetchUsageSnapshot).toHaveBeenCalledTimes(1);
    expect(duplicate).toBe(first);

    mockAccountOwner = null;
    useCloudUsageStore.getState().clear();
    pending.resolve(usage(25));
    await first;

    expect(useCloudUsageStore.getState().ownerId).toBeNull();
    expect(useCloudUsageStore.getState().snapshot).toBeNull();
  });
});
