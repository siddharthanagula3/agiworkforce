/* eslint-disable @typescript-eslint/no-require-imports */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

const mockPush = jest.fn();
const mockFetchUsageSnapshot = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(() => cb(), [cb]);
  },
}));

jest.mock('../services/usage', () => ({
  fetchUsageSnapshot: () => mockFetchUsageSnapshot(),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

import {
  exhaustedUsageRecoveryFromSnapshot,
  useWorkUsageLimit,
} from '../src/features/chat/hooks/useWorkUsageLimit';
import { useCloudUsageStore } from '../src/features/settings/cloud-usage/store';
import { useAuthStore } from '../src/features/auth/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { UsageSnapshot } from '../services/usage';

type Credits = NonNullable<UsageSnapshot['credits']>;
const OWNER = 'usage-limit-owner';

function snapshot(
  overrides: Partial<UsageSnapshot> = {},
  credits: Partial<Credits> = {},
): UsageSnapshot {
  const window = { allowance: 100, used: 100, remaining: 0, reset_at: null };
  return {
    planTier: 'pro',
    usagePercentage: 40,
    usageResetAt: null,
    hasUsageRemaining: false,
    periodStart: null,
    periodEnd: null,
    subscriptionStatus: 'active',
    sessionUsagePercentage: 100,
    sessionResetAt: null,
    weeklyUsagePercentage: 60,
    weeklyResetAt: null,
    flagshipWeeklyUsagePercentage: 0,
    flagshipWeeklyResetAt: null,
    usageAllocation: 'provisioned',
    credits: {
      monthly: window,
      weekly: window,
      five_hour: window,
      flagship_weekly: null,
      purchased: { remaining: 0, overage_enabled: false },
      bonus: null,
      ...credits,
    } as Credits,
    ...overrides,
  };
}

describe('exhausted usage from a mobile usage snapshot', () => {
  it('blocks a paid plan with nothing left and offers Add credits', () => {
    expect(exhaustedUsageRecoveryFromSnapshot(snapshot())).toBe('add_credits');
  });

  it('stops blocking once the exhausted window has reset', () => {
    const resetAt = new Date(Date.now() - 60_000).toISOString();
    expect(exhaustedUsageRecoveryFromSnapshot(snapshot({ sessionResetAt: resetAt }))).toBeNull();
  });

  it('never blocks a just-subscribed account whose allocation is pending', () => {
    expect(exhaustedUsageRecoveryFromSnapshot(snapshot({ usageAllocation: 'pending' }))).toBeNull();
  });

  it('asks to turn on usage credits when bought credits are switched off', () => {
    expect(
      exhaustedUsageRecoveryFromSnapshot(
        snapshot({}, { purchased: { remaining: 25, overage_enabled: false } }),
      ),
    ).toBe('enable_usage_credits');
  });
});

describe('useWorkUsageLimit', () => {
  let appStateListener: ((state: AppStateStatus) => void) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount(OWNER);
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: OWNER });
    useCloudUsageStore.getState().clear();
    appStateListener = undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener as (state: AppStateStatus) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('re-reads usage when the app becomes active and unblocks once usage is back', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(snapshot());
    const { result } = renderHook(() => useWorkUsageLimit({ metered: true }));
    await waitFor(() => expect(result.current.exhaustedRecovery).toBe('add_credits'));

    mockFetchUsageSnapshot.mockResolvedValue(snapshot({ hasUsageRemaining: true }));
    const callsBefore = mockFetchUsageSnapshot.mock.calls.length;
    await act(async () => {
      appStateListener?.('active');
    });

    expect(mockFetchUsageSnapshot.mock.calls.length).toBeGreaterThan(callsBefore);
    await waitFor(() => expect(result.current.exhaustedRecovery).toBeNull());
  });

  it('does not block while the latest usage read failed', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(snapshot());
    const { result } = renderHook(() => useWorkUsageLimit({ metered: true }));
    await waitFor(() => expect(result.current.exhaustedRecovery).toBe('add_credits'));

    mockFetchUsageSnapshot.mockRejectedValue(new Error('offline'));
    await act(async () => {
      appStateListener?.('active');
    });

    await waitFor(() => expect(useCloudUsageStore.getState().error).not.toBeNull());
    expect(result.current.exhaustedRecovery).toBeNull();
  });

  it('labels the recovery Turn on usage credits when bought credits are off', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(
      snapshot({}, { purchased: { remaining: 25, overage_enabled: false } }),
    );
    const { result } = renderHook(() => useWorkUsageLimit({ metered: true }));
    await waitFor(() => expect(result.current.exhaustedRecovery).toBe('enable_usage_credits'));
    expect(result.current.actionLabel).toBe('Turn on usage credits');
  });

  it('shows no warning and blocks nothing while the allocation is pending', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(snapshot({ usageAllocation: 'pending' }));
    const { result } = renderHook(() => useWorkUsageLimit({ metered: true }));
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(result.current.warning).toBeNull();
    expect(result.current.exhaustedRecovery).toBeNull();
  });

  it('reads nothing and listens to nothing when not metered', async () => {
    renderHook(() => useWorkUsageLimit({ metered: false }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetchUsageSnapshot).not.toHaveBeenCalled();
    expect(appStateListener).toBeUndefined();
  });
});
