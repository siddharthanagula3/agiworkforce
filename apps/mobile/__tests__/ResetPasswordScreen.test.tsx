/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockOpenInAppBrowser = jest.fn();
const mockOpenExternalUrl = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
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
  openInAppBrowser: (...args: unknown[]) => mockOpenInAppBrowser(...args),
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

import {
  EMBEDDED_PAGE_PARAM,
  EMBEDDED_PAGE_PARAM_VALUE,
  isEmbeddableAccountPagePath,
} from '@agiworkforce/types';
import ResetPasswordScreen from '../app/(auth)/reset-password';

function openedPage(call = 0): URL {
  return new URL(mockOpenInAppBrowser.mock.calls[call]![0] as string);
}

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenExternalUrl.mockResolvedValue(true);
    mockOpenInAppBrowser.mockResolvedValue(true);
  });

  it('uses the web-owned recovery handoff instead of a dead native password form', async () => {
    const { getByText, getByLabelText, queryByPlaceholderText } = render(<ResetPasswordScreen />);

    expect(getByText('Recover your AGI account')).toBeTruthy();
    expect(queryByPlaceholderText('New password')).toBeNull();
    expect(queryByPlaceholderText('Confirm new password')).toBeNull();

    fireEvent.press(getByLabelText('Open Web Account'));

    await waitFor(() => expect(mockOpenInAppBrowser).toHaveBeenCalledTimes(1));
    expect(mockOpenExternalUrl).not.toHaveBeenCalled();
    const signIn = openedPage();
    expect(signIn.pathname).toBe('/login');
    const accountPage = new URL(signIn.searchParams.get('redirectTo') ?? '', signIn.origin);
    expect(isEmbeddableAccountPagePath(accountPage.pathname)).toBe(true);
    expect(accountPage.searchParams.get(EMBEDDED_PAGE_PARAM)).toBe(EMBEDDED_PAGE_PARAM_VALUE);
  });

  it('opens account recovery as the marked page in the in-app sheet', async () => {
    const { getByLabelText } = render(<ResetPasswordScreen />);

    fireEvent.press(getByLabelText('Lost Your Email or Two-Factor Device?'));

    await waitFor(() => expect(mockOpenInAppBrowser).toHaveBeenCalledTimes(1));
    expect(mockOpenExternalUrl).not.toHaveBeenCalled();
    expect(openedPage().pathname).toBe('/recover');
    expect(openedPage().searchParams.get(EMBEDDED_PAGE_PARAM)).toBe(EMBEDDED_PAGE_PARAM_VALUE);
  });

  it('never opens a link the app claims, which Android would hand straight back to this screen', async () => {
    const { expo } = jest.requireActual('../app.config.js') as {
      expo: { android?: { intentFilters?: Array<{ data?: Array<Record<string, string>> }> } };
    };
    const claims = (expo.android?.intentFilters ?? []).flatMap((filter) => filter.data ?? []);
    expect(claims.some((claim) => claim['path'] === '/auth/reset-password')).toBe(true);
    const { getByLabelText } = render(<ResetPasswordScreen />);

    fireEvent.press(getByLabelText('Open Web Account'));

    await waitFor(() => expect(mockOpenInAppBrowser).toHaveBeenCalled());
    const opened = openedPage();
    const claimed = claims.some(
      (claim) =>
        claim['host'] === opened.host &&
        (claim['path'] === opened.pathname ||
          (claim['pathPrefix'] !== undefined && opened.pathname.startsWith(claim['pathPrefix']))),
    );
    expect(claimed).toBe(false);
  });

  it('can return to the mobile sign-in route', () => {
    const { getByLabelText } = render(<ResetPasswordScreen />);

    fireEvent.press(getByLabelText('Back to Sign In'));

    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(auth)/login' });
  });
});
