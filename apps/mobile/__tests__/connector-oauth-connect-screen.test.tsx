/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiHttpError } from '../services/apiErrors';

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
  useRouter: () => ({ navigate: jest.fn(), push: mockPush, replace: jest.fn() }),
}));

jest.mock('@clerk/expo', () => ({
  useUser: () => ({
    user: { id: 'user-a', primaryEmailAddress: { emailAddress: 'ada@example.com' } },
  }),
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
  const Icon = () => <Text>icon</Text>;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('@/src/features/chat/store/appModeStore', () => {
  const state = { appMode: 'cloud', setAppMode: jest.fn() };
  const store = (selector: (s: typeof state) => unknown) => selector(state);
  store.getState = () => state;
  return { useChatAppModeStore: store };
});

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { connectors: true } }));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: mockAccountOwner, epoch: mockAccountEpoch }),
  isCloudAccountEpochCurrent: (snapshot: { ownerId: string; epoch: number }) =>
    snapshot.ownerId === mockAccountOwner && snapshot.epoch === mockAccountEpoch,
}));

const mockFetchDirectory = jest.fn();
const mockFetchListing = jest.fn();
const mockFetchCapabilities = jest.fn();
const mockFetchPermissions = jest.fn();
const mockConnect = jest.fn();
const mockFetchCredentialStatus = jest.fn();
jest.mock('@/services/connectors', () => ({
  connectConnector: (...args: unknown[]) => mockConnect(...args),
  connectorListingIconUrl: jest.fn(() => null),
  fetchConnectorCalls: jest.fn(async () => []),
  deleteCustomConnector: jest.fn(),
  disconnectConnector: jest.fn(),
  fetchConnectorCapabilities: (...args: unknown[]) => mockFetchCapabilities(...args),
  fetchConnectorDirectory: (...args: unknown[]) => mockFetchDirectory(...args),
  fetchConnectorListing: (...args: unknown[]) => mockFetchListing(...args),
  fetchConnectorToolPermissions: (...args: unknown[]) => mockFetchPermissions(...args),
  resetConnectorToolPermission: jest.fn(),
  setConnectorToolPermission: jest.fn(),
  startConnectorOAuth: jest.fn(),
  fetchConnectorCredentialStatus: (...args: unknown[]) => mockFetchCredentialStatus(...args),
  saveConnectorApiKey: jest.fn(),
}));

import ConnectorDetailScreen from '../src/features/settings/cloud-connectors/ConnectorDetailScreen';

const AUTHORIZE_URL = 'https://linear.app/oauth/authorize?client_id=abc&state=xyz';
const CREDENTIALS_PATH = '/api/connectors/linear/credentials';

function linearListing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'linear',
    name: 'Linear',
    publisher: 'Linear Orbit',
    description: 'Plan and track issues across your team.',
    categories: ['Productivity'],
    authMode: 'oauth',
    connectable: 'connect',
    toolNames: ['list_issues', 'create_issue'],
    iconUrl: null,
    documentationUrl: null,
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
    ...overrides,
  };
}

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

const NO_CONNECTIONS = { connectors: [], available: [] };

describe('Connector detail, connect flow for an unconnected listing', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    Object.assign(mockAuthState, {
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user-a',
    });
    mockAccountOwner = 'user-a';
    mockAccountEpoch = 1;
    mockFetchDirectory.mockResolvedValue(NO_CONNECTIONS);
    mockFetchListing.mockResolvedValue(linearListing());
    mockFetchCapabilities.mockResolvedValue({ connectorId: 'linear', tools: [] });
    mockFetchPermissions.mockResolvedValue([]);
    mockConnect.mockResolvedValue({
      kind: 'oauth-required',
      connectorId: 'linear',
      authorizeUrl: AUTHORIZE_URL,
    });
    mockOpenUntrusted.mockResolvedValue(true);
  });

  afterEach(() => alertSpy.mockRestore());

  it('shows what the listing is and what it can do before anything is connected', async () => {
    const screen = render(<ConnectorDetailScreen connectorId="linear" />);

    await waitFor(() => expect(screen.getByLabelText('Connect Linear')).toBeTruthy());
    expect(mockFetchListing).toHaveBeenCalledWith('linear');
    expect(screen.getByText('By Linear Orbit')).toBeTruthy();
    expect(screen.getByText('Plan and track issues across your team.')).toBeTruthy();
    expect(screen.getByText('Sign-in')).toBeTruthy();
    expect(screen.getByText('Account sign-in')).toBeTruthy();
    expect(screen.getByText('What it can do')).toBeTruthy();
    expect(screen.getByText('List Issues')).toBeTruthy();
    expect(screen.getByText('Create Issue')).toBeTruthy();
    expect(screen.queryByText('Connected to AGI Cloud')).toBeNull();
    expect(mockFetchCapabilities).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('offers no Connect for a listing that only runs on desktop and CLI', async () => {
    mockFetchListing.mockResolvedValue(linearListing({ connectable: 'desktop-and-cli' }));

    const screen = render(<ConnectorDetailScreen connectorId="linear" />);

    await waitFor(() => expect(screen.getByText('Desktop and CLI')).toBeTruthy());
    expect(screen.queryByLabelText('Connect Linear')).toBeNull();
  });

  it('opens the provider authorize URL, then refreshes to the new grant', async () => {
    mockFetchDirectory
      .mockResolvedValueOnce(NO_CONNECTIONS)
      .mockResolvedValueOnce({ connectors: [LINEAR_GRANT], available: [] });

    const screen = render(<ConnectorDetailScreen connectorId="linear" />);
    await waitFor(() => expect(screen.getByLabelText('Connect Linear')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Connect Linear'));

    await waitFor(() => expect(mockOpenUntrusted).toHaveBeenCalledWith(AUTHORIZE_URL));
    expect(mockConnect).toHaveBeenCalledWith('linear');
    await waitFor(() => expect(screen.getByText('Connected to AGI Cloud')).toBeTruthy());
    expect(mockFetchDirectory).toHaveBeenCalledTimes(2);
    expect(mockFetchCapabilities).toHaveBeenCalledWith('linear');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('never claims success when the refreshed directory has no grant', async () => {
    const screen = render(<ConnectorDetailScreen connectorId="linear" />);
    await waitFor(() => expect(screen.getByLabelText('Connect Linear')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Connect Linear'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Linear is not connected yet');
    expect(mockFetchDirectory).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Connected to AGI Cloud')).toBeNull();
    expect(screen.getByLabelText('Connect Linear')).toBeTruthy();
  });

  it('reports a browser that could not be opened as a failure, not a connection', async () => {
    mockOpenUntrusted.mockResolvedValue(false);

    const screen = render(<ConnectorDetailScreen connectorId="linear" />);
    await waitFor(() => expect(screen.getByLabelText('Connect Linear')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Connect Linear'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Could not open Linear authorization');
    expect(mockFetchDirectory).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Connected to AGI Cloud')).toBeNull();
    expect(screen.getByLabelText('Connect Linear')).toBeTruthy();
  });

  it('explains unavailable deployment configuration without exposing server diagnostics', async () => {
    mockConnect.mockRejectedValue(new ApiHttpError('Private OAuth configuration detail', 501));

    const screen = render(<ConnectorDetailScreen connectorId="linear" />);
    await waitFor(() => expect(screen.getByLabelText('Connect Linear')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Connect Linear'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Could not connect Linear');
    expect(alertSpy.mock.calls[0]?.[1]).toBe(
      'This connector is unavailable in this deployment. Try another connector.',
    );
    expect(JSON.stringify(alertSpy.mock.calls)).not.toContain('Private OAuth configuration detail');
    expect(mockOpenUntrusted).not.toHaveBeenCalled();
  });

  it('does not show unclassified connect error details', async () => {
    mockConnect.mockRejectedValue(new Error('client_secret at /internal/oauth/linear'));

    const screen = render(<ConnectorDetailScreen connectorId="linear" />);
    await waitFor(() => expect(screen.getByLabelText('Connect Linear')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Connect Linear'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0]?.[1]).toBe('The connector was not connected. Try again.');
    expect(JSON.stringify(alertSpy.mock.calls)).not.toContain('client_secret');
    expect(mockOpenUntrusted).not.toHaveBeenCalled();
  });

  it('opens the API key sheet instead of a browser when the server asks for credentials', async () => {
    mockFetchListing.mockResolvedValue(
      linearListing({ authMode: 'api-key', connectable: 'api-key-form' }),
    );
    mockConnect.mockResolvedValue({
      kind: 'credentials-required',
      connectorId: 'linear',
      credentialsPath: CREDENTIALS_PATH,
    });
    mockFetchCredentialStatus.mockResolvedValue({
      connectorId: 'linear',
      name: 'Linear',
      placement: 'header',
      headerName: 'Authorization',
      documentationUrl: null,
      connected: false,
    });

    const screen = render(<ConnectorDetailScreen connectorId="linear" />);
    await waitFor(() => expect(screen.getByLabelText('Connect Linear')).toBeTruthy());
    expect(screen.getByText('API key')).toBeTruthy();
    expect(screen.queryByText('Connect Linear')).toBeNull();

    fireEvent.press(screen.getByLabelText('Connect Linear'));

    await waitFor(() => expect(screen.getByText('Connect Linear')).toBeTruthy());
    expect(mockFetchCredentialStatus).toHaveBeenCalledWith(CREDENTIALS_PATH);
    await waitFor(() => expect(screen.getByLabelText('Linear API key')).toBeTruthy());
    expect(mockOpenUntrusted).not.toHaveBeenCalled();
    expect(mockFetchDirectory).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not open an account-A authorization after account B activates', async () => {
    let resolveConnect!: () => void;
    mockConnect.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveConnect = () =>
          resolve({ kind: 'oauth-required', connectorId: 'linear', authorizeUrl: AUTHORIZE_URL });
      }),
    );
    const screen = render(<ConnectorDetailScreen connectorId="linear" />);
    await waitFor(() => expect(screen.getByLabelText('Connect Linear')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Connect Linear'));
    expect(mockConnect).toHaveBeenCalledWith('linear');

    act(() => {
      mockAccountOwner = 'user-b';
      mockAccountEpoch = 2;
      mockAuthState.clerkUserId = 'user-b';
      screen.rerender(<ConnectorDetailScreen connectorId="linear" />);
    });
    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText('Connect Linear')).toBeTruthy());
    const fetchCountBeforeStaleCompletion = mockFetchDirectory.mock.calls.length;

    await act(async () => {
      resolveConnect();
      await Promise.resolve();
    });

    expect(mockOpenUntrusted).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockFetchDirectory).toHaveBeenCalledTimes(fetchCountBeforeStaleCompletion);
  });
});
