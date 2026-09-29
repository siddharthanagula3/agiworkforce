/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockAuthState = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'user-a' as string | null,
};
let mockAccountOwner = 'user-a';
let mockAccountEpoch = 1;
const mockRefreshTier = jest.fn();
const mockTierState = {
  grantedCapabilities: ['canUseConnectors'],
  isRefreshing: false,
  lastRefreshedAt: '2026-07-26T00:00:00.000Z' as string | null,
  refreshTier: mockRefreshTier,
};

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    navigate: jest.fn(),
    push: mockPush,
  }),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

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
const mockBrowseListings = jest.fn();
const mockListingIconUrl = jest.fn();
const mockAddCustom = jest.fn();
jest.mock('@/services/connectors', () => ({
  fetchConnectorDirectory: (...args: unknown[]) => mockFetchDirectory(...args),
  browseConnectorListings: (...args: unknown[]) => mockBrowseListings(...args),
  connectorListingIconUrl: (...args: unknown[]) => mockListingIconUrl(...args),
  addCustomConnector: (...args: unknown[]) => mockAddCustom(...args),
}));

import CloudConnectorsScreen from '../app/(app)/settings/cloud-connectors';
import { useSettingsStore } from '@/stores/settingsStore';

function listing(id: string, name: string, publisher: string, overrides = {}) {
  return {
    id,
    name,
    publisher,
    description: `${name} for your team.`,
    categories: ['Productivity'],
    authMode: 'oauth',
    connectable: 'connect',
    toolNames: [],
    iconUrl: null,
    documentationUrl: null,
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
    ...overrides,
  };
}

const NOTION = listing('notion', 'Notion', 'Notion Labs');
const SLACK = listing('slack', 'Slack', 'Slack Technologies');
const LINEAR = listing('linear', 'Linear', 'Linear Orbit');

const CUSTOM_CONNECTION = {
  id: 'custom-row',
  connectorId: 'custom-ab12',
  authType: 'custom_mcp',
  connectedAt: '2026-07-26T10:00:00.000Z',
  updatedAt: '2026-07-26T10:00:00.000Z',
  source: 'custom',
  name: 'Internal tools',
};

function page(entries: unknown[], nextCursor: string | null = null) {
  return { entries, nextCursor, categories: ['Productivity'] };
}

describe('Cloud Connectors screen, shipped-feature state', () => {
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
    mockFetchDirectory.mockResolvedValue({ connectors: [CUSTOM_CONNECTION], available: [] });
    mockBrowseListings.mockResolvedValue(page([NOTION, SLACK]));
    mockListingIconUrl.mockReturnValue(null);
  });

  it('renders registry listings from the connector directory, with no placeholder', async () => {
    const { getByLabelText, queryByText } = render(<CloudConnectorsScreen />);

    await waitFor(() => expect(getByLabelText('Notion, Notion Labs. Not connected')).toBeTruthy());
    expect(getByLabelText('Slack, Slack Technologies. Not connected')).toBeTruthy();
    expect(queryByText('Connectors, AGI Cloud')).toBeNull();
    expect(mockFetchDirectory).toHaveBeenCalledTimes(1);
    expect(mockBrowseListings).toHaveBeenCalledWith({ search: '', category: null, cursor: null });
  });

  it('shows the approval policy where connectors are managed and opens its controls', async () => {
    const originalPolicy = useSettingsStore.getState().toolApprovalPolicy;
    const screen = render(<CloudConnectorsScreen />);

    try {
      expect(screen.getByText('Choose when AGI asks before a connected tool acts.')).toBeTruthy();
      act(() => useSettingsStore.getState().setToolApprovalPolicy('auto_approve_read_only'));
      fireEvent.press(screen.getByRole('button', { name: 'Action approvals. Auto' }));
      expect(mockPush).toHaveBeenCalledWith('/(app)/settings/auto-approve');
      await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(1));
    } finally {
      act(() => useSettingsStore.getState().setToolApprovalPolicy(originalPolicy));
    }
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
    expect(mockBrowseListings).not.toHaveBeenCalled();
  });

  it('does not render an account-A directory response after switching to account B', async () => {
    let resolveAccountA!: (value: unknown) => void;
    mockFetchDirectory
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAccountA = resolve;
        }),
      )
      .mockResolvedValueOnce({ connectors: [], available: [] });
    const screen = render(<CloudConnectorsScreen />);
    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(1));

    mockAccountOwner = 'user-b';
    mockAccountEpoch = 2;
    mockAuthState.clerkUserId = 'user-b';
    screen.rerender(<CloudConnectorsScreen />);
    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByLabelText('Slack, Slack Technologies. Not connected')).toBeTruthy(),
    );

    await act(async () => {
      resolveAccountA({
        connectors: [
          {
            id: 'account-a-slack',
            connectorId: 'slack',
            authType: 'oauth',
            connectedAt: '2026-07-26T10:00:00.000Z',
            updatedAt: '2026-07-26T10:00:00.000Z',
            source: 'oauth',
            name: 'Account A Slack',
          },
        ],
        available: [],
      });
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Slack, Slack Technologies. Not connected')).toBeTruthy();
    expect(screen.queryByLabelText(/^Slack, Slack Technologies\. Connected/)).toBeNull();
    expect(screen.queryByText('Account A Slack')).toBeNull();
  });

  it('renders connected custom MCP endpoints by their real server name', async () => {
    const { getByLabelText, getByText } = render(<CloudConnectorsScreen />);

    await waitFor(() => expect(getByLabelText('Internal tools. Connected Jul 26')).toBeTruthy());
    expect(getByText('Internal tools')).toBeTruthy();
  });

  it('shows a connection whose server stopped answering as Not responding', async () => {
    mockFetchDirectory.mockResolvedValue({
      connectors: [
        {
          id: 'oauth-notion',
          connectorId: 'notion',
          authType: 'oauth',
          connectedAt: '2026-07-26T10:00:00.000Z',
          updatedAt: '2026-07-26T10:00:00.000Z',
          source: 'oauth',
          health: 'not-responding',
        },
      ],
      available: [],
    });

    const { getAllByLabelText, getByLabelText, getByText } = render(<CloudConnectorsScreen />);

    await waitFor(() => expect(getByLabelText('Notion, Notion Labs. Not responding')).toBeTruthy());
    expect(getByText('Not responding')).toBeTruthy();
    expect(getAllByLabelText(/^Notion, Notion Labs\./)).toHaveLength(1);
  });

  it('opens the detail route for a registry listing instead of connecting from the list', async () => {
    const { getByLabelText } = render(<CloudConnectorsScreen />);

    await waitFor(() => expect(getByLabelText('Notion, Notion Labs. Not connected')).toBeTruthy());
    fireEvent.press(getByLabelText('Notion, Notion Labs. Not connected'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/connectors/[id]',
      params: { id: 'notion' },
    });
  });

  it('opens a connected connector detail from its row', async () => {
    const { getByLabelText } = render(<CloudConnectorsScreen />);

    await waitFor(() => expect(getByLabelText('Internal tools. Connected Jul 26')).toBeTruthy());
    fireEvent.press(getByLabelText('Internal tools. Connected Jul 26'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/connectors/[id]',
      params: { id: 'custom-ab12' },
    });
  });

  it('routes a registry connector saved as a custom connection to that connection', async () => {
    mockFetchDirectory.mockResolvedValue({
      connectors: [
        {
          ...CUSTOM_CONNECTION,
          connectorId: 'custom-notion-9f',
          directoryId: 'notion',
          name: 'Notion',
        },
      ],
      available: [],
    });

    const { getAllByLabelText, getByLabelText } = render(<CloudConnectorsScreen />);

    await waitFor(() =>
      expect(getByLabelText('Notion, Notion Labs. Connected Jul 26')).toBeTruthy(),
    );
    expect(getAllByLabelText(/^Notion, Notion Labs\./)).toHaveLength(1);
    fireEvent.press(getByLabelText('Notion, Notion Labs. Connected Jul 26'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/connectors/[id]',
      params: { id: 'custom-notion-9f' },
    });
  });

  it('sends the search to the connector directory after the debounce', async () => {
    const { getByLabelText } = render(<CloudConnectorsScreen />);
    await waitFor(() => expect(getByLabelText('Notion, Notion Labs. Not connected')).toBeTruthy());
    expect(mockBrowseListings).toHaveBeenCalledTimes(1);
    mockBrowseListings.mockResolvedValue(page([LINEAR]));

    fireEvent.changeText(getByLabelText('Search connectors'), 'linear');

    expect(mockBrowseListings).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(mockBrowseListings).toHaveBeenLastCalledWith({
        search: 'linear',
        category: null,
        cursor: null,
      }),
    );
    await waitFor(() => expect(getByLabelText('Linear, Linear Orbit. Not connected')).toBeTruthy());
  });

  it('does not flash No connectors found while the directory is still loading', async () => {
    mockFetchDirectory.mockResolvedValue({ connectors: [], available: [] });
    let resolveListings!: (value: unknown) => void;
    mockBrowseListings.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveListings = resolve;
      }),
    );

    const { getByLabelText, getByText, queryByText } = render(<CloudConnectorsScreen />);
    expect(queryByText('No connectors found')).toBeNull();
    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    expect(getByLabelText('Loading connectors')).toBeTruthy();
    expect(queryByText('No connectors found')).toBeNull();

    await act(async () => {
      resolveListings(page([]));
      await Promise.resolve();
    });

    await waitFor(() => expect(getByText('No connectors found')).toBeTruthy());
  });

  it('does not fetch connectors while signed out and routes to sign-in', () => {
    Object.assign(mockAuthState, { isClerkSignedIn: false, clerkUserId: null });

    const { getByLabelText, queryByText } = render(<CloudConnectorsScreen />);

    expect(getByLabelText('Sign in to AGI Cloud')).toBeTruthy();
    expect(queryByText('Notion')).toBeNull();
    expect(mockFetchDirectory).not.toHaveBeenCalled();
    expect(mockBrowseListings).not.toHaveBeenCalled();
    fireEvent.press(getByLabelText('Sign in to AGI Cloud'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { postAuthIntent: 'cloud-connectors' },
    });
  });
});
