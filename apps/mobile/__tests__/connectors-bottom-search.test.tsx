/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * PAR-M31 — the connectors directory search must not scroll away.
 *
 * The field lived inside the settings shell's ScrollView, so on a catalog this
 * long it left the screen after a couple of flicks and the only way back to it
 * was scrolling to the top. It is now the shared `BottomSearchBar`, pinned over
 * the shell, with a trailing spacer inside the scroll content so the last
 * connector row can still be scrolled clear of it.
 */
import React from 'react';
import { ScrollView } from 'react-native';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';

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
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn() }),
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
jest.mock('@/services/connectors', () => ({
  fetchConnectorDirectory: (...args: unknown[]) => mockFetchDirectory(...args),
  connectConnector: jest.fn(),
  disconnectConnector: jest.fn(),
  deleteCustomConnector: jest.fn(),
  getGitHubInstallWebUrl: jest.fn(() => 'https://agiworkforce.com/api/github/install/start'),
}));

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
    mockFetchDirectory.mockResolvedValue({ connectors: [], available: ['slack'] });
  });

  it('pins the field outside every scroll view instead of inside the shell list', async () => {
    const screen = render(<CloudConnectorsScreen />);
    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('connectors-search')).toBeTruthy();
    // Neither the shell's vertical scroll view nor the horizontal chip row may
    // contain it — being inside either is what made it scroll out of reach.
    for (const scrollView of screen.UNSAFE_getAllByType(ScrollView)) {
      expect(within(scrollView).queryByTestId('connectors-search')).toBeNull();
    }
  });

  it('still filters the catalog from the moved field', async () => {
    const screen = render(<CloudConnectorsScreen />);
    await waitFor(() => expect(screen.getByText('Notion')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('Search connectors'), 'slack');

    expect(screen.getByText('Slack')).toBeTruthy();
    expect(screen.queryByText('Notion')).toBeNull();
  });

  it('does not advertise a search field on a screen with no directory to search', () => {
    Object.assign(mockAuthState, { isClerkSignedIn: false, clerkUserId: null });

    const screen = render(<CloudConnectorsScreen />);

    expect(screen.getByLabelText('Sign in to AGI Cloud')).toBeTruthy();
    expect(screen.queryByTestId('connectors-search')).toBeNull();
    expect(mockFetchDirectory).not.toHaveBeenCalled();
  });
});
