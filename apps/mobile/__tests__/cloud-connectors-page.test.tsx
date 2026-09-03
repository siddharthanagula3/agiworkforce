/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: jest.fn(),
    push: jest.fn(),
  }),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Path: () => null,
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return {
    Plug: icon,
    Link: icon,
    CheckCircle: icon,
    ArrowLeft: icon,
    ChevronRight: icon,
  };
});

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { connectors: false } }));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: { isClerkLoaded: boolean; isClerkSignedIn: boolean }) => unknown) =>
    selector({ isClerkLoaded: true, isClerkSignedIn: true }),
}));

import CloudConnectorsScreen from '../app/(app)/settings/cloud-connectors';

describe('Cloud Connectors screen, unshipped-feature gating (public alpha)', () => {
  it('shows only the waitlist placeholder, not the interactive catalog, when FEATURES.connectors is false', () => {
    const { getByText, queryByText } = render(<CloudConnectorsScreen />);

    expect(getByText('Connectors, AGI Cloud')).toBeTruthy();
    expect(queryByText('Notion')).toBeNull();
    expect(queryByText('Slack')).toBeNull();
  });
});
