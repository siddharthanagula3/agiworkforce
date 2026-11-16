import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

const mockInstallations = jest.fn();
const mockFocus: { callback: (() => void) | null } = { callback: null };

jest.mock('expo-router', () => {
  const actual = jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock();
  return {
    ...actual,
    useFocusEffect: (callback: () => void) => {
      mockFocus.callback = callback;
      actual.useFocusEffect(callback);
    },
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) }),
  };
});
jest.mock('@clerk/expo', () => ({ getClerkInstance: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);
jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback: () => void) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/src/features/plugins/service', () => ({
  ...jest.requireActual('@/src/features/plugins/service'),
  fetchPluginInstallations: (...args: unknown[]) => mockInstallations(...args),
}));
jest.mock('../PersonalSourceRows', () => ({ PersonalSourceRows: () => null }));
jest.mock('../DiscoverSection', () => {
  const { Text } = jest.requireActual('react-native');
  const { createElement } = jest.requireActual('react');
  return { DiscoverSection: () => createElement(Text, null, 'discover-section') };
});

import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { CustomizeScreen } from '../CustomizeScreen';

function installation(pluginId: string) {
  return {
    pluginId,
    installedVersion: '1.0.0',
    enabled: true,
    installedAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('customize plugins row', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('says how many plugins are added', async () => {
    mockInstallations.mockResolvedValue([installation('a'), installation('b')]);
    const { findByLabelText, getByText } = render(<CustomizeScreen />);
    expect(await findByLabelText('Plugins, 2 added')).toBeTruthy();
    expect(getByText('2 added')).toBeTruthy();
  });

  it('shows no count when nothing is added', async () => {
    mockInstallations.mockResolvedValue([]);
    const { getByLabelText, queryByText } = render(<CustomizeScreen />);
    await waitFor(() => expect(mockInstallations).toHaveBeenCalled());
    expect(getByLabelText('Plugins')).toBeTruthy();
    expect(queryByText(/ added$/)).toBeNull();
  });

  it('hides a count that was showing when the plugins can no longer be loaded', async () => {
    mockInstallations.mockResolvedValue([installation('a'), installation('b')]);
    const { findByText, queryByText, getByLabelText } = render(<CustomizeScreen />);
    expect(await findByText('2 added')).toBeTruthy();

    mockInstallations.mockRejectedValue(new Error('offline'));
    await act(async () => {
      mockFocus.callback?.();
    });
    await waitFor(() => expect(mockInstallations).toHaveBeenCalledTimes(2));
    expect(queryByText('2 added')).toBeNull();
    expect(getByLabelText('Plugins')).toBeTruthy();
  });

  it('updates the count when the page is shown again', async () => {
    mockInstallations.mockResolvedValue([installation('a')]);
    const { findByText } = render(<CustomizeScreen />);
    expect(await findByText('1 added')).toBeTruthy();
    mockInstallations.mockResolvedValue([installation('a'), installation('b'), installation('c')]);
    await act(async () => {
      mockFocus.callback?.();
    });
    expect(await findByText('3 added')).toBeTruthy();
  });

  it('puts the discover section above the destination rows', () => {
    mockInstallations.mockResolvedValue([]);
    const { UNSAFE_root } = render(<CustomizeScreen />);
    const order = UNSAFE_root.findAll(
      (node) => typeof node.type === 'string' || typeof node.type === 'function',
    )
      .map((node) => node.props.accessibilityLabel ?? node.props.children)
      .filter((value): value is string => typeof value === 'string');
    expect(order.indexOf('discover-section')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('discover-section')).toBeLessThan(order.indexOf('Plugins'));
  });

  it('does not ask the server in Local mode', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const { getByLabelText } = render(<CustomizeScreen />);
    expect(getByLabelText('Plugins')).toBeTruthy();
    expect(mockInstallations).not.toHaveBeenCalled();
  });
});
