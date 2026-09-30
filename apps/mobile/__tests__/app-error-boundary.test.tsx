import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: () => icon });
});

import AppErrorBoundary from '@/app/(app)/error';
import AuthErrorBoundary from '@/app/(auth)/error';
import PublicErrorBoundary from '@/app/(public)/error';
import RootErrorBoundary from '@/app/error';

it.each([
  ['app', AppErrorBoundary],
  ['auth', AuthErrorBoundary],
  ['public', PublicErrorBoundary],
  ['root', RootErrorBoundary],
])('%s error boundary hides exception details and keeps recovery available', (_name, Boundary) => {
  const retry = jest.fn();
  const screen = render(
    <Boundary error={new Error('internal provider key at /private/path')} retry={retry} />,
  );

  expect(screen.queryByText('internal provider key at /private/path')).toBeNull();
  fireEvent.press(screen.getByLabelText(/Retry|Try again/i));
  expect(retry).toHaveBeenCalledTimes(1);
});
