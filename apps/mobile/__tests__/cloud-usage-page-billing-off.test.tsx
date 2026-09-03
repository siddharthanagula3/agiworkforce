/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.lightColors,
  };
});

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return { BarChart3: Icon, RefreshCw: Icon, ChevronDown: Icon, ChevronUp: Icon };
});

jest.mock('@/src/features/settings/common', () => {
  const RN = require('react-native');
  return {
    SettingsScreenShell: ({ children }: { children: React.ReactNode }) => (
      <RN.View>{children}</RN.View>
    ),
    SettingsInfo: () => <RN.View />,
    CloudAccountRequired: () => <RN.Text>Sign in to AGI Cloud</RN.Text>,
  };
});

jest.mock('@/lib/safeOpenURL', () => ({ openExternalUrl: jest.fn() }));

const mockFetchUsageSnapshot = jest.fn();
jest.mock('@/services/usage', () => ({
  fetchUsageSnapshot: (...args: unknown[]) => mockFetchUsageSnapshot(...args),
}));

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { usageDashboard: false } }));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: { isClerkLoaded: boolean; isClerkSignedIn: boolean }) => unknown) =>
    selector({ isClerkLoaded: true, isClerkSignedIn: true }),
}));

import CloudUsageScreen from '../src/features/settings/cloud-usage/index';

describe('Cloud Usage screen, FEATURES.usageDashboard off', () => {
  it('shows the billing-unavailable placeholder, not a fetch attempt', () => {
    const { getByText } = render(<CloudUsageScreen />);

    expect(getByText('Usage dashboard coming soon')).toBeTruthy();
    expect(mockFetchUsageSnapshot).not.toHaveBeenCalled();
  });
});
