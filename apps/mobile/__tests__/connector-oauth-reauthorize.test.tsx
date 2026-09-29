/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiHttpError } from '../services/apiErrors';

const mockFetchDirectory = jest.fn();
const mockFetchListing = jest.fn();
const mockFetchCapabilities = jest.fn();
const mockFetchPermissions = jest.fn();
const mockStartOAuth = jest.fn();
const mockOpenUntrusted = jest.fn();
const mockAuthState = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'user-a' as string | null,
};
const mockModeState = { appMode: 'cloud' as 'cloud' | 'local', setAppMode: jest.fn() };
const mockOwnerId = 'user-a';
const mockEpoch = 1;

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
}));

jest.mock('@clerk/expo', () => ({
  useUser: () => ({
    user: { id: 'user-a', primaryEmailAddress: { emailAddress: 'ada@example.com' } },
  }),
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

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { connectors: true } }));

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: (...args: unknown[]) => mockOpenUntrusted(...args),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => {
  const useChatAppModeStore = (selector: (state: typeof mockModeState) => unknown) =>
    selector(mockModeState);
  useChatAppModeStore.getState = () => mockModeState;
  return { useChatAppModeStore };
});

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: mockOwnerId, epoch: mockEpoch }),
  isCloudAccountEpochCurrent: (snapshot: { ownerId: string; epoch: number }) =>
    snapshot.ownerId === mockOwnerId && snapshot.epoch === mockEpoch,
}));

jest.mock('@/services/connectors', () => ({
  connectConnector: jest.fn(),
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
  startConnectorOAuth: (...args: unknown[]) => mockStartOAuth(...args),
  fetchConnectorCredentialStatus: jest.fn(),
  saveConnectorApiKey: jest.fn(),
}));

import ConnectorDetailScreen from '../src/features/settings/cloud-connectors/ConnectorDetailScreen';

const AUTHORIZE_URL = 'https://linear.app/oauth/authorize?client_id=abc&state=xyz';

function grant(overrides: Record<string, unknown> = {}) {
  return {
    connectors: [
      {
        id: 'oauth-linear',
        connectorId: 'linear',
        authType: 'oauth',
        connectedAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        source: 'oauth',
        scopes: ['issues:read'],
        needsReauthorization: false,
        ...overrides,
      },
    ],
    available: [],
  };
}

function catalog(tools: Record<string, unknown>[] = []) {
  return { connectorId: 'linear', tools };
}

describe('Connector detail, OAuth reauthorization', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockFetchDirectory.mockResolvedValue(grant());
    mockFetchListing.mockResolvedValue(null);
    mockFetchCapabilities.mockResolvedValue(catalog());
    mockFetchPermissions.mockResolvedValue([]);
    mockStartOAuth.mockResolvedValue({ connectorId: 'linear', authorizeUrl: AUTHORIZE_URL });
    mockOpenUntrusted.mockResolvedValue(true);
  });

  afterEach(() => alertSpy.mockRestore());

  it('shows the scopes the provider actually granted', async () => {
    const screen = render(<ConnectorDetailScreen connectorId="linear" />);

    await waitFor(() => expect(screen.getByText('Granted access')).toBeTruthy());
    expect(screen.getByText('issues:read')).toBeTruthy();
  });

  it('lists the tools the connected server reports, grouped by what they can change', async () => {
    mockFetchCapabilities.mockResolvedValue(
      catalog([
        { name: 'list_issues', title: 'List issues', readOnly: true },
        { name: 'create_issue', readOnly: false },
      ]),
    );

    const screen = render(<ConnectorDetailScreen connectorId="linear" />);

    await waitFor(() => expect(screen.getByText('Read-only tools')).toBeTruthy());
    expect(mockFetchCapabilities).toHaveBeenCalledWith('linear');
    expect(mockFetchPermissions).toHaveBeenCalledTimes(1);
    expect(screen.getByText('List issues')).toBeTruthy();
    expect(screen.getByText('Write and delete tools')).toBeTruthy();
    expect(screen.getByText('Create Issue')).toBeTruthy();
    expect(screen.getByLabelText('list_issues permission. Not set')).toBeTruthy();
    expect(screen.getByLabelText('create_issue permission. Not set')).toBeTruthy();
  });

  it('flags an expired grant instead of showing it as healthy', async () => {
    mockFetchDirectory.mockResolvedValue(grant({ needsReauthorization: true }));

    const screen = render(<ConnectorDetailScreen connectorId="linear" />);

    await waitFor(() => expect(screen.getByText('Authorization expired')).toBeTruthy());
  });

  it('reauthorizes through the hosted flow and re-reads server state on return', async () => {
    mockFetchDirectory
      .mockResolvedValueOnce(grant({ needsReauthorization: true }))
      .mockResolvedValueOnce(grant({ needsReauthorization: false }));

    const screen = render(<ConnectorDetailScreen connectorId="linear" />);
    await waitFor(() => expect(screen.getByLabelText('Reauthorize Linear')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Reauthorize Linear'));

    await waitFor(() => expect(mockStartOAuth).toHaveBeenCalledWith('linear'));
    await waitFor(() => expect(mockOpenUntrusted).toHaveBeenCalledWith(AUTHORIZE_URL));
    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Authorization expired')).toBeNull());
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('keeps the expired banner when the reauthorization did not complete', async () => {
    mockFetchDirectory.mockResolvedValue(grant({ needsReauthorization: true }));

    const screen = render(<ConnectorDetailScreen connectorId="linear" />);
    await waitFor(() => expect(screen.getByLabelText('Reauthorize Linear')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Reauthorize Linear'));

    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Reauthorize')).toBeTruthy());
    expect(screen.getByText('Authorization expired')).toBeTruthy();
  });

  it('surfaces a start failure as an error and opens no browser', async () => {
    mockStartOAuth.mockRejectedValue(
      new ApiHttpError('Private connector configuration detail', 501),
    );

    const screen = render(<ConnectorDetailScreen connectorId="linear" />);
    await waitFor(() => expect(screen.getByLabelText('Reauthorize Linear')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Reauthorize Linear'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Could not reauthorize');
    expect(alertSpy.mock.calls[0]?.[1]).toBe(
      'This connector is unavailable in this deployment. Try another connector.',
    );
    expect(mockOpenUntrusted).not.toHaveBeenCalled();
  });

  it('does not show unclassified provider error details', async () => {
    mockStartOAuth.mockRejectedValue(new Error('client_secret at /internal/oauth/linear'));

    const screen = render(<ConnectorDetailScreen connectorId="linear" />);
    await waitFor(() => expect(screen.getByLabelText('Reauthorize Linear')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Reauthorize Linear'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0]?.[1]).toBe('The connector was not reauthorized. Try again.');
    expect(JSON.stringify(alertSpy.mock.calls)).not.toContain('client_secret');
    expect(mockOpenUntrusted).not.toHaveBeenCalled();
  });

  it('offers no reauthorize action for a non-OAuth connection', async () => {
    mockFetchDirectory.mockResolvedValue({
      connectors: [
        {
          id: 'github-app-1',
          connectorId: 'github',
          authType: 'github_app',
          connectedAt: '2026-07-29T18:30:00.000Z',
          updatedAt: '2026-07-29T18:30:00.000Z',
          source: 'github-app',
        },
      ],
      available: [],
    });

    const screen = render(<ConnectorDetailScreen connectorId="github" />);

    await waitFor(() => expect(screen.getByText('Connected to AGI Cloud')).toBeTruthy());
    expect(screen.queryByLabelText('Reauthorize GitHub')).toBeNull();
  });
});
