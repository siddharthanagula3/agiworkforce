/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockFetchInstallations = jest.fn();
const mockDisconnect = jest.fn();
const mockStartInstall = jest.fn();
const mockLoadSessions = jest.fn();
const mockAccess = { ready: true };
const mockSessions: {
  status: 'loading' | 'ready' | 'error';
  availability: {
    deploymentEnabled: boolean;
    planEntitled: boolean;
    planTier: string;
    maxSessions: number;
  } | null;
} = { status: 'ready', availability: null };

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { companion: false } }));

jest.mock('@/src/features/cloud-code/useCloudCodeAccess', () => ({
  useCloudCodeAccess: () => ({
    ready: mockAccess.ready,
    signedIn: true,
    accountKey: 'user_test',
    activate: jest.fn(),
  }),
}));

jest.mock('@/src/features/cloud-code/useCloudCodeSessions', () => ({
  useCloudCodeSessions: () => ({
    status: mockSessions.status,
    availability: mockSessions.availability,
    sessions: [],
    runtimes: [],
    error: null,
    refreshing: false,
    load: mockLoadSessions,
  }),
}));

jest.mock('@/src/features/cloud-code/githubInstall', () => ({
  fetchGitHubInstallations: (...args: unknown[]) => mockFetchInstallations(...args),
  disconnectGitHubInstallation: (...args: unknown[]) => mockDisconnect(...args),
  startGitHubInstallInApp: (...args: unknown[]) => mockStartInstall(...args),
}));

jest.mock('@/src/features/cloud-code/service', () => ({
  describeCloudCodeError: (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback,
}));

import CodeSettingsScreen from '@/src/features/settings/code';
import { cloudAgentStatus } from '@/src/features/settings/code/CloudAgentStatus';
import { useCodePreferences } from '@/src/features/settings/code/store';

const AVAILABLE = { deploymentEnabled: true, planEntitled: true, planTier: 'free', maxSessions: 3 };
const ORG = { installation_id: 11, account_login: 'acme-inc', account_type: 'Organization' };
const PERSON = { installation_id: 12, account_login: 'octo', account_type: 'User' };

describe('cloud agent status', () => {
  it.each([
    [AVAILABLE, false, 'available', 'Available'],
    [
      { ...AVAILABLE, deploymentEnabled: false },
      false,
      'unavailable',
      'Not available on this server',
    ],
    [{ ...AVAILABLE, planEntitled: false }, false, 'unavailable', 'Not included in your account'],
    [
      { ...AVAILABLE, deploymentEnabled: false, planEntitled: false },
      false,
      'unavailable',
      'Not available on this server',
    ],
    [AVAILABLE, true, 'unknown', 'Status unavailable'],
    [null, false, 'unknown', 'Status unavailable'],
  ] as const)('maps %j with failed=%s to %s', (availability, failed, kind, label) => {
    expect(cloudAgentStatus(availability, failed)).toEqual({ kind, label });
  });
});

describe('code settings connections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.ready = true;
    mockSessions.status = 'ready';
    mockSessions.availability = AVAILABLE;
    mockFetchInstallations.mockResolvedValue([ORG, PERSON]);
    mockDisconnect.mockResolvedValue(undefined);
    mockStartInstall.mockResolvedValue({ kind: 'dismissed' });
    useCodePreferences.setState({ defaultNetworkAccess: 'trusted' });
  });

  it('hides the whole group outside Cloud, where there is no account to connect', () => {
    mockAccess.ready = false;
    const screen = render(<CodeSettingsScreen />);

    expect(screen.queryByText('Connections')).toBeNull();
    expect(screen.queryByLabelText('Add connection')).toBeNull();
    expect(screen.queryByLabelText(/^Network access/)).toBeNull();
    expect(mockFetchInstallations).not.toHaveBeenCalled();
    expect(screen.getByTestId('code-wrap-long-lines')).toBeTruthy();
  });

  it('shows the Connections group above Wrap long lines', () => {
    const screen = render(<CodeSettingsScreen />);
    const names = screen.toJSON();
    const text = JSON.stringify(names);

    expect(text.indexOf('Connections')).toBeGreaterThan(-1);
    expect(text.indexOf('Connections')).toBeLessThan(text.indexOf('Wrap long lines'));
  });

  it('shows Cloud as available with no switch and no plan wording', () => {
    const screen = render(<CodeSettingsScreen />);

    expect(screen.getByLabelText('Cloud. Available')).toBeTruthy();
    expect(screen.queryByLabelText(/upgrade|plan|buy/i)).toBeNull();
  });

  it('shows Cloud as not available on this server', () => {
    mockSessions.availability = { ...AVAILABLE, deploymentEnabled: false };
    const screen = render(<CodeSettingsScreen />);

    expect(screen.getByLabelText('Cloud. Not available on this server')).toBeTruthy();
  });

  it('shows Cloud as not included in the account without steering to a purchase', () => {
    mockSessions.availability = { ...AVAILABLE, planEntitled: false };
    const screen = render(<CodeSettingsScreen />);

    expect(screen.getByLabelText('Cloud. Not included in your account')).toBeTruthy();
  });

  it('shows Status unavailable when the request failed and retries on tap', () => {
    mockSessions.status = 'error';
    mockSessions.availability = null;
    const screen = render(<CodeSettingsScreen />);

    fireEvent.press(screen.getByLabelText('Cloud. Status unavailable. Tap to retry'));

    expect(mockLoadSessions).toHaveBeenCalledWith('initial');
  });

  it('lists each linked account with its kind', async () => {
    const screen = render(<CodeSettingsScreen />);

    await waitFor(() => expect(screen.getByText('acme-inc')).toBeTruthy());
    expect(screen.getByText('Organization')).toBeTruthy();
    expect(screen.getByText('octo')).toBeTruthy();
    expect(screen.getByText('Personal')).toBeTruthy();
    expect(screen.getByLabelText('Add connection')).toBeTruthy();
  });

  it('says so when no account is connected and keeps only the Add row', async () => {
    mockFetchInstallations.mockResolvedValue([]);
    const screen = render(<CodeSettingsScreen />);

    await waitFor(() => expect(screen.getByText('No GitHub account connected')).toBeTruthy());
    expect(screen.queryByText(/^Disconnect/)).toBeNull();
    expect(screen.getByLabelText('Add connection')).toBeTruthy();
  });

  it('shows a spinner while loading', () => {
    mockFetchInstallations.mockReturnValue(new Promise(() => undefined));
    const screen = render(<CodeSettingsScreen />);

    expect(screen.getByText('Loading GitHub accounts')).toBeTruthy();
  });

  it('shows a tappable failure line and loads again on tap', async () => {
    mockFetchInstallations.mockRejectedValueOnce(new Error('offline'));
    const screen = render(<CodeSettingsScreen />);

    await waitFor(() => expect(screen.getByTestId('github-connections-retry')).toBeTruthy());
    expect(screen.getByText(/Connections could not be loaded\./)).toBeTruthy();

    fireEvent.press(screen.getByTestId('github-connections-retry'));

    await waitFor(() => expect(screen.getByText('acme-inc')).toBeTruthy());
    expect(mockFetchInstallations).toHaveBeenCalledTimes(2);
  });

  it('asks before disconnecting, naming the consequence, and removes the row after', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<CodeSettingsScreen />);
    await waitFor(() => expect(screen.getByText('acme-inc')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Disconnect acme-inc'));

    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Disconnect acme-inc?',
      'Cloud sessions can no longer clone or push its repositories. You can connect it again later.',
      expect.any(Array),
    );
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Disconnect']);
    expect(buttons[1]?.style).toBe('destructive');

    await act(async () => {
      buttons[1]?.onPress?.();
    });

    expect(mockDisconnect).toHaveBeenCalledWith(11);
    await waitFor(() => expect(screen.queryByText('acme-inc')).toBeNull());
    expect(screen.getByText('octo')).toBeTruthy();
    alertSpy.mockRestore();
  });

  it('keeps the account and says so when the disconnect fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockDisconnect.mockRejectedValue(
      new Error('The GitHub App is still installed on your account.'),
    );
    const screen = render(<CodeSettingsScreen />);
    await waitFor(() => expect(screen.getByText('octo')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Disconnect octo'));
    await act(async () => {
      alertSpy.mock.calls[0]?.[2]?.[1]?.onPress?.();
    });

    expect(screen.getByText('octo')).toBeTruthy();
    expect(screen.getByText('The GitHub App is still installed on your account.')).toBeTruthy();
    alertSpy.mockRestore();
  });

  it('opens the install return screen when GitHub sends the person back', async () => {
    const result = { state: 's'.repeat(64), code: 'c' };
    mockStartInstall.mockResolvedValue({ kind: 'returned', result });
    const screen = render(<CodeSettingsScreen />);
    await waitFor(() => expect(screen.getByText('acme-inc')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Add connection'));
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/github/installed',
      params: result,
    });
  });

  it('shows the failure line when GitHub could not be connected', async () => {
    mockStartInstall.mockResolvedValue({ kind: 'failed' });
    const screen = render(<CodeSettingsScreen />);
    await waitFor(() => expect(screen.getByText('acme-inc')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Add connection'));
    });

    expect(screen.getByText('GitHub could not be connected')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each(['opened', 'dismissed'])(
    'shows nothing and goes nowhere when the result is %s',
    async (kind) => {
      mockStartInstall.mockResolvedValue({ kind });
      const screen = render(<CodeSettingsScreen />);
      await waitFor(() => expect(screen.getByText('acme-inc')).toBeTruthy());

      await act(async () => {
        fireEvent.press(screen.getByLabelText('Add connection'));
      });

      expect(screen.queryByText('GitHub could not be connected')).toBeNull();
      expect(mockPush).not.toHaveBeenCalled();
    },
  );
});

describe('default network access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.ready = true;
    mockSessions.status = 'ready';
    mockSessions.availability = AVAILABLE;
    mockFetchInstallations.mockResolvedValue([]);
    useCodePreferences.setState({ defaultNetworkAccess: 'trusted' });
  });

  it('starts at Trusted hosts', () => {
    const screen = render(<CodeSettingsScreen />);

    expect(screen.getByLabelText('Network access. Trusted hosts')).toBeTruthy();
  });

  it('offers the three options with their descriptions and stores the choice', () => {
    const screen = render(<CodeSettingsScreen />);

    fireEvent.press(screen.getByLabelText('Network access. Trusted hosts'));

    expect(screen.getByLabelText('Isolated. Commands cannot reach the internet.')).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Trusted hosts. Package registries and code hosts only. Required to clone a repository.',
      ),
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId('code-network-full'));

    expect(useCodePreferences.getState().defaultNetworkAccess).toBe('full');
    expect(screen.getByLabelText('Network access. Full internet')).toBeTruthy();
    expect(screen.queryByTestId('code-network-none')).toBeNull();
  });

  it('announces that the row expands and collapses', () => {
    const screen = render(<CodeSettingsScreen />);
    const row = () => screen.getByTestId('code-network-access');

    expect(row().props.accessibilityState).toMatchObject({ expanded: false });
    fireEvent.press(row());
    expect(row().props.accessibilityState).toMatchObject({ expanded: true });
    fireEvent.press(row());
    expect(row().props.accessibilityState).toMatchObject({ expanded: false });
  });

  it('keeps an unknown stored value out of the store', () => {
    const merge = useCodePreferences.persist.getOptions().merge;
    const current = useCodePreferences.getState();

    expect(merge?.({ defaultNetworkAccess: 'everything' }, current)).toMatchObject({
      defaultNetworkAccess: 'trusted',
    });
    expect(merge?.({ defaultNetworkAccess: 'none', wrapLongLines: true }, current)).toMatchObject({
      defaultNetworkAccess: 'none',
      wrapLongLines: true,
    });
  });
});
