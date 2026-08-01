/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const transition = { duration: () => transition, springify: () => transition };
  return {
    __esModule: true,
    default: { View },
    FadeIn: transition,
    FadeOut: transition,
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <View {...props} /> });
});

jest.mock('@/components/ui/text', () => {
  const { Text } = require('react-native');
  return { Text };
});

jest.mock('@/components/ui/button', () => {
  const { Pressable, Text } = require('react-native');
  return {
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/lib/mmkv', () => ({
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  rehydrateWhenMmkvReady: jest.fn(),
}));

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    colors: tokens.colors,
    useThemeColors: () => tokens.colors,
    useTheme: () => ({ colors: tokens.colors, isDark: true, statusBarStyle: 'light' }),
  };
});

const mockUseUser = jest.fn();
jest.mock('@clerk/expo', () => ({
  useUser: () => mockUseUser(),
}));

import {
  ConnectingView,
  ErrorView,
} from '../src/features/companion/components/ConnectionStateViews';

describe('Dispatch pairing recovery', () => {
  beforeEach(() => {
    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: 'ada@example.com' } },
      isLoaded: true,
      isSignedIn: true,
    });
  });

  it('lets the user abandon a connect attempt that is taking too long', () => {
    const onCancel = jest.fn();
    const screen = render(<ConnectingView onCancel={onCancel} />);

    fireEvent.press(screen.getByLabelText('Cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('replaces the raw transport error with a checklist that echoes the real account', () => {
    const screen = render(
      <ErrorView error="WebSocket closed: 1006 abnormal closure" onRetry={jest.fn()} />,
    );

    expect(screen.getByText('Pairing failed')).toBeTruthy();
    expect(screen.getByText('A few things to check on your computer:')).toBeTruthy();
    expect(screen.getByText(/Dispatch is turned on/)).toBeTruthy();
    expect(screen.getByText("You're signed in as ada@example.com")).toBeTruthy();
    expect(screen.getByText('Desktop is open and up to date')).toBeTruthy();
    expect(screen.queryByText('WebSocket closed: 1006 abnormal closure')).toBeNull();
  });

  it('keeps the transport error reachable behind the Details disclosure', () => {
    const screen = render(<ErrorView error="relay 503" onRetry={jest.fn()} />);

    fireEvent.press(screen.getByLabelText('Show error details'));
    expect(screen.getByText('relay 503')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Hide error details'));
    expect(screen.queryByText('relay 503')).toBeNull();
  });

  it('offers no Details control when the watchdog expired with no transport error', () => {
    const screen = render(<ErrorView error={null} onRetry={jest.fn()} />);

    expect(screen.queryByLabelText('Show error details')).toBeNull();
    expect(screen.getByText(/Dispatch is turned on/)).toBeTruthy();
  });

  it('does not invent an address when no signed-in email is known', () => {
    mockUseUser.mockReturnValue({ user: null, isLoaded: true, isSignedIn: false });

    const screen = render(<ErrorView error={null} onRetry={jest.fn()} />);

    expect(screen.queryByText(/signed in as/)).toBeNull();
    expect(
      screen.getByText("You're signed in on Desktop with the account you use here"),
    ).toBeTruthy();
  });

  it('retries from the failure screen', () => {
    const onRetry = jest.fn();
    const screen = render(<ErrorView error={null} onRetry={onRetry} />);

    fireEvent.press(screen.getByLabelText('Try Again'));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
