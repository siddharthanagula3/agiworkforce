/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Connector detail — reauthorizing an OAuth grant.
 *
 * A grant whose access token expired with no refresh token (`needsReauthorization`
 * from GET /api/connectors) is still a row, but its tools cannot run. The detail
 * screen must say so and give the user a way back through the hosted
 * authorization flow — without ever reporting a success the server has not
 * confirmed.
 */
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockFetchDirectory = jest.fn();
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
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return {
    ArrowLeft: icon,
    ChevronRight: icon,
    CloudOff: icon,
    KeyRound: icon,
    Link2: icon,
    Plug: icon,
    RotateCcw: icon,
    ShieldCheck: icon,
    Trash2: icon,
    UserRound: icon,
  };
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
  fetchConnectorDirectory: (...args: unknown[]) => mockFetchDirectory(...args),
  fetchConnectorToolPermissions: (...args: unknown[]) => mockFetchPermissions(...args),
  setConnectorToolPermission: jest.fn(),
  resetConnectorToolPermission: jest.fn(),
  disconnectConnector: jest.fn(),
  deleteCustomConnector: jest.fn(),
  startConnectorOAuth: (...args: unknown[]) => mockStartOAuth(...args),
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
    available: ['linear'],
  };
}

describe('Connector detail — OAuth reauthorization', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockFetchDirectory.mockResolvedValue(grant());
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
    expect(screen.getByText('Authorization expired')).toBeTruthy();
  });

  it('surfaces a start failure as an error and opens no browser', async () => {
    mockStartOAuth.mockRejectedValue(
      new Error('This connector has no OAuth application configured in this deployment.'),
    );

    const screen = render(<ConnectorDetailScreen connectorId="linear" />);
    await waitFor(() => expect(screen.getByLabelText('Reauthorize Linear')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Reauthorize Linear'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Could not reauthorize');
    expect(alertSpy.mock.calls[0]?.[1]).toBe(
      'This connector has no OAuth application configured in this deployment.',
    );
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
      available: ['github'],
    });

    const screen = render(<ConnectorDetailScreen connectorId="github" />);

    await waitFor(() => expect(screen.getByText('Connected to AGI Cloud')).toBeTruthy());
    expect(screen.queryByLabelText('Reauthorize GitHub')).toBeNull();
  });
});
