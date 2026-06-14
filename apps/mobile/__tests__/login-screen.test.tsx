/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockReplace = jest.fn();

// Capture the props Clerk's AuthView is rendered with so we can assert the
// sign-in mode and drive its onDismiss callback from the test.
let lastAuthViewProps: { mode?: string; onDismiss?: () => void } = {};
let mockIsSignedIn = false;

jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>Redirect:{href}</Text>,
    useRouter: () => ({ replace: mockReplace }),
  };
});

jest.mock('@/lib/v1FeatureFlags', () => ({
  FEATURES: { auth: true },
}));

jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: mockIsSignedIn }),
}));

// AuthView is a native SwiftUI/Compose component; in Jest it has no testable
// tree, so stub it with a Pressable that surfaces its mode + onDismiss.
jest.mock('@clerk/expo/native', () => {
  const { Pressable, Text } = require('react-native');
  return {
    AuthView: (props: { mode?: string; onDismiss?: () => void }) => {
      lastAuthViewProps = props;
      return (
        <Pressable accessibilityLabel="Dismiss native sign-in" onPress={() => props.onDismiss?.()}>
          <Text>AuthView:{props.mode}</Text>
        </Pressable>
      );
    },
  };
});

jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => ({ surfaceBase: '#000000' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

import LoginScreen from '../app/(auth)/login';

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSignedIn = false;
    lastAuthViewProps = {};
  });

  it('renders Clerk native AuthView in combined sign-in-or-up mode', () => {
    const { getByText } = render(<LoginScreen />);

    // Cloud sign-in is the native AuthView, not a web/credential form.
    expect(getByText('AuthView:signInOrUp')).toBeTruthy();
    expect(lastAuthViewProps.mode).toBe('signInOrUp');
  });

  it('returns to Local Mode when the AuthView is dismissed', () => {
    const { getByLabelText } = render(<LoginScreen />);

    fireEvent.press(getByLabelText('Dismiss native sign-in'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)');
  });

  it('redirects into the app once the Clerk session is signed in', () => {
    mockIsSignedIn = true;

    const { getByText } = render(<LoginScreen />);

    expect(getByText('Redirect:/(app)')).toBeTruthy();
  });
});
