/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockAuthState = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'user-a' as string | null,
};
const mockAccountOwner = 'user-a';
const mockAccountEpoch = 1;
const mockRefreshTier = jest.fn();
const mockTierState = {
  grantedCapabilities: ['canUseConnectors'],
  isRefreshing: false,
  lastRefreshedAt: '2026-08-01T00:00:00.000Z' as string | null,
  refreshTier: mockRefreshTier,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), push: mockPush }),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn().mockResolvedValue({ type: 'dismiss' }),
}));

const mockOpenUntrusted = jest.fn();
jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: (...args: unknown[]) => mockOpenUntrusted(...args),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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
  disconnectConnector: jest.fn(),
  deleteCustomConnector: jest.fn(),
  getGitHubInstallWebUrl: jest.fn(() => 'https://agiworkforce.com/api/github/install/start'),
}));

import CloudConnectorsScreen from '../app/(app)/settings/cloud-connectors';

const AUTHORIZE_URL = 'https://linear.app/oauth/authorize?client_id=abc&state=xyz';

const LINEAR_GRANT = {
  id: 'oauth-linear',
  connectorId: 'linear',
  authType: 'oauth',
  connectedAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  source: 'oauth' as const,
  scopes: ['read'],
  needsReauthorization: false,
};

describe('Cloud Connectors — OAuth connect flow', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    Object.assign(mockTierState, {
      grantedCapabilities: ['canUseConnectors'],
      isRefreshing: false,
      lastRefreshedAt: '2026-08-01T00:00:00.000Z',
    });
    mockFetchDirectory.mockResolvedValue({ connectors: [], available: ['linear'] });
    mockConnect.mockResolvedValue({
      kind: 'oauth-required',
      connectorId: 'linear',
      authorizeUrl: AUTHORIZE_URL,
    });
    mockOpenUntrusted.mockResolvedValue(true);
  });

  afterEach(() => alertSpy.mockRestore());

  it('renders Connect for an OAuth-configured provider and Coming soon for the rest', async () => {
    const { getByLabelText, queryByLabelText } = render(<CloudConnectorsScreen />);

    await waitFor(() => expect(getByLabelText('Linear. Connect')).toBeTruthy());
    expect(getByLabelText('Notion. Coming soon')).toBeTruthy();
    expect(queryByLabelText('Notion. Connect')).toBeNull();
  });

  it('opens the provider authorize URL instead of surfacing the 409, then refreshes', async () => {
    mockFetchDirectory
      .mockResolvedValueOnce({ connectors: [], available: ['linear'] })
      .mockResolvedValueOnce({ connectors: [LINEAR_GRANT], available: ['linear'] });

    const { getByLabelText } = render(<CloudConnectorsScreen />);
    await waitFor(() => expect(getByLabelText('Linear. Connect')).toBeTruthy());

    fireEvent.press(getByLabelText('Linear. Connect'));

    await waitFor(() => expect(mockOpenUntrusted).toHaveBeenCalledWith(AUTHORIZE_URL));
    await waitFor(() => expect(getByLabelText('Linear. Connected')).toBeTruthy());
    expect(mockFetchDirectory).toHaveBeenCalledTimes(2);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('never claims success when the refreshed directory has no grant', async () => {
    const { getByLabelText } = render(<CloudConnectorsScreen />);
    await waitFor(() => expect(getByLabelText('Linear. Connect')).toBeTruthy());

    fireEvent.press(getByLabelText('Linear. Connect'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Linear is not connected yet');
    expect(getByLabelText('Linear. Connect')).toBeTruthy();
  });

  it('reports a browser that could not be opened as a failure, not a connection', async () => {
    mockOpenUntrusted.mockResolvedValue(false);

    const { getByLabelText } = render(<CloudConnectorsScreen />);
    await waitFor(() => expect(getByLabelText('Linear. Connect')).toBeTruthy());

    fireEvent.press(getByLabelText('Linear. Connect'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Could not open Linear authorization');
    expect(mockFetchDirectory).toHaveBeenCalledTimes(1);
    expect(getByLabelText('Linear. Connect')).toBeTruthy();
  });

  it('shows an expired grant as expired rather than connected', async () => {
    mockFetchDirectory.mockResolvedValue({
      connectors: [{ ...LINEAR_GRANT, needsReauthorization: true }],
      available: ['linear'],
    });

    const { getByLabelText, queryByLabelText } = render(<CloudConnectorsScreen />);

    await waitFor(() => expect(getByLabelText('Linear. Authorization expired')).toBeTruthy());
    expect(queryByLabelText('Linear. Connected')).toBeNull();
  });
});
