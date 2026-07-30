/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockFetchDirectory = jest.fn();
const mockFetchPermissions = jest.fn();
const mockSetPermission = jest.fn();
const mockResetPermission = jest.fn();
const mockDisconnect = jest.fn();
const mockDeleteCustom = jest.fn();
const mockSetAppMode = jest.fn();
const mockAuthState = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'user-a' as string | null,
};
const mockModeState = {
  appMode: 'cloud' as 'cloud' | 'local',
  setAppMode: mockSetAppMode,
};
let mockOwnerId = 'user-a';
let mockEpoch = 1;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
}));

jest.mock('@clerk/expo', () => ({
  useUser: () => ({
    user: {
      id: 'user-a',
      primaryEmailAddress: { emailAddress: 'ada@example.com' },
    },
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
  setConnectorToolPermission: (...args: unknown[]) => mockSetPermission(...args),
  resetConnectorToolPermission: (...args: unknown[]) => mockResetPermission(...args),
  disconnectConnector: (...args: unknown[]) => mockDisconnect(...args),
  deleteCustomConnector: (...args: unknown[]) => mockDeleteCustom(...args),
}));

import ConnectorDetailScreen from '../src/features/settings/cloud-connectors/ConnectorDetailScreen';

describe('Connector detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockAuthState, {
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user-a',
    });
    Object.assign(mockModeState, { appMode: 'cloud' });
    mockOwnerId = 'user-a';
    mockEpoch = 1;
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
    mockFetchPermissions.mockResolvedValue([
      { connectorId: 'github', toolName: 'create_issue', level: 'ask' },
      { connectorId: 'slack', toolName: 'send_message', level: 'deny' },
    ]);
    mockSetPermission.mockResolvedValue(undefined);
    mockResetPermission.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
    mockDeleteCustom.mockResolvedValue(undefined);
  });

  it('shows account and connection metadata plus only real saved tool keys', async () => {
    const screen = render(<ConnectorDetailScreen connectorId="github" />);

    await waitFor(() => expect(screen.getByText('Connected to AGI Cloud')).toBeTruthy());
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByText('GitHub App')).toBeTruthy();
    expect(screen.getByText('Create Issue')).toBeTruthy();
    expect(screen.getByText('create_issue')).toBeTruthy();
    expect(screen.queryByText('Send Message')).toBeNull();
    expect(screen.getByText(/Only policies saved from real approval cards/)).toBeTruthy();
  });

  it('updates and resets the exact server-owned permission key', async () => {
    const screen = render(<ConnectorDetailScreen connectorId="github" />);

    await waitFor(() => expect(screen.getByLabelText('Block create_issue')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Block create_issue'));
    await waitFor(() =>
      expect(mockSetPermission).toHaveBeenCalledWith('github', 'create_issue', 'deny'),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Reset create_issue to default').props.disabled).not.toBe(true),
    );

    fireEvent.press(screen.getByLabelText('Reset create_issue to default'));
    await waitFor(() => expect(mockResetPermission).toHaveBeenCalledWith('github', 'create_issue'));
    expect(screen.getByText('No saved tool policies')).toBeTruthy();
  });

  it('keeps disconnect behind a destructive confirmation and leaves it in the detail footer', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const screen = render(<ConnectorDetailScreen connectorId="github" />);

    await waitFor(() => expect(screen.getByLabelText('Disconnect GitHub')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Disconnect GitHub'));
    const disconnectAction = alert.mock.calls
      .at(-1)?.[2]
      ?.find((button) => button.text === 'Disconnect');
    expect(disconnectAction?.style).toBe('destructive');

    await act(async () => {
      disconnectAction?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledWith('github'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/connectors');
  });

  it('drops account-A results after the active Cloud account changes', async () => {
    let resolveDirectory!: (value: unknown) => void;
    mockFetchDirectory.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDirectory = resolve;
      }),
    );
    const screen = render(<ConnectorDetailScreen connectorId="github" />);

    await act(async () => {
      mockOwnerId = 'user-b';
      mockEpoch = 2;
      mockAuthState.clerkUserId = 'user-b';
      resolveDirectory({
        connectors: [
          {
            id: 'github-app-a',
            connectorId: 'github',
            authType: 'github_app',
            connectedAt: '',
            updatedAt: '',
            source: 'github-app',
          },
        ],
        available: ['github'],
      });
      await Promise.resolve();
    });

    expect(screen.queryByText('Connected to AGI Cloud')).toBeNull();
  });

  it('fails an invalid dynamic-route id without issuing a Cloud request', async () => {
    const screen = render(<ConnectorDetailScreen connectorId="" />);

    await waitFor(() => expect(screen.getByText('Could not load connector')).toBeTruthy());
    expect(screen.getByText('This connector link is invalid.')).toBeTruthy();
    expect(mockFetchDirectory).not.toHaveBeenCalled();
    expect(mockFetchPermissions).not.toHaveBeenCalled();
  });
});
