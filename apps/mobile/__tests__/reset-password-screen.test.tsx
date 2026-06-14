/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockOpenExternalUrl = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useLocalSearchParams: () => ({
    type: 'recovery',
  }),
}));

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

import ResetPasswordScreen from '../app/(auth)/reset-password';

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenExternalUrl.mockResolvedValue(true);
  });

  it('uses the web-owned recovery handoff instead of a dead native password form', async () => {
    const { getByText, getByLabelText, queryByPlaceholderText } = render(<ResetPasswordScreen />);

    expect(getByText('Recover your AGI account')).toBeTruthy();
    expect(queryByPlaceholderText('New password')).toBeNull();
    expect(queryByPlaceholderText('Confirm new password')).toBeNull();

    fireEvent.press(getByLabelText('Open Web Account'));

    await waitFor(() => {
      expect(mockOpenExternalUrl).toHaveBeenCalledWith(
        'https://agiworkforce.com/auth/reset-password',
      );
    });
  });

  it('can return to the mobile sign-in route', () => {
    const { getByLabelText } = render(<ResetPasswordScreen />);

    fireEvent.press(getByLabelText('Back to Sign In'));

    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(auth)/login' });
  });
});
