/* eslint-disable @typescript-eslint/no-require-imports */

import { act, render } from '@testing-library/react-native';

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: null }),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => (
        <View {...rest}>{children}</View>
      ),
    },
    FadeIn: { duration: () => ({ delay: () => ({}) }) },
    FadeInDown: { duration: () => ({ delay: () => ({}) }) },
    useReducedMotion: () => false,
  };
});

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../src/features/chat/components/NewChatConnectorSuggestions', () => {
  const { Text } = require('react-native');
  return { NewChatConnectorSuggestions: () => <Text>connector suggestions</Text> };
});

import { ChatEmptyState } from '../src/features/chat/components/ChatEmptyState';
import { useAuthStore } from '../src/features/auth/store';
import { useTierStore } from '../src/features/billing/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';

describe('ChatEmptyState connector discovery', () => {
  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkSignedIn: true });
    useTierStore.setState({ grantedCapabilities: ['canUseConnectors'] });
    useCloudSettingsStore.setState({ connectorDiscoveryEnabled: true });
  });

  it('suggests connectors on a new Cloud chat while discovery is on', () => {
    const { getByText } = render(<ChatEmptyState />);
    expect(getByText('connector suggestions')).toBeTruthy();
  });

  it('hides connector suggestions once discovery is turned off', () => {
    const { queryByText } = render(<ChatEmptyState />);
    act(() => useCloudSettingsStore.getState().setConnectorDiscoveryEnabled(false));
    expect(queryByText('connector suggestions')).toBeNull();
  });

  it('keeps discovery on by default', () => {
    expect(useCloudSettingsStore.getInitialState().connectorDiscoveryEnabled).toBe(true);
  });
});
