
/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { managedUsageBucketLabel } from '@agiworkforce/types';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockAuthState = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'user-a' as string | null,
};
let mockAccountOwner = 'user-a';
let mockAccountEpoch = 1;

jest.mock('expo-router', () => ({
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
  };
});

jest.mock('@/src/features/settings/common', () => {
  const RN = require('react-native');
  return {
    SettingsScreenShell: ({ children }: { children: React.ReactNode }) => (
      <RN.View>{children}</RN.View>
    ),
    SettingsInfo: () => <RN.View />,
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

jest.mock('@/lib/safeOpenURL', () => ({ openExternalUrl: jest.fn() }));

const mockFetchUsageSnapshot = jest.fn();
jest.mock('@/services/usage', () => ({
  fetchUsageSnapshot: (...args: unknown[]) => mockFetchUsageSnapshot(...args),
}));

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { usageDashboard: true } }));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: mockAccountOwner, epoch: mockAccountEpoch }),
  isCloudAccountEpochCurrent: (snapshot: { ownerId: string; epoch: number }) =>
    snapshot.ownerId === mockAccountOwner && snapshot.epoch === mockAccountEpoch,
}));

import CloudUsageScreen from '../src/features/settings/cloud-usage/index';
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

describe('Cloud Usage screen — percentage-first (Claude-style), real endpoint', () => {
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

  it('shows usage as a percentage, never a dollar figure, on the primary card', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(snap({ planTier: 'pro', usagePercentage: 25 }));

    const { getByText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('25% used')).toBeTruthy();
    });
    expect(getByText('Pro plan')).toBeTruthy();
    expect(queryByText(/\$\d/)).toBeNull();
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

  it('uses the canonical Max 15x plan label instead of collapsing Max tiers', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(snap({ planTier: 'max_15x', usagePercentage: 40 }));

    const { getByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText('Max 15x plan')).toBeTruthy();
    });
  });

  it('renders the period bar for a free tier from its percentage and reset', async () => {
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

    const { getByText, queryByText } = render(<CloudUsageScreen />);

    await waitFor(() => {
      expect(getByText(managedUsageBucketLabel('period'))).toBeTruthy();
    });
    expect(getByText('10% used')).toBeTruthy();
    expect(getByText('Free plan')).toBeTruthy();
    expect(queryByText(/\$\d/)).toBeNull();
  });
});

describe('Cloud Usage screen — session (rolling 5h) + weekly limits', () => {
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

  it('hides Current session and Weekly limits when their windows are inactive (free tier)', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(
      snap({
        planTier: 'free',
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

describe('Cloud Usage screen — blocked by Local Mode', () => {
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

describe('Cloud Usage screen — signed-out gate', () => {
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
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
  });
});
