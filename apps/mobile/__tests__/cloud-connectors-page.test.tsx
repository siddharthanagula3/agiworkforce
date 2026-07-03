/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: jest.fn(),
  }),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
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

jest.mock('../src/features/connectors/store', () => ({
  useConnectorsStore: (selector: (s: { connectedIds: string[]; toggle: () => void }) => unknown) =>
    selector({ connectedIds: [], toggle: jest.fn() }),
}));

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { connectors: false } }));

import CloudConnectorsScreen from '../app/(app)/settings/cloud-connectors';

describe('Cloud Connectors screen — unshipped-feature gating (public alpha)', () => {
  it('shows only the waitlist placeholder, not the interactive catalog, when FEATURES.connectors is false', () => {
    const { getByText, queryByText } = render(<CloudConnectorsScreen />);

    // Regression: the doc comment promises "a waitlist placeholder is shown
    // rather than a dead list" when the flag is off, but the catalog rendered
    // unconditionally below the placeholder — a user saw a fully interactive
    // Notion/Airtable/Trello/... list whose "Connect" button popped a broken
    // "AGI Cloud access... join the waitlist" alert that contradicted the
    // flag's own "not a cloud-access gate" contract.
    expect(getByText('Connectors — AGI Cloud')).toBeTruthy();
    expect(queryByText('Notion')).toBeNull();
    expect(queryByText('Slack')).toBeNull();
  });
});
