/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { ScrollView } from 'react-native';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';

const mockPush = jest.fn();

const mockAuthState = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'user-a' as string | null,
};
const mockTierState = {
  grantedCapabilities: ['canUseConnectors'],
  isRefreshing: false,
  lastRefreshedAt: '2026-07-26T00:00:00.000Z' as string | null,
  refreshTier: jest.fn(),
};

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ navigate: jest.fn(), push: mockPush }),
}));

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
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
  captureCloudAccountEpoch: () => ({ ownerId: 'user-a', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
}));

const mockFetchDirectory = jest.fn();
const mockBrowseListings = jest.fn();
jest.mock('@/services/connectors', () => ({
  fetchConnectorDirectory: (...args: unknown[]) => mockFetchDirectory(...args),
  browseConnectorListings: (...args: unknown[]) => mockBrowseListings(...args),
  connectorListingIconUrl: jest.fn(() => null),
  addCustomConnector: jest.fn(),
}));

function connection(connectorId: string, name: string) {
  return {
    id: `conn-${connectorId}`,
    connectorId,
    name,
    authType: 'oauth',
    connectedAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
    source: 'oauth',
  };
}

function listing(id: string, name: string, publisher: string) {
  return {
    id,
    name,
    publisher,
    description: `${name} tools`,
    iconUrl: null,
    authMode: 'oauth',
    connectable: 'connect',
    toolNames: [],
  };
}

function listingPage(entries: ReturnType<typeof listing>[]) {
  return { entries, nextCursor: null, categories: ['Productivity'] };
}

import CloudConnectorsScreen from '../app/(app)/settings/cloud-connectors';

describe('Connectors directory bottom-anchored search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockAuthState, {
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'user-a',
    });
    Object.assign(mockTierState, {
      grantedCapabilities: ['canUseConnectors'],
      isRefreshing: false,
      lastRefreshedAt: '2026-07-26T00:00:00.000Z',
    });
    mockFetchDirectory.mockResolvedValue({
      connectors: [connection('notion', 'Notion'), connection('slack', 'Slack')],
      available: [],
      entries: [],
      policy: null,
    });
    mockBrowseListings.mockImplementation(async ({ search }: { search: string }) =>
      search
        ? listingPage([listing('slack-standups', 'Slack Standups', 'Standup Labs')])
        : listingPage([listing('linear', 'Linear', 'Linear Orbit')]),
    );
  });

  it('pins the field outside every scroll view instead of inside the shell list', async () => {
    const screen = render(<CloudConnectorsScreen />);
    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('connectors-search')).toBeTruthy();
    for (const scrollView of screen.UNSAFE_getAllByType(ScrollView)) {
      expect(within(scrollView).queryByTestId('connectors-search')).toBeNull();
    }
  });

  it('filters connected rows at once and sends the trimmed search to the registry after the debounce', async () => {
    const screen = render(<CloudConnectorsScreen />);
    await waitFor(() => expect(screen.getByText('Linear')).toBeTruthy());
    expect(screen.getByText('Notion')).toBeTruthy();
    expect(screen.getByText('Slack')).toBeTruthy();
    expect(mockBrowseListings).toHaveBeenCalledTimes(1);
    expect(mockBrowseListings).toHaveBeenLastCalledWith({
      search: '',
      category: null,
      cursor: null,
    });

    fireEvent.changeText(screen.getByLabelText('Search connectors'), '  Slack ');

    expect(screen.getByText('Slack')).toBeTruthy();
    expect(screen.queryByText('Notion')).toBeNull();
    expect(mockBrowseListings).toHaveBeenCalledTimes(1);

    await waitFor(() =>
      expect(mockBrowseListings).toHaveBeenLastCalledWith({
        search: 'Slack',
        category: null,
        cursor: null,
      }),
    );
    await waitFor(() => expect(screen.getByText('Slack Standups')).toBeTruthy());
    expect(screen.queryByText('Linear')).toBeNull();
    expect(screen.queryByText('Notion')).toBeNull();
    expect(screen.getByText('Slack')).toBeTruthy();
  });

  it('opens the connector detail route from a row', async () => {
    const screen = render(<CloudConnectorsScreen />);
    await waitFor(() => expect(screen.getByText('Linear')).toBeTruthy());

    fireEvent.press(screen.getByRole('button', { name: /^Linear, Linear Orbit\. Not connected$/ }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/connectors/[id]',
      params: { id: 'linear' },
    });

    fireEvent.press(screen.getByRole('button', { name: /^Notion\. Connected / }));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/connectors/[id]',
      params: { id: 'notion' },
    });
  });

  it('does not advertise a search field on a screen with no directory to search', () => {
    Object.assign(mockAuthState, { isClerkSignedIn: false, clerkUserId: null });

    const screen = render(<CloudConnectorsScreen />);

    expect(screen.getByLabelText('Sign in to AGI Cloud')).toBeTruthy();
    expect(screen.queryByTestId('connectors-search')).toBeNull();
    expect(mockFetchDirectory).not.toHaveBeenCalled();
    expect(mockBrowseListings).not.toHaveBeenCalled();
  });
});
