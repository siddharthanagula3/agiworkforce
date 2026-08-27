/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockFetchPreferenceNamespace = jest.fn();
const mockSavePreferenceNamespace = jest.fn();

jest.mock('@/services/preferences', () => ({
  fetchPreferenceNamespace: (...args: unknown[]) => mockFetchPreferenceNamespace(...args),
  savePreferenceNamespace: (...args: unknown[]) => mockSavePreferenceNamespace(...args),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return {
    AlertOctagon: icon,
    AlertTriangle: icon,
    ArrowLeft: icon,
    Bell: icon,
    BellOff: icon,
    Bot: icon,
    CheckSquare: icon,
    ChevronRight: icon,
    Clock: icon,
    CloudOff: icon,
    Info: icon,
    Mail: icon,
    Moon: icon,
    Vibrate: icon,
    X: icon,
  };
});

import NotificationPreferencesScreen from '../src/features/settings/notifications';
import {
  ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE,
  AGENT_ACTIVITY_PUSH_PREFERENCE_KEY,
} from '../src/features/settings/notifications/useAgentActivityPushSync';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

const AGENT_PUSH_SWITCH_LABEL = 'Agent Run Push';

describe('agent activity push preference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSavePreferenceNamespace.mockResolvedValue(undefined);
    mockFetchPreferenceNamespace.mockImplementation((namespace: string) =>
      Promise.resolve(
        namespace === ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE ? { browserReplyReady: true } : {},
      ),
    );
    act(() => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useAuthStore.setState({ isClerkSignedIn: true });
    });
  });

  afterEach(() => {
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
      useAuthStore.setState({ isClerkSignedIn: false });
    });
  });

  it('writes the opt-out the cloud agent sender reads, preserving the keys web owns', async () => {
    const screen = render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(mockFetchPreferenceNamespace).toHaveBeenCalledWith(
        ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE,
      );
    });

    const toggle = screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL);
    fireEvent(toggle, 'valueChange', false);

    await waitFor(() => {
      expect(mockSavePreferenceNamespace).toHaveBeenCalledWith(
        ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE,
        { browserReplyReady: true, [AGENT_ACTIVITY_PUSH_PREFERENCE_KEY]: false },
      );
    });
  });

  it('treats a stored opt-out as off and leaves an absent key on', async () => {
    mockFetchPreferenceNamespace.mockImplementation((namespace: string) =>
      Promise.resolve(
        namespace === ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE
          ? { [AGENT_ACTIVITY_PUSH_PREFERENCE_KEY]: false }
          : {},
      ),
    );

    const screen = render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL).props.value).toBe(false);
    });
  });
});
