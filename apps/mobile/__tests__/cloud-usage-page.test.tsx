/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { managedUsageBucketLabel } from '@agiworkforce/types';
import { lightColors } from '../src/ui/theme/tokens';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

const mockPush = jest.fn();
const mockAuthState = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'user-a' as string | null,
};
let mockAccountOwner = 'user-a';
let mockAccountEpoch = 1;

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.lightColors,
  };
});

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return {
    BarChart3: Icon,
    RefreshCw: Icon,
    CloudOff: Icon,
    Coins: Icon,
  };
});

jest.mock('@/src/features/settings/common', () => {
  const RN = require('react-native');
  return {
    SettingsScreenShell: ({ children }: { children: React.ReactNode }) => (
      <RN.View>{children}</RN.View>
    ),
    SettingsInfo: () => <RN.View />,
    SettingsGroup: ({ children }: { children: React.ReactNode }) => <RN.View>{children}</RN.View>,
    SettingsRow: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <RN.Pressable accessibilityLabel={label} onPress={onPress}>
        <RN.Text>{label}</RN.Text>
      </RN.Pressable>
    ),
    CloudSyncBlockedBanner: ({ onSwitchToCloud }: { onSwitchToCloud: () => void }) => (
      <RN.Pressable accessibilityLabel="Switch to AGI Cloud" onPress={onSwitchToCloud}>
        <RN.Text>Chat is set to Local Mode</RN.Text>
      </RN.Pressable>
    ),
    CloudAccountRequired: ({
      isLoading,
      onSignIn,
    }: {
      isLoading: boolean;
      onSignIn: () => void;
    }) =>
      isLoading ? (
        <RN.Text>Checking AGI Cloud account…</RN.Text>
      ) : (
        <RN.Pressable accessibilityLabel="Sign in to AGI Cloud" onPress={onSignIn}>
          <RN.Text>Sign in to AGI Cloud</RN.Text>
        </RN.Pressable>
      ),
  };
});

const mockFetchUsageSnapshot = jest.fn();
const mockApplyLimitReset = jest.fn();
jest.mock('@/services/usage', () => ({
  applyLimitReset: (...args: unknown[]) => mockApplyLimitReset(...args),
  fetchUsageSnapshot: (...args: unknown[]) => mockFetchUsageSnapshot(...args),
  fetchUsageAllowances: () => new Promise(() => undefined),
  fetchUsageHistory: () => new Promise(() => undefined),
}));

const mockFetchIapCatalog = jest.fn();
jest.mock('@/src/features/billing/mobileIapService', () => ({
  fetchMobileIapCatalog: (...args: unknown[]) => mockFetchIapCatalog(...args),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: mockAccountOwner, epoch: mockAccountEpoch }),
  isCloudAccountEpochCurrent: (snapshot: { ownerId: string; epoch: number }) =>
    snapshot.ownerId === mockAccountOwner && snapshot.epoch === mockAccountEpoch,
}));

import CloudUsageScreen from '../src/features/settings/cloud-usage/index';
import { useCloudUsageStore } from '../src/features/settings/cloud-usage/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

function snap(overrides: Record<string, unknown> = {}) {
  return {
    planTier: 'pro',
    usagePercentage: 25,
    usageResetAt: '2026-08-01T00:00:00.000Z',
    hasUsageRemaining: true,
    periodStart: '2026-07-01T00:00:00.000Z',
    periodEnd: '2026-08-01T00:00:00.000Z',
    subscriptionStatus: 'active',
    sessionUsagePercentage: 0,
    sessionResetAt: null,
    weeklyUsagePercentage: 0,
    weeklyResetAt: null,
    flagshipWeeklyUsagePercentage: 0,
    flagshipWeeklyResetAt: null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('Cloud Usage screen, percentage-first (Claude-style), real endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockAuthState, {
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user-a',
    });
    mockAccountOwner = 'user-a';
    mockAccountEpoch = 1;
    useCloudUsageStore.getState().clear();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockFetchIapCatalog.mockResolvedValue({ enabled: true, products: [{ kind: 'top_up' }] });
  });

  it('shows usage as a percentage, never a dollar figure, on the primary card', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(snap({ planTier: 'pro', usagePercentage: 25 }));

    const { getByText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('25% used')).toBeTruthy();
    });
    expect(getByText('Pro plan')).toBeTruthy();
    expect(queryByText(/\$\d/)).toBeNull();
  });

  it.each([
    [40, lightColors.teal],
    [91, lightColors.agentWarning],
    [97, lightColors.agentError],
  ])('paints the meter at %i%% with the shared urgency colour', async (percent, expected) => {
    mockFetchUsageSnapshot.mockResolvedValue(snap({ planTier: 'pro', usagePercentage: percent }));

    const { getAllByTestId } = render(<CloudUsageScreen />);

    await waitFor(() => expect(getAllByTestId('usage-meter-fill').length).toBeGreaterThan(0));
    const fill = StyleSheet.flatten(getAllByTestId('usage-meter-fill')[0].props.style);
    expect(fill.backgroundColor).toBe(expected);
    expect(fill.width).toBe(`${percent}%`);
  });

  it('keeps server diagnostics private and recovers on retry', async () => {
    mockFetchUsageSnapshot
      .mockRejectedValueOnce(new Error('private usage route at /internal/billing'))
      .mockResolvedValueOnce(snap({ usagePercentage: 12 }));

    const screen = render(<CloudUsageScreen />);
    await waitFor(() =>
      expect(
        screen.getByText('Could not load usage. Retry to see your current plan and limits.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/private usage route/)).toBeNull();

    fireEvent.press(screen.getByLabelText('Retry loading usage'));
    await waitFor(() => expect(screen.getByText('12% used')).toBeTruthy());
    expect(
      screen.queryByText('Could not load usage. Retry to see your current plan and limits.'),
    ).toBeNull();
  });

  it('does not render an account-A usage response after switching to account B', async () => {
    const accountAResponse = deferred<ReturnType<typeof snap>>();
    mockFetchUsageSnapshot
      .mockReturnValueOnce(accountAResponse.promise)
      .mockResolvedValueOnce(snap({ usagePercentage: 7 }));
    const screen = render(<CloudUsageScreen />);
    await waitFor(() => expect(mockFetchUsageSnapshot).toHaveBeenCalledTimes(1));

    mockAccountOwner = 'user-b';
    mockAccountEpoch = 2;
    mockAuthState.clerkUserId = 'user-b';
    screen.rerender(<CloudUsageScreen />);
    accountAResponse.resolve(snap({ usagePercentage: 99 }));

    await waitFor(() => expect(screen.getByText('7% used')).toBeTruthy());
    expect(screen.queryByText('99% used')).toBeNull();
  });

  it('never exposes an exact-dollar Details section (the retired private leak)', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(snap({ planTier: 'basic', usagePercentage: 25 }));

    const { getByText, queryByText, queryByLabelText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('25% used')).toBeTruthy();
    });
    expect(queryByLabelText('Show usage details')).toBeNull();
    expect(queryByText('Details')).toBeNull();
    expect(queryByText(/\$\d/)).toBeNull();
  });

  it('labels the max_15x tier with its canonical Max 20x name instead of collapsing Max tiers', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(snap({ planTier: 'max_15x', usagePercentage: 40 }));

    const { getByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('Max 20x plan')).toBeTruthy();
    });
  });

  it('shows a free account only the upgrade prompt and no usage meters', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(
      snap({
        planTier: 'free',
        usagePercentage: 10,
        usageResetAt: '2026-07-20T00:00:00.000Z',
        periodStart: null,
        periodEnd: null,
        subscriptionStatus: 'none',
      }),
    );

    const { getByText, getByLabelText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('Upgrade for higher capacity')).toBeTruthy();
    });
    expect(queryByText(managedUsageBucketLabel('period'))).toBeNull();
    expect(queryByText('10% used')).toBeNull();
    expect(queryByText('Free plan')).toBeNull();
    expect(queryByText('Weekly limits')).toBeNull();
    expect(queryByText(/\$\d/)).toBeNull();

    fireEvent.press(getByLabelText('Upgrade'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/cloud-billing');
    expect(queryByText('Buy credits')).toBeNull();
    expect(mockFetchIapCatalog).not.toHaveBeenCalled();
  });
});

describe('Cloud Usage screen, Buy credits row', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockAuthState, {
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user-a',
    });
    mockAccountOwner = 'user-a';
    mockAccountEpoch = 1;
    useCloudUsageStore.getState().clear();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockFetchUsageSnapshot.mockResolvedValue(snap({ planTier: 'pro' }));
  });

  it('opens the store top-up purchase when the store sells top-ups', async () => {
    mockFetchIapCatalog.mockResolvedValue({ enabled: true, products: [{ kind: 'top_up' }] });
    const { findByLabelText } = render(<CloudUsageScreen />);

    fireEvent.press(await findByLabelText('Buy credits'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/cloud-billing');
  });

  it.each([
    ['the catalog leaves top-ups out, as in Japan', { enabled: true, products: [] }],
    [
      'native purchases are off',
      { enabled: false, products: [{ kind: 'top_up' }], unavailableReason: 'off' },
    ],
  ])('shows no Buy credits row when %s', async (_name, catalog) => {
    mockFetchIapCatalog.mockResolvedValue(catalog);
    const { getByText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => expect(getByText(managedUsageBucketLabel('period'))).toBeTruthy());
    await waitFor(() => expect(mockFetchIapCatalog).toHaveBeenCalled());
    expect(queryByText('Buy credits')).toBeNull();
  });

  it('shows no Buy credits row when the catalog cannot be read', async () => {
    mockFetchIapCatalog.mockRejectedValue(new Error('offline'));
    const { getByText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => expect(getByText(managedUsageBucketLabel('period'))).toBeTruthy());
    await waitFor(() => expect(mockFetchIapCatalog).toHaveBeenCalled());
    expect(queryByText('Buy credits')).toBeNull();
  });
});

describe('Cloud Usage screen, session (rolling 5h) + weekly limits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockAuthState, {
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user-a',
    });
    mockAccountOwner = 'user-a';
    mockAccountEpoch = 1;
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('shows Current session and Weekly limits (All models + Flagship) for a paid tier', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(
      snap({
        planTier: 'pro',
        usagePercentage: 25,
        sessionUsagePercentage: 43,
        sessionResetAt: new Date(Date.now() + 3 * 60 * 60 * 1000 + 27 * 60 * 1000).toISOString(),
        weeklyUsagePercentage: 85,
        weeklyResetAt: '2026-07-22T18:00:00.000Z',
        flagshipWeeklyUsagePercentage: 29,
        flagshipWeeklyResetAt: '2026-07-22T18:00:00.000Z',
      }),
    );

    const { getByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText(managedUsageBucketLabel('session'))).toBeTruthy();
    });
    expect(getByText('43% used')).toBeTruthy();
    expect(getByText(/Resets in 3 hr/)).toBeTruthy();

    expect(getByText('Weekly limits')).toBeTruthy();
    expect(getByText(managedUsageBucketLabel('weekly'))).toBeTruthy();
    expect(getByText(managedUsageBucketLabel('weeklyFlagship'))).toBeTruthy();
    expect(getByText('85% used')).toBeTruthy();
    expect(getByText('29% used')).toBeTruthy();
  });

  it('captions every meter with a reset countdown rather than a weekday', async () => {
    const inSeventeenHours = new Date(
      Date.now() + 17 * 60 * 60 * 1000 + 21 * 60 * 1000 + 30 * 1000,
    ).toISOString();
    mockFetchUsageSnapshot.mockResolvedValue(
      snap({
        planTier: 'pro',
        usagePercentage: 25,
        sessionUsagePercentage: 2,
        sessionResetAt: new Date(
          Date.now() + 3 * 60 * 60 * 1000 + 51 * 60 * 1000 + 30 * 1000,
        ).toISOString(),
        weeklyUsagePercentage: 83,
        weeklyResetAt: inSeventeenHours,
        flagshipWeeklyUsagePercentage: 100,
        flagshipWeeklyResetAt: inSeventeenHours,
      }),
    );

    const { getByText, getAllByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('Weekly limits')).toBeTruthy();
    });
    expect(getByText('Resets in 3 hr 51 min')).toBeTruthy();
    expect(getAllByText('Resets in 17 hr 21 min')).toHaveLength(2);
  });

  it('hides Current session and Weekly limits when their windows are inactive', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(
      snap({
        planTier: 'pro',
        usagePercentage: 0,
        periodStart: null,
        periodEnd: null,
        subscriptionStatus: 'none',
      }),
    );

    const { getByText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText(managedUsageBucketLabel('period'))).toBeTruthy();
    });
    expect(queryByText(managedUsageBucketLabel('session'))).toBeNull();
    expect(queryByText('Weekly limits')).toBeNull();
  });
});

describe('Cloud Usage screen, blocked by Local Mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockAuthState, {
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user-a',
    });
    mockAccountOwner = 'user-a';
    mockAccountEpoch = 1;
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('shows the Local Mode banner instead of fetching, and never calls fetchUsageSnapshot', async () => {
    const { getByText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('Chat is set to Local Mode')).toBeTruthy();
    });
    expect(mockFetchUsageSnapshot).not.toHaveBeenCalled();
    expect(queryByText('% used')).toBeNull();
  });

  it('fetches usage as soon as the user switches to Cloud mode via the banner', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(snap({ planTier: 'pro', usagePercentage: 25 }));

    const { getByText, getByLabelText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('Chat is set to Local Mode')).toBeTruthy();
    });
    expect(mockFetchUsageSnapshot).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText('Switch to AGI Cloud'));

    await waitFor(() => {
      expect(getByText('25% used')).toBeTruthy();
    });
    expect(queryByText('Chat is set to Local Mode')).toBeNull();
    expect(mockFetchUsageSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe('Cloud Usage screen, signed-out gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockAuthState, {
      isClerkLoaded: true,
      isClerkSignedIn: false,
      clerkUserId: null,
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('does not fetch usage and routes the explicit CTA to sign-in', () => {
    const { getByLabelText, queryByText } = render(<CloudUsageScreen />);

    expect(getByLabelText('Sign in to AGI Cloud')).toBeTruthy();
    expect(queryByText('% used')).toBeNull();
    expect(mockFetchUsageSnapshot).not.toHaveBeenCalled();
    fireEvent.press(getByLabelText('Sign in to AGI Cloud'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { postAuthIntent: 'cloud-usage' },
    });
  });
});

describe('Cloud Usage screen, resets and limit uplifts', () => {
  const GRANT = '6f1c2a54-1b8a-4c3e-9d0f-2a7b8c9d0e1f';

  function promotions(over: Record<string, unknown> = {}) {
    return {
      resets: {
        available: 1,
        grants: [{ grant_id: GRANT, expires_at: '2026-11-20T00:00:00.000Z' }],
        can_apply: true,
        last_applied_at: null,
        ...over,
      },
      uplifts: [
        {
          promotion_id: 'code-week',
          percent: 50,
          windows: ['weekly'],
          workloads: ['code'],
          ends_at: '2026-10-31T12:00:00.000Z',
        },
      ],
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockAuthState, {
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user-a',
    });
    mockAccountOwner = 'user-a';
    mockAccountEpoch = 1;
    useCloudUsageStore.getState().clear();
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('shows no resets card while promotions are switched off', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(snap({ limitPromotions: null }));
    const { findByText, queryByText } = render(<CloudUsageScreen />);
    await findByText(/% used/);
    expect(queryByText('Resets')).toBeNull();
  });

  it('uses a reset only after the confirmation and reloads usage', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(snap({ limitPromotions: promotions() }));
    mockApplyLimitReset.mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { findByText, getByText, getByTestId } = render(<CloudUsageScreen />);

    expect(await findByText('1 reset available')).toBeTruthy();
    expect(getByTestId('usage-uplift').props.children).toMatch(
      /^Weekly limit \+50% for AGI Code until /,
    );
    fireEvent.press(getByText('Use reset'));
    expect(mockApplyLimitReset).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Use your reset?',
      expect.stringMatching(/cannot be undone/),
      expect.any(Array),
    );

    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === 'Use reset')!.onPress!();
    await waitFor(() => expect(mockApplyLimitReset).toHaveBeenCalledWith(GRANT));
    await waitFor(() => expect(mockFetchUsageSnapshot).toHaveBeenCalledTimes(2));
    alert.mockRestore();
  });

  it('says there is no reset and offers nothing to press', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(
      snap({ limitPromotions: promotions({ available: 0, grants: [], can_apply: false }) }),
    );
    const { findByText, queryByText } = render(<CloudUsageScreen />);
    expect(await findByText('No resets right now')).toBeTruthy();
    expect(queryByText('Use reset')).toBeNull();
  });
});
