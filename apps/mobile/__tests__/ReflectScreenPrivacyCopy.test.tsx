/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

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
jest.mock('@/src/features/reflect', () => ({
  REFLECT_RANGES: [{ value: '30d', label: '30 days' }],
  ReflectMemoryRequiredError: class ReflectMemoryRequiredError extends Error {},
  fetchReflectRecap: () => new Promise(() => undefined),
}));

import ReflectScreen from '../app/(app)/settings/reflect';

describe('Reflect privacy footer', () => {
  it('discloses that recaps are built from chat titles and opening messages on the server', () => {
    const screen = render(<ReflectScreen />);

    expect(screen.queryByText(/never reads message text/i)).toBeNull();
    expect(
      screen.getByText(/worked out on our servers from chat titles and your first few messages/),
    ).toBeTruthy();
  });
});
