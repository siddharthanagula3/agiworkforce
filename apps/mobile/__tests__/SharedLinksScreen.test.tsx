import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';

const mockGet = jest.fn();
const mockFocusCallbacks: Array<() => void | (() => void)> = [];

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: jest.fn(),
  },
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    canGoBack: jest.fn(() => true),
    back: jest.fn(),
    navigate: jest.fn(),
  }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    mockFocusCallbacks.push(callback);
    useEffect(() => callback(), [callback]);
  },
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    useTheme: () => ({ statusBarStyle: 'dark', colors: tokens.lightColors }),
    useThemeColors: () => tokens.lightColors,
  };
});

import SharedLinksScreen from '../app/(app)/settings/shared-links';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

const share = {
  token: 'tok-1',
  title: 'Planning session',
  shareUrl: 'https://example.test/share/tok-1',
  modelId: 'model-a',
  provider: 'provider-a',
  messageCount: 3,
  createdAt: '2026-07-01T00:00:00.000Z',
  expiresAt: '2026-08-01T00:00:00.000Z',
  expired: false,
};

describe('Shared links screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusCallbacks.length = 0;
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('is titled in sentence case on the settings shell', async () => {
    mockGet.mockResolvedValue({ shares: [] });
    render(<SharedLinksScreen />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    expect(screen.getByText('Shared links')).toBeTruthy();
    expect(screen.getByLabelText('Go back')).toBeTruthy();
  });

  it('centres the empty state in the space below the header', async () => {
    mockGet.mockResolvedValue({ shares: [] });
    render(<SharedLinksScreen />);

    const empty = await screen.findByTestId('shared-links-empty');

    expect(empty.props.style).toMatchObject({ flex: 1, justifyContent: 'center' });
    expect(screen.getByText('No shared links yet')).toBeTruthy();
  });

  it('reloads the links when the screen regains focus, so a new share appears without a pull', async () => {
    mockGet.mockResolvedValueOnce({ shares: [] });
    render(<SharedLinksScreen />);
    expect(await screen.findByText('No shared links yet')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledTimes(1);

    mockGet.mockResolvedValueOnce({ shares: [share] });
    const refocus = mockFocusCallbacks[mockFocusCallbacks.length - 1];
    await act(async () => {
      refocus?.();
    });
    expect(mockGet).toHaveBeenCalledTimes(2);

    expect(await screen.findByText('Planning session')).toBeTruthy();
    expect(screen.queryByText('No shared links yet')).toBeNull();
  });
});
