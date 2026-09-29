/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockFetchDirectory = jest.fn();
const mockFetchListing = jest.fn();
const mockFetchCapabilities = jest.fn();
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
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
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
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
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
  connectConnector: jest.fn(),
  connectorListingIconUrl: jest.fn(() => null),
  fetchConnectorCalls: jest.fn(async () => []),
  deleteCustomConnector: (...args: unknown[]) => mockDeleteCustom(...args),
  disconnectConnector: (...args: unknown[]) => mockDisconnect(...args),
  fetchConnectorCapabilities: (...args: unknown[]) => mockFetchCapabilities(...args),
  fetchConnectorCredentialStatus: jest.fn(),
  fetchConnectorDirectory: (...args: unknown[]) => mockFetchDirectory(...args),
  fetchConnectorListing: (...args: unknown[]) => mockFetchListing(...args),
  fetchConnectorToolPermissions: (...args: unknown[]) => mockFetchPermissions(...args),
  resetConnectorToolPermission: (...args: unknown[]) => mockResetPermission(...args),
  saveConnectorApiKey: jest.fn(),
  setConnectorToolPermission: (...args: unknown[]) => mockSetPermission(...args),
  startConnectorOAuth: jest.fn(),
}));

import ConnectorDetailScreen from '../src/features/settings/cloud-connectors/ConnectorDetailScreen';

function githubConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'github-app-1',
    connectorId: 'github',
    authType: 'github_app',
    connectedAt: '2026-07-29T18:30:00.000Z',
    updatedAt: '2026-07-29T18:30:00.000Z',
    source: 'github-app',
    ...overrides,
  };
}

function directoryWith(connection: Record<string, unknown>) {
  return { connectors: [connection], available: ['github'], entries: [], policy: null };
}

function catalogTool(name: string, readOnly: boolean) {
  return { name, readOnly, visibility: 'model', hasApp: false, parameters: [] };
}

const GITHUB_CATALOG = {
  connectorId: 'github',
  connectorLabel: 'GitHub',
  source: 'github-adapter',
  generatedAt: 1_785_000_000_000,
  protocolEra: 'legacy',
  supportedVersions: [],
  capabilityKeys: ['tools'],
  tasksSupported: false,
  rejectedTools: [],
  tools: [
    catalogTool('create_issue', false),
    catalogTool('close_issue', false),
    { ...catalogTool('list_issues', true), title: 'List open issues', description: 'Reads issues' },
  ],
  resources: [],
  resourceTemplates: [],
  prompts: [],
  apps: [],
  discoveryErrors: [],
};

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
    mockFetchDirectory.mockResolvedValue(directoryWith(githubConnection()));
    mockFetchListing.mockResolvedValue(null);
    mockFetchCapabilities.mockResolvedValue(GITHUB_CATALOG);
    mockFetchPermissions.mockResolvedValue([
      { connectorId: 'github', toolName: 'create_issue', level: 'ask' },
      { connectorId: 'slack', toolName: 'send_message', level: 'deny' },
    ]);
    mockSetPermission.mockResolvedValue(undefined);
    mockResetPermission.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
    mockDeleteCustom.mockResolvedValue(undefined);
  });

  it("shows account and connection metadata plus only this connector's tools", async () => {
    mockFetchListing.mockResolvedValue({
      id: 'github',
      name: 'GitHub',
      publisher: 'GitHub, Inc.',
      description: 'Issues and pull requests',
      iconUrl: null,
      authMode: 'oauth',
      connectable: 'connect',
      toolNames: [],
      documentationUrl: null,
      websiteUrl: null,
      supportUrl: null,
      privacyPolicyUrl: null,
    });
    const screen = render(<ConnectorDetailScreen connectorId="github" />);

    await waitFor(() => expect(screen.getByText('Connected to AGI Cloud')).toBeTruthy());
    expect(mockFetchListing).toHaveBeenCalledWith('github');
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByText('GitHub App')).toBeTruthy();
    expect(screen.getByText('GitHub, Inc.')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Create Issue')).toBeTruthy());
    expect(mockFetchCapabilities).toHaveBeenCalledWith('github');
    expect(screen.getByText('create_issue')).toBeTruthy();
    expect(screen.queryByText('Send Message')).toBeNull();
    expect(screen.queryByText('send_message')).toBeNull();
    expect(screen.queryByLabelText('Reset send_message to default')).toBeNull();
  });

  it('lists every catalog tool with its permission even when no saved row exists', async () => {
    mockFetchPermissions.mockResolvedValue([
      { connectorId: 'github', toolName: 'create_issue', level: 'ask' },
      { connectorId: 'github', toolName: '*read_only', level: 'allow' },
    ]);
    const screen = render(<ConnectorDetailScreen connectorId="github" />);

    await waitFor(() => expect(screen.getByText('Write and delete tools')).toBeTruthy());
    expect(screen.getByText('Read-only tools')).toBeTruthy();

    for (const toolName of ['create_issue', 'close_issue', 'list_issues']) {
      expect(screen.getByText(toolName)).toBeTruthy();
      for (const label of ['Allow', 'Ask', 'Block']) {
        expect(screen.getByRole('radio', { name: `${label} ${toolName}` })).toBeTruthy();
      }
    }

    expect(screen.getByText('Close Issue')).toBeTruthy();
    expect(screen.getByText('List open issues')).toBeTruthy();
    expect(screen.getByText('Reads issues')).toBeTruthy();

    expect(screen.getByLabelText('create_issue permission. Ask')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Ask create_issue', checked: true })).toBeTruthy();
    expect(screen.getByLabelText('Reset create_issue to default')).toBeTruthy();

    expect(screen.getByLabelText('close_issue permission. Not set')).toBeTruthy();
    for (const label of ['Allow', 'Ask', 'Block']) {
      expect(
        screen.getByRole('radio', { name: `${label} close_issue`, checked: false }),
      ).toBeTruthy();
    }
    expect(screen.getByText('Not set')).toBeTruthy();
    expect(screen.queryByLabelText('Reset close_issue to default')).toBeNull();

    expect(screen.getByLabelText('list_issues permission. Allow')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Allow list_issues', checked: true })).toBeTruthy();
    expect(screen.getByText('Set for all read-only tools')).toBeTruthy();
    expect(screen.queryByLabelText('Reset list_issues to default')).toBeNull();

    fireEvent.press(screen.getByRole('radio', { name: 'Block close_issue' }));
    await waitFor(() =>
      expect(mockSetPermission).toHaveBeenCalledWith('github', 'close_issue', 'deny'),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('close_issue permission. Block')).toBeTruthy(),
    );
    expect(screen.getByLabelText('Reset close_issue to default')).toBeTruthy();
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
    expect(screen.getByLabelText('create_issue permission. Block')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Reset create_issue to default'));
    await waitFor(() => expect(mockResetPermission).toHaveBeenCalledWith('github', 'create_issue'));
    await waitFor(() =>
      expect(screen.getByLabelText('create_issue permission. Not set')).toBeTruthy(),
    );
    expect(screen.queryByLabelText('Reset create_issue to default')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Block create_issue', checked: false })).toBeTruthy();
  });

  it('keeps saved permissions editable when the tool list fails, without the raw error', async () => {
    mockFetchCapabilities.mockRejectedValue(new Error('upstream 502 from tools.internal'));
    const screen = render(<ConnectorDetailScreen connectorId="github" />);

    await waitFor(() => expect(screen.getByText('Could not load the tool list')).toBeTruthy());
    expect(screen.getByText('The tools for GitHub did not load. Try again.')).toBeTruthy();
    expect(screen.queryByText(/tools\.internal/)).toBeNull();
    expect(screen.getByLabelText('create_issue permission. Ask')).toBeTruthy();
    expect(screen.getByLabelText('Reset create_issue to default')).toBeTruthy();
    expect(screen.queryByText('send_message')).toBeNull();
    expect(screen.queryByText('Write and delete tools')).toBeNull();

    mockFetchCapabilities.mockResolvedValue(GITHUB_CATALOG);
    fireEvent.press(screen.getByLabelText('Retry loading tools'));
    await waitFor(() => expect(screen.getByText('Write and delete tools')).toBeTruthy());
    expect(screen.queryByText('Could not load the tool list')).toBeNull();
    expect(screen.getByText('close_issue')).toBeTruthy();
  });

  it('warns about a connection that is not responding and checks it again', async () => {
    mockFetchDirectory.mockResolvedValue(
      directoryWith(githubConnection({ health: 'not-responding' })),
    );
    const screen = render(<ConnectorDetailScreen connectorId="github" />);

    await waitFor(() => expect(screen.getByText('Not responding')).toBeTruthy());
    expect(screen.getByText(/GitHub has not answered its recent requests/)).toBeTruthy();
    expect(mockFetchDirectory).toHaveBeenCalledTimes(1);

    mockFetchDirectory.mockResolvedValue(directoryWith(githubConnection({ health: 'connected' })));
    fireEvent.press(screen.getByLabelText('Check GitHub again'));

    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Not responding')).toBeNull());
    expect(screen.getByText('Connected to AGI Cloud')).toBeTruthy();
  });

  it('shows fixed copy instead of the raw error when the connector fails to load', async () => {
    mockFetchDirectory.mockRejectedValue(new Error('ECONNRESET at 10.0.0.12:443'));
    const screen = render(<ConnectorDetailScreen connectorId="github" />);

    await waitFor(() => expect(screen.getByText('Could not load connector')).toBeTruthy());
    expect(screen.getByText('Could not load this connector. Retry.')).toBeTruthy();
    expect(screen.queryByText(/ECONNRESET/)).toBeNull();
    expect(mockFetchCapabilities).not.toHaveBeenCalled();
  });

  it('keeps disconnect behind a destructive confirmation and leaves it in the detail footer', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const screen = render(<ConnectorDetailScreen connectorId="github" />);

    await waitFor(() => expect(screen.getByLabelText('Disconnect GitHub')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Disconnect GitHub'));
    expect(mockDisconnect).not.toHaveBeenCalled();
    const disconnectAction = alert.mock.calls
      .at(-1)?.[2]
      ?.find((button) => button.text === 'Disconnect');
    expect(disconnectAction?.style).toBe('destructive');

    await act(async () => {
      disconnectAction?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledWith('github'));
    expect(mockDeleteCustom).not.toHaveBeenCalled();
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
    await waitFor(() => expect(mockFetchListing).toHaveBeenCalledWith('github'));

    await act(async () => {
      mockOwnerId = 'user-b';
      mockEpoch = 2;
      mockAuthState.clerkUserId = 'user-b';
      resolveDirectory(directoryWith(githubConnection({ id: 'github-app-a', connectedAt: '' })));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByText('Connected to AGI Cloud')).toBeNull();
    expect(screen.queryByText('Could not load connector')).toBeNull();
    expect(mockFetchCapabilities).not.toHaveBeenCalled();
    expect(mockFetchPermissions).not.toHaveBeenCalled();
  });

  it('fails an invalid dynamic-route id without issuing a Cloud request', async () => {
    const screen = render(<ConnectorDetailScreen connectorId="" />);

    await waitFor(() => expect(screen.getByText('Could not load connector')).toBeTruthy());
    expect(screen.getByText('This connector link is invalid.')).toBeTruthy();
    expect(mockFetchDirectory).not.toHaveBeenCalled();
    expect(mockFetchListing).not.toHaveBeenCalled();
    expect(mockFetchCapabilities).not.toHaveBeenCalled();
    expect(mockFetchPermissions).not.toHaveBeenCalled();
  });
});
