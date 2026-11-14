/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useUser } from '@clerk/expo';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockCloseDrawer = jest.fn();
const mockFetchUsageSnapshot = jest.fn();
const mockShellHelp = jest.fn();

jest.mock('@clerk/expo', () => ({
  useUser: jest.fn().mockReturnValue({ user: null, isLoaded: true }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(false),
  }),
  usePathname: () => '/chat',
  useFocusEffect: (cb: () => void) => {
    const R = require('react');
    R.useEffect(() => cb(), [cb]);
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: { getString: jest.fn().mockReturnValue(undefined), set: jest.fn(), delete: jest.fn() },
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: { getString: jest.fn().mockReturnValue(undefined), set: jest.fn(), delete: jest.fn() },
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('@/services/usage', () => ({
  tightestUsageWindow: jest.requireActual('@/services/usage').tightestUsageWindow,
  applyLimitReset: jest.fn(),
  fetchUsageSnapshot: () => mockFetchUsageSnapshot(),
  fetchUsageAllowances: () => new Promise(() => undefined),
  fetchUsageHistory: () => new Promise(() => undefined),
}));

jest.mock('@/src/features/settings/Common', () => {
  const RN = require('react-native');
  return {
    SettingsScreenShell: ({
      children,
      help,
    }: {
      children: React.ReactNode;
      help?: { label: string };
    }) => {
      mockShellHelp(help);
      return (
        <RN.View>
          {help ? <RN.Text>{help.label}</RN.Text> : null}
          {children}
        </RN.View>
      );
    },
    SettingsInfo: ({ title, body }: { title: string; body: string }) => (
      <RN.View>
        <RN.Text>{title}</RN.Text>
        <RN.Text>{body}</RN.Text>
      </RN.View>
    ),
    SettingsGroup: ({ children }: { children: React.ReactNode }) => <RN.View>{children}</RN.View>,
    SettingsRow: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <RN.Pressable accessibilityLabel={label} onPress={onPress}>
        <RN.Text>{label}</RN.Text>
      </RN.Pressable>
    ),
    CloudSyncBlockedBanner: () => null,
    CloudAccountRequired: () => null,
  };
});

import i18n from '../src/i18n';
import { resources } from '@agiworkforce/i18n';
import { WORK_USAGE_COPY } from '@agiworkforce/types';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import { DrawerContent } from '../src/features/drawer/components/DrawerContent';
import CloudUsageScreen from '../src/features/settings/cloud-usage/index';
import { useCloudUsageStore } from '../src/features/settings/cloud-usage/store';
import { WorkUsageCard } from '../src/features/chat/components/WorkUsageCard';
import { useWorkUsageLimit } from '../src/features/chat/hooks/useWorkUsageLimit';
import { MOBILE_DESTINATIONS } from '../src/features/search/mobileDestinations';
import ProfileScreen from '../app/(app)/profile';
import { useAuthStore } from '../src/features/auth/store';
import { useTierStore } from '../src/features/billing/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { UsageSnapshot } from '../services/usage';

const OWNER = 'no-purchases-owner';
const BILLING = '/(app)/settings/cloud-billing';

function usageSnapshot(overrides: Partial<UsageSnapshot> = {}): UsageSnapshot {
  const window = { allowance: 100, used: 100, remaining: 0, reset_at: null };
  return {
    planTier: 'free',
    usagePercentage: 40,
    usageResetAt: '2099-01-01T00:00:00Z',
    hasUsageRemaining: false,
    periodStart: null,
    periodEnd: null,
    subscriptionStatus: 'none',
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
    },
    ...overrides,
  } as UsageSnapshot;
}

function signIn() {
  __resetCloudAccountSessionForTests();
  activateCloudAccount(OWNER);
  useAuthStore.setState({
    isClerkLoaded: true,
    isClerkSignedIn: true,
    clerkUserId: OWNER,
    isLoading: false,
    isInitialized: true,
  });
  useChatAppModeStore.setState({ appMode: 'cloud' });
}

function pushedBilling() {
  return [...mockPush.mock.calls, ...mockNavigate.mock.calls].some(([route]) => route === BILLING);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchUsageSnapshot.mockResolvedValue(usageSnapshot());
  useCloudUsageStore.getState().clear();
  signIn();
  jest.mocked(useUser).mockReturnValue({
    user: { fullName: 'Test User', primaryEmailAddress: { emailAddress: 'a@b.test' } },
    isLoaded: true,
    isSignedIn: true,
  } as unknown as ReturnType<typeof useUser>);
});

describe('version 1 without in-app purchases', () => {
  it('runs against the real switch value', () => {
    expect(NATIVE_PURCHASES_AVAILABLE).toBe(false);
  });

  it('drawer: a Free account sees no Upgrade row and a paid account sees no usage row', () => {
    useTierStore.setState({ tier: 'free' });
    useCloudUsageStore.setState({ ownerId: OWNER, error: null, snapshot: usageSnapshot() });
    const upgradeLabel = resources.en.common.navUpgrade;
    expect(i18n.t('navUpgrade', { lng: 'en' })).toBe(upgradeLabel);

    const free = render(
      <DrawerContent {...({ navigation: { closeDrawer: mockCloseDrawer } } as never)} />,
    );
    expect(free.queryByLabelText(upgradeLabel)).toBeNull();
    expect(free.queryByText(upgradeLabel)).toBeNull();
    expect(free.queryByText(/Usage remaining/)).toBeNull();
    free.unmount();

    useTierStore.setState({ tier: 'pro' });
    useCloudUsageStore.setState({
      ownerId: OWNER,
      snapshot: usageSnapshot({ planTier: 'pro', hasUsageRemaining: true }),
    });
    const paid = render(
      <DrawerContent {...({ navigation: { closeDrawer: mockCloseDrawer } } as never)} />,
    );
    expect(paid.queryByLabelText(/Usage remaining/)).toBeNull();
    expect(pushedBilling()).toBe(false);
  });

  it('usage screen: Free shows the plan block and how limits work, with no Upgrade, meters or help link', async () => {
    const screen = render(<CloudUsageScreen />);

    await waitFor(() => expect(screen.getByText('Free plan')).toBeTruthy());
    expect(
      screen.getByText('Usage resets every 5 hours, week and month, and varies by model and task.'),
    ).toBeTruthy();
    expect(screen.getByText('How limits work')).toBeTruthy();
    expect(
      screen.getByText('At a limit, Cloud replies pause until reset. Local mode keeps working.'),
    ).toBeTruthy();
    expect(screen.queryByText(/upgrade/i)).toBeNull();
    expect(screen.queryByLabelText('Upgrade')).toBeNull();
    expect(screen.queryByText('Buy credits')).toBeNull();
    expect(screen.queryByText('How usage and credits work')).toBeNull();
    expect(screen.queryByText(/\d+% used/)).toBeNull();
    expect(pushedBilling()).toBe(false);
  });

  it('usage screen: a paid account sees how limits work, with no help link and no Buy credits row', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(
      usageSnapshot({ planTier: 'pro', hasUsageRemaining: true }),
    );
    const screen = render(<CloudUsageScreen />);

    await waitFor(() => expect(mockFetchUsageSnapshot).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('How usage and credits work')).toBeNull();
    expect(screen.queryByText('Buy credits')).toBeNull();
    expect(screen.getByText('How limits work')).toBeTruthy();
    expect(
      screen.getByText(
        'Meters refill when they reset. Larger models and tools use more. At a limit, Cloud replies pause until reset. Local mode keeps working.',
      ),
    ).toBeTruthy();
    expect(pushedBilling()).toBe(false);
  });

  it.each(['upgrade', 'add_credits', 'enable_usage_credits', 'wait'] as const)(
    'usage card (%s): states the reset and offers no action',
    (recovery) => {
      const card = render(<WorkUsageCard recovery={recovery} />);

      expect(card.getByText(WORK_USAGE_COPY.title)).toBeTruthy();
      expect(card.getByText('Wait for your usage to reset.')).toBeTruthy();
      expect(card.queryByRole('button')).toBeNull();
      expect(card.queryByText(/upgrade|credits|billing/i)).toBeNull();
      expect(pushedBilling()).toBe(false);
    },
  );

  it('usage limit hook: an exhausted Free or paid account gets no action label', async () => {
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(
        () => ({ remove: jest.fn() }) as unknown as ReturnType<typeof AppState.addEventListener>,
      );
    for (const planTier of ['free', 'pro']) {
      useCloudUsageStore.getState().clear();
      mockFetchUsageSnapshot.mockResolvedValue(usageSnapshot({ planTier }));
      const { result, unmount } = renderHook(() => useWorkUsageLimit({ metered: true }));
      await waitFor(() => expect(result.current.exhaustedRecovery).not.toBeNull());
      expect(result.current.actionLabel).toBeNull();
      unmount();
    }
    jest.restoreAllMocks();
  });

  it('search: the billing destination is a Plan with no payment or credits keywords', () => {
    const destination = MOBILE_DESTINATIONS.find((item) => item.route === BILLING);
    expect(destination?.title).toBe('Plan');
    expect(destination?.keywords).toEqual(['plan', 'subscription']);
    expect(MOBILE_DESTINATIONS.some((item) => item.title === 'Billing')).toBe(false);
  });

  it('profile: Subscription reads Details and still opens the plan screen', () => {
    const profile = render(<ProfileScreen />);

    expect(profile.getByText('Details')).toBeTruthy();
    fireEvent.press(profile.getByText('Subscription'));
    expect(mockPush).toHaveBeenCalledWith(BILLING);
  });
});
