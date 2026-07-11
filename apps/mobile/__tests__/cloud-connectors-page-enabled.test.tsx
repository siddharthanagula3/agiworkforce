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
    RefreshCw: icon,
    Search: icon,
    CloudOff: icon,
  };
});

jest.mock('../src/features/connectors/store', () => ({
  useConnectorsStore: (selector: (s: { connectedIds: string[]; toggle: () => void }) => unknown) =>
    selector({ connectedIds: [], toggle: jest.fn() }),
}));

// The connectors screen shows a "Chat is set to Local Mode" blocked banner
// unless the app is in Cloud mode (connectors are a cloud-managed feature —
// same trust gate as the AddToChatSheet). Put the screen in Cloud mode so the
// interactive catalog renders and the shipped-feature assertions below apply.
jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (s: { appMode: string; setAppMode: () => void }) => unknown) =>
    selector({ appMode: 'cloud', setAppMode: jest.fn() }),
}));

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { connectors: true } }));

import CloudConnectorsScreen from '../app/(app)/settings/cloud-connectors';

describe('Cloud Connectors screen — shipped-feature state', () => {
  it('renders the interactive catalog once FEATURES.connectors is true, with no placeholder', () => {
    const { getByText, queryByText } = render(<CloudConnectorsScreen />);

    expect(getByText('Notion')).toBeTruthy();
    expect(queryByText('Connectors — AGI Cloud')).toBeNull();
  });
});
