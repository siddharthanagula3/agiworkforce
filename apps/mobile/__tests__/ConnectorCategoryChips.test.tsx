/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Image } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockParams: { category?: string | string[] } = {};
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
  useLocalSearchParams: () => mockParams,
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
    ...jest.requireActual('react-native-svg'),
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
  store.subscribe = jest.fn(() => jest.fn());
  return { useChatAppModeStore: store };
});

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { connectors: true } }));

jest.mock('@/src/features/billing/store', () => ({
  useTierStore: (selector: (s: typeof mockTierState) => unknown) => selector(mockTierState),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: typeof mockAuthState) => unknown) => selector(mockAuthState),
    { getState: () => mockAuthState, subscribe: jest.fn(() => jest.fn()) },
  ),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  subscribeCloudAccountEpochChange: jest.fn(() => jest.fn()),
  captureCloudAccountEpoch: () => ({ ownerId: mockAccountOwner, epoch: mockAccountEpoch }),
  isCloudAccountEpochCurrent: (snapshot: { ownerId: string; epoch: number }) =>
    snapshot.ownerId === mockAccountOwner && snapshot.epoch === mockAccountEpoch,
}));

jest.mock('@/services/preferences', () => ({
  fetchToolApprovalNamespace: jest.fn(async () => ({
    settings: { defaultPolicy: 'auto_approve_read_only' },
    autonomousToolApprovalsAllowed: true,
  })),
  savePreferenceNamespace: jest.fn(async () => undefined),
}));

const mockFetchDirectory = jest.fn();
const mockBrowseListings = jest.fn();
const mockAddCustom = jest.fn();
const mockStartOAuth = jest.fn();
const mockAuthorizeInApp = jest.fn();
jest.mock('@/services/connectors', () => ({
  fetchConnectorDirectory: (...args: unknown[]) => mockFetchDirectory(...args),
  browseConnectorListings: (...args: unknown[]) => mockBrowseListings(...args),
  addCustomConnector: (...args: unknown[]) => mockAddCustom(...args),
  startConnectorOAuth: (...args: unknown[]) => mockStartOAuth(...args),
  authorizeConnectorInApp: (...args: unknown[]) => mockAuthorizeInApp(...args),
}));

import CloudConnectorsScreen from '../app/(app)/settings/cloud-connectors';

function listing(id: string, name: string, categories: string[]) {
  return {
    id,
    name,
    publisher: `${name} Labs`,
    description: `${name} for your team.`,
    categories,
    authMode: 'oauth',
    connectable: 'connect',
    toolNames: [],
    iconUrl: null,
    documentationUrl: null,
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
  };
}

const NOTION = listing('notion', 'Notion', ['Productivity']);
const GITHUB = listing('github', 'GitHub', ['Code']);
const SERVER_CATEGORIES = ['Code', 'Health', 'Life sciences', 'Productivity'];

function page(entries: unknown[], nextCursor: string | null = null) {
  return { entries, nextCursor, categories: SERVER_CATEGORIES };
}

describe('Connector directory category chips', () => {
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
    mockFetchDirectory.mockResolvedValue({ connectors: [], available: [] });
  });

  it('shows a chip only for a category that has a listed connector', async () => {
    mockBrowseListings.mockResolvedValue(page([NOTION, GITHUB]));
    const { findByLabelText, queryByLabelText } = render(<CloudConnectorsScreen />);

    expect(await findByLabelText('Productivity connectors')).toBeTruthy();
    expect(queryByLabelText('Code connectors')).toBeTruthy();
    expect(queryByLabelText('Health connectors')).toBeNull();
    expect(queryByLabelText('Life sciences connectors')).toBeNull();
  });

  it('keeps the other chips, and still hides the empty ones, inside a category', async () => {
    mockBrowseListings.mockImplementation(async (filter: { category: string | null }) =>
      filter.category === 'Code' ? page([GITHUB]) : page([NOTION, GITHUB]),
    );
    const { findByLabelText, queryByLabelText, getByLabelText } = render(<CloudConnectorsScreen />);

    fireEvent.press(await findByLabelText('Code connectors'));
    await waitFor(() =>
      expect(mockBrowseListings).toHaveBeenLastCalledWith({
        search: '',
        category: 'Code',
        cursor: null,
      }),
    );
    expect(await findByLabelText(/^GitHub, GitHub Labs\./)).toBeTruthy();

    expect(getByLabelText('Productivity connectors')).toBeTruthy();
    expect(getByLabelText('Code connectors')).toBeTruthy();
    expect(queryByLabelText('Health connectors')).toBeNull();
    expect(queryByLabelText('Life sciences connectors')).toBeNull();
  });

  it('keeps every chip that has a connector after a search is typed and then cleared', async () => {
    mockBrowseListings.mockImplementation(
      async (filter: { search: string; category: string | null }) => {
        if (filter.search) return page([GITHUB]);
        return filter.category === 'Code' ? page([GITHUB]) : page([NOTION, GITHUB]);
      },
    );
    const { findByLabelText, findByPlaceholderText, getByLabelText, queryByLabelText } = render(
      <CloudConnectorsScreen />,
    );

    expect(await findByLabelText('Productivity connectors')).toBeTruthy();
    const searchField = await findByPlaceholderText('Search connectors');
    fireEvent.changeText(searchField, 'git');
    await waitFor(() =>
      expect(mockBrowseListings).toHaveBeenCalledWith({
        search: 'git',
        category: null,
        cursor: null,
      }),
    );
    fireEvent.press(getByLabelText('Code connectors'));
    fireEvent.changeText(searchField, '');
    await waitFor(() =>
      expect(mockBrowseListings).toHaveBeenLastCalledWith({
        search: '',
        category: 'Code',
        cursor: null,
      }),
    );

    expect(await findByLabelText('Productivity connectors')).toBeTruthy();
    expect(getByLabelText('Code connectors')).toBeTruthy();
    expect(queryByLabelText('Health connectors')).toBeNull();
  });

  it('keeps the chosen category selected when the server leaves it out of the page', async () => {
    const withoutCode = SERVER_CATEGORIES.filter((category) => category !== 'Code');
    mockBrowseListings.mockImplementation(
      async (filter: { search: string; category: string | null }) =>
        filter.category === 'Code'
          ? { entries: filter.search ? [] : [GITHUB], nextCursor: null, categories: withoutCode }
          : page([NOTION, GITHUB]),
    );
    const { findByLabelText, findByPlaceholderText, getByLabelText } = render(
      <CloudConnectorsScreen />,
    );

    fireEvent.press(await findByLabelText('Code connectors'));
    expect(await findByLabelText(/^GitHub, GitHub Labs\./)).toBeTruthy();
    expect(getByLabelText('Code connectors').props.accessibilityState).toEqual({ selected: true });

    const searchField = await findByPlaceholderText('Search connectors');
    fireEvent.changeText(searchField, 'zzz');
    await waitFor(() =>
      expect(mockBrowseListings).toHaveBeenLastCalledWith({
        search: 'zzz',
        category: 'Code',
        cursor: null,
      }),
    );
    expect(getByLabelText('Code connectors').props.accessibilityState).toEqual({ selected: true });

    const calls = mockBrowseListings.mock.calls.length;
    fireEvent.changeText(searchField, '');
    await waitFor(() => expect(mockBrowseListings.mock.calls.length).toBeGreaterThan(calls));
    expect(mockBrowseListings).toHaveBeenLastCalledWith({
      search: '',
      category: 'Code',
      cursor: null,
    });
    expect(await findByLabelText(/^GitHub, GitHub Labs\./)).toBeTruthy();
    expect(getByLabelText('Code connectors').props.accessibilityState).toEqual({ selected: true });
  });

  it('trusts the server list while more listings are still to be loaded', async () => {
    mockBrowseListings.mockResolvedValue(page([NOTION], '1'));
    const { findByLabelText } = render(<CloudConnectorsScreen />);

    expect(await findByLabelText('Health connectors')).toBeTruthy();
    expect(await findByLabelText('Life sciences connectors')).toBeTruthy();
  });

  it('shows no category chip when the directory lists nothing', async () => {
    mockBrowseListings.mockResolvedValue(page([]));
    const { findByText, queryByLabelText } = render(<CloudConnectorsScreen />);

    expect(await findByText('No connectors found')).toBeTruthy();
    expect(queryByLabelText('Productivity connectors')).toBeNull();
    expect(queryByLabelText('Health connectors')).toBeNull();
  });
});

describe('Connectors opened on a category', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockParams.category;
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
    mockFetchDirectory.mockResolvedValue({ connectors: [], available: [] });
    mockBrowseListings.mockImplementation(async (filter: { category: string | null }) =>
      filter.category === 'Code' ? page([GITHUB]) : page([NOTION, GITHUB]),
    );
  });

  it('lists only the requested category first and marks its chip selected', async () => {
    mockParams.category = 'Code';
    const { findByLabelText } = render(<CloudConnectorsScreen />);

    expect(await findByLabelText(/^GitHub, GitHub Labs\./)).toBeTruthy();
    expect(mockBrowseListings.mock.calls[0]?.[0]).toEqual({
      search: '',
      category: 'Code',
      cursor: null,
    });
    const chip = await findByLabelText('Code connectors');
    expect(chip.props.accessibilityState).toEqual({ selected: true });
  });

  it('reads the first value when the parameter repeats', async () => {
    mockParams.category = ['Code', 'Health'];
    render(<CloudConnectorsScreen />);

    await waitFor(() => expect(mockBrowseListings).toHaveBeenCalled());
    expect(mockBrowseListings.mock.calls[0]?.[0]).toEqual({
      search: '',
      category: 'Code',
      cursor: null,
    });
  });

  it.each(['Not a category', 'Connected', 'code', ''])(
    'ignores %p and lists everything',
    async (value) => {
      mockParams.category = value;
      const { findByLabelText } = render(<CloudConnectorsScreen />);

      expect(await findByLabelText(/^Notion, Notion Labs\./)).toBeTruthy();
      expect(mockBrowseListings.mock.calls[0]?.[0]).toEqual({
        search: '',
        category: null,
        cursor: null,
      });
      expect((await findByLabelText('Code connectors')).props.accessibilityState).toEqual({
        selected: false,
      });
    },
  );

  it('lists everything when no category is given', async () => {
    const { findByLabelText } = render(<CloudConnectorsScreen />);

    expect(await findByLabelText(/^Notion, Notion Labs\./)).toBeTruthy();
    expect(mockBrowseListings.mock.calls[0]?.[0]).toEqual({
      search: '',
      category: null,
      cursor: null,
    });
  });

  it('applies a category that arrives on an already mounted screen', async () => {
    const { findByLabelText, rerender } = render(<CloudConnectorsScreen />);
    expect(await findByLabelText(/^Notion, Notion Labs\./)).toBeTruthy();

    mockParams.category = 'Code';
    rerender(<CloudConnectorsScreen />);

    await waitFor(() =>
      expect(mockBrowseListings).toHaveBeenLastCalledWith({
        search: '',
        category: 'Code',
        cursor: null,
      }),
    );
    expect((await findByLabelText('Code connectors')).props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('goes back to All when a later open carries no category', async () => {
    mockParams.category = 'Code';
    const { findByLabelText, rerender } = render(<CloudConnectorsScreen />);
    expect((await findByLabelText('Code connectors')).props.accessibilityState).toEqual({
      selected: true,
    });

    delete mockParams.category;
    rerender(<CloudConnectorsScreen />);

    await waitFor(() =>
      expect(mockBrowseListings).toHaveBeenLastCalledWith({
        search: '',
        category: null,
        cursor: null,
      }),
    );
    expect((await findByLabelText('All connectors')).props.accessibilityState).toEqual({
      selected: true,
    });
    expect((await findByLabelText('Code connectors')).props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('goes back to All when the signed-in account changes', async () => {
    mockParams.category = 'Code';
    const { findByLabelText, rerender } = render(<CloudConnectorsScreen />);
    expect((await findByLabelText('Code connectors')).props.accessibilityState).toEqual({
      selected: true,
    });

    mockAuthState.clerkUserId = 'user-b';
    mockAccountOwner = 'user-b';
    mockAccountEpoch = 2;
    rerender(<CloudConnectorsScreen />);

    await waitFor(async () =>
      expect((await findByLabelText('All connectors')).props.accessibilityState).toEqual({
        selected: true,
      }),
    );
  });
});
