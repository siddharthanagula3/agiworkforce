/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockAuthState = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'user-a' as string | null,
};
let mockAccountOwner = 'user-a';
let mockAccountEpoch = 1;
const mockOpenBrowser = jest.fn();
const mockDisconnect = jest.fn();
const mockDeleteCustom = jest.fn();
const mockRefreshTier = jest.fn();
const mockTierState = {
  grantedCapabilities: ['canUseConnectors'],
  isRefreshing: false,
  lastRefreshedAt: '2026-07-26T00:00:00.000Z' as string | null,
  refreshTier: mockRefreshTier,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: jest.fn(),
    push: mockPush,
  }),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Path: () => null,
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return {
    Plug: icon,
    Link: icon,
    CheckCircle: icon,
    ArrowLeft: icon,
    ChevronRight: icon,
    RefreshCw: icon,
    Search: icon,
    CloudOff: icon,
  };
});

// The connectors screen shows a "Chat is set to Local Mode" blocked banner
// unless the app is in Cloud mode (connectors are a cloud-managed feature —
// same trust gate as the AddToChatSheet). Put the screen in Cloud mode so the
// interactive catalog renders and the shipped-feature assertions below apply.
jest.mock('@/src/features/chat/store/appModeStore', () => {
  const state = { appMode: 'cloud', setAppMode: jest.fn() };
  const store = (selector: (s: typeof state) => unknown) => selector(state);
  store.getState = () => state;
  return { useChatAppModeStore: store };
});

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { connectors: true } }));

jest.mock('@/src/features/billing/store', () => ({
  useTierStore: (selector: (s: typeof mockTierState) => unknown) => selector(mockTierState),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: mockAccountOwner, epoch: mockAccountEpoch }),
  isCloudAccountEpochCurrent: (snapshot: { ownerId: string; epoch: number }) =>
    snapshot.ownerId === mockAccountOwner && snapshot.epoch === mockAccountEpoch,
}));

const mockFetchDirectory = jest.fn();
const mockConnect = jest.fn();
jest.mock('@/services/connectors', () => ({
  fetchConnectorDirectory: (...args: unknown[]) => mockFetchDirectory(...args),
  connectConnector: (...args: unknown[]) => mockConnect(...args),
  disconnectConnector: (...args: unknown[]) => mockDisconnect(...args),
  deleteCustomConnector: (...args: unknown[]) => mockDeleteCustom(...args),
  getGitHubInstallWebUrl: jest.fn(() => 'https://agiworkforce.com/api/github/install/start'),
}));

import CloudConnectorsScreen from '../app/(app)/settings/cloud-connectors';

describe('Cloud Connectors screen — shipped-feature state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockAuthState, {
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user-a',
    });
    mockAccountOwner = 'user-a';
    mockAccountEpoch = 1;
    Object.assign(mockTierState, {
      grantedCapabilities: ['canUseConnectors'],
      isRefreshing: false,
      lastRefreshedAt: '2026-07-26T00:00:00.000Z',
    });
    mockOpenBrowser.mockResolvedValue({ type: 'dismiss' });
    mockFetchDirectory.mockResolvedValue({
      connectors: [
        {
          id: 'custom-row',
          connectorId: 'custom-ab12',
          authType: 'custom_mcp',
          connectedAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T00:00:00.000Z',
          source: 'custom',
          name: 'Internal tools',
        },
      ],
      available: ['github', 'slack'],
    });
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
    mockDeleteCustom.mockResolvedValue(undefined);
  });

  it('renders the interactive catalog once FEATURES.connectors is true, with no placeholder', async () => {
    const { getByText, queryByText } = render(<CloudConnectorsScreen />);

    expect(getByText('Notion')).toBeTruthy();
    expect(queryByText('Connectors — AGI Cloud')).toBeNull();
    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(1));
  });

  it('shows handshake loading instead of a false denial before the first tier refresh', () => {
    Object.assign(mockTierState, {
      grantedCapabilities: [],
      isRefreshing: false,
      lastRefreshedAt: null,
    });

    const { getByLabelText, queryByText } = render(<CloudConnectorsScreen />);

    expect(getByLabelText('Checking connector access')).toBeTruthy();
    expect(queryByText('Connectors are not available for this account.')).toBeNull();
    expect(mockRefreshTier).toHaveBeenCalledTimes(1);
    expect(mockFetchDirectory).not.toHaveBeenCalled();
  });

  it('does not render an account-A directory response after switching to account B', async () => {
    let resolveAccountA!: (value: unknown) => void;
    mockFetchDirectory
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAccountA = resolve;
        }),
      )
      .mockResolvedValueOnce({ connectors: [], available: ['slack'] });
    const screen = render(<CloudConnectorsScreen />);
    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(1));

    mockAccountOwner = 'user-b';
    mockAccountEpoch = 2;
    mockAuthState.clerkUserId = 'user-b';
    screen.rerender(<CloudConnectorsScreen />);
    await act(async () => {
      resolveAccountA({
        connectors: [
          {
            id: 'account-a-slack',
            connectorId: 'slack',
            authType: 'oauth',
            source: 'platform',
            name: 'Account A Slack',
          },
        ],
        available: ['slack'],
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByLabelText('Slack. Connect')).toBeTruthy());
    expect(screen.queryByLabelText('Slack. Connected')).toBeNull();
  });

  it('shows Connect only for server-advertised providers and Coming soon for the rest', async () => {
    const { getByLabelText, queryByLabelText } = render(<CloudConnectorsScreen />);

    await waitFor(() => {
      expect(getByLabelText('Slack. Connect')).toBeTruthy();
    });
    expect(getByLabelText('Notion. Coming soon')).toBeTruthy();
    expect(queryByLabelText('Notion. Connect')).toBeNull();
  });

  it('calls the real connection route for an available operator connector', async () => {
    const { getByLabelText } = render(<CloudConnectorsScreen />);

    await waitFor(() => expect(getByLabelText('Slack. Connect')).toBeTruthy());
    fireEvent.press(getByLabelText('Slack. Connect'));

    await waitFor(() => expect(mockConnect).toHaveBeenCalledWith('slack'));
  });

  it('renders connected custom MCP endpoints by their real server name', async () => {
    const { getByLabelText } = render(<CloudConnectorsScreen />);

    await waitFor(() => {
      expect(getByLabelText('Internal tools. Connected')).toBeTruthy();
    });
  });

  it('does not fetch connectors while signed out and routes to sign-in', () => {
    Object.assign(mockAuthState, { isClerkSignedIn: false, clerkUserId: null });

    const { getByLabelText, queryByText } = render(<CloudConnectorsScreen />);

    expect(getByLabelText('Sign in to AGI Cloud')).toBeTruthy();
    expect(queryByText('Notion')).toBeNull();
    expect(mockFetchDirectory).not.toHaveBeenCalled();
    fireEvent.press(getByLabelText('Sign in to AGI Cloud'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
  });

  it('refreshes the directory after returning from the GitHub install browser', async () => {
    const { getByLabelText } = render(<CloudConnectorsScreen />);

    await waitFor(() => expect(getByLabelText('GitHub. Connect')).toBeTruthy());
    fireEvent.press(getByLabelText('GitHub. Connect'));

    await waitFor(() => {
      expect(mockOpenBrowser).toHaveBeenCalledWith(
        'https://agiworkforce.com/api/github/install/start',
      );
      expect(mockFetchDirectory).toHaveBeenCalledTimes(2);
    });
  });

  it('does not execute an account-A disconnect confirmation with account B credentials', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const { getByLabelText, rerender } = render(<CloudConnectorsScreen />);

    await waitFor(() => expect(getByLabelText('Internal tools. Connected')).toBeTruthy());
    fireEvent.press(getByLabelText('Internal tools. Connected'));
    const disconnectAction = alert.mock.calls[0]?.[2]?.find(
      (button) => button.text === 'Disconnect',
    );

    act(() => {
      mockAccountOwner = 'user-b';
      mockAccountEpoch = 2;
      mockAuthState.clerkUserId = 'user-b';
      rerender(<CloudConnectorsScreen />);
      disconnectAction?.onPress?.();
    });

    expect(mockDeleteCustom).not.toHaveBeenCalled();
    expect(mockDisconnect).not.toHaveBeenCalled();
    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(2));
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('ignores an account-A connect completion after account B activates', async () => {
    let resolveConnect!: () => void;
    mockConnect.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveConnect = resolve;
      }),
    );
    const { getByLabelText, rerender } = render(<CloudConnectorsScreen />);

    await waitFor(() => expect(getByLabelText('Slack. Connect')).toBeTruthy());
    fireEvent.press(getByLabelText('Slack. Connect'));
    expect(mockConnect).toHaveBeenCalledWith('slack');

    act(() => {
      mockAccountOwner = 'user-b';
      mockAccountEpoch = 2;
      mockAuthState.clerkUserId = 'user-b';
      rerender(<CloudConnectorsScreen />);
    });
    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(2));
    await act(async () => {
      await Promise.resolve();
    });
    const fetchCountBeforeStaleCompletion = mockFetchDirectory.mock.calls.length;

    await act(async () => {
      resolveConnect();
      await Promise.resolve();
    });

    expect(mockFetchDirectory).toHaveBeenCalledTimes(fetchCountBeforeStaleCompletion);
  });
});
