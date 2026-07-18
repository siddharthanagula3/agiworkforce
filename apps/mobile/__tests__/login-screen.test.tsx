/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockUseAuth = jest.fn(() => ({ isLoaded: true, isSignedIn: mockIsSignedIn }));

// Capture the props Clerk's AuthView is rendered with so we can assert the
// sign-in mode without pretending that native dismissal events are reliable.
let lastAuthViewProps: { mode?: string; isDismissible?: boolean; onDismiss?: () => void } = {};
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
  useAuth: (options?: { treatPendingAsSignedOut?: boolean }) => mockUseAuth(options),
}));

// AuthView is a native SwiftUI/Compose component; in Jest it has no testable
// tree, so stub it while retaining the props passed across the native boundary.
jest.mock('@clerk/expo/native', () => {
  const { Text } = require('react-native');
  return {
    AuthView: (props: { mode?: string; isDismissible?: boolean; onDismiss?: () => void }) => {
      lastAuthViewProps = props;
      return <Text>AuthView:{props.mode}</Text>;
    },
  };
});

jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => ({
    surfaceBase: '#000000',
    surfaceElevated: '#212121',
    textPrimary: '#f4f4f4',
    border: 'rgba(255, 255, 255, 0.10)',
  }),
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
    expect(mockUseAuth).toHaveBeenCalledWith({ treatPendingAsSignedOut: false });
  });

  it('uses an app-owned close control that reliably returns to Local Mode', () => {
    const { getByTestId } = render(<LoginScreen />);

    expect(lastAuthViewProps.isDismissible).toBe(false);
    expect(lastAuthViewProps.onDismiss).toBeUndefined();
    fireEvent.press(getByTestId('cloud-sign-in-dismiss'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)');
  });

  it('redirects into the app once the Clerk session is signed in', () => {
    mockIsSignedIn = true;

    const { getByText } = render(<LoginScreen />);

    expect(getByText('Redirect:/(app)')).toBeTruthy();
  });
});
