/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { RefreshControl } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockFetch = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    canGoBack: () => false,
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'View' }));
jest.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = () => <View />;
  return { ArrowLeft: Icon, AlertCircle: Icon, Brain: Icon };
});
jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return { useTheme: () => ({ colors: tokens.lightColors, statusBarStyle: 'dark' }) };
});
jest.mock('@/src/features/auth/store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand');
  return {
    useAuthStore: create(() => ({ isClerkLoaded: true, isClerkSignedIn: true })),
  };
});
jest.mock('@/src/features/chat/store/appModeStore', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand');
  return { useChatAppModeStore: create(() => ({ appMode: 'cloud', setAppMode: jest.fn() })) };
});
jest.mock('@/src/features/settings/Common', () => ({
  CloudAccountRequired: () => null,
  CloudSyncBlockedBanner: () => null,
}));
jest.mock('@/src/features/reflect', () => {
  class ReflectMemoryRequiredError extends Error {}
  return {
    REFLECT_RANGES: [
      { value: '30d', label: '30 days' },
      { value: '90d', label: '3 months' },
    ],
    ReflectMemoryRequiredError,
    fetchReflectRecap: (...args: unknown[]) => mockFetch(...args),
  };
});

import { ReflectMemoryRequiredError } from '@/src/features/reflect';
import ReflectScreen from '../app/(app)/settings/reflect';

type Call = {
  range: string;
  signal: AbortSignal | undefined;
  reject: (error: unknown) => void;
};

describe('Reflect request lifetime', () => {
  let calls: Call[];

  beforeEach(() => {
    calls = [];
    mockFetch.mockReset();
    mockFetch.mockImplementation(
      (range: string, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          calls.push({ range, signal, reject });
        }),
    );
  });

  async function refresh(screen: ReturnType<typeof render>) {
    const control = screen.UNSAFE_getByType(RefreshControl);
    await act(async () => {
      control.props.onRefresh();
    });
  }

  it('gives a manual refresh an abort signal that the next range selection aborts', async () => {
    const screen = render(<ReflectScreen />);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].signal?.aborted).toBe(false);

    await refresh(screen);
    expect(calls).toHaveLength(2);
    expect(calls[0].signal?.aborted).toBe(true);
    expect(calls[1].signal).toBeInstanceOf(AbortSignal);
    expect(calls[1].signal?.aborted).toBe(false);

    fireEvent.press(screen.getByLabelText('Show the past 3 months'));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[1].signal?.aborted).toBe(true);
    expect(calls[2].range).toBe('90d');
    expect(calls[2].signal?.aborted).toBe(false);
  });

  it('does not let a superseded refresh publish its result', async () => {
    const screen = render(<ReflectScreen />);
    await waitFor(() => expect(calls).toHaveLength(1));
    await refresh(screen);

    fireEvent.press(screen.getByLabelText('Show the past 3 months'));
    await waitFor(() => expect(calls).toHaveLength(3));

    await act(async () => {
      calls[1].reject(new ReflectMemoryRequiredError());
    });
    expect(screen.queryByText('Memory is off')).toBeNull();
  });

  it('aborts an in-flight refresh when the screen unmounts', async () => {
    const screen = render(<ReflectScreen />);
    await waitFor(() => expect(calls).toHaveLength(1));
    await refresh(screen);
    expect(calls).toHaveLength(2);

    screen.unmount();
    expect(calls[1].signal?.aborted).toBe(true);
  });
});
