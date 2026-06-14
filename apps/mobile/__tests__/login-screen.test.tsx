/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockOpenExternalUrl = jest.fn();

jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>Redirect:{href}</Text>,
    useRouter: () => ({
      replace: mockReplace,
    }),
  };
});

jest.mock('@/lib/v1FeatureFlags', () => ({
  FEATURES: {
    auth: true,
  },
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector?: (state: { hapticsEnabled: boolean }) => unknown) => {
    const state = { hapticsEnabled: false };
    return selector ? selector(state) : state;
  },
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
    mockOpenExternalUrl.mockResolvedValue(true);
  });

  it('uses a web-owned account handoff instead of dead native auth controls', async () => {
    const { getByText, getByLabelText, queryByPlaceholderText } = render(<LoginScreen />);

    expect(getByText('AGI account access')).toBeTruthy();
    expect(queryByPlaceholderText('you@example.com')).toBeNull();
    expect(queryByPlaceholderText('Enter your password')).toBeNull();
    expect(queryByPlaceholderText('Create a password')).toBeNull();

    fireEvent.press(getByLabelText('Open Web Sign In'));

    await waitFor(() => {
      expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://agiworkforce.com/login');
    });
  });

  it('lets users continue in local mode', () => {
    const { getByLabelText } = render(<LoginScreen />);

    fireEvent.press(getByLabelText('Continue in Local Mode'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)');
  });
});
