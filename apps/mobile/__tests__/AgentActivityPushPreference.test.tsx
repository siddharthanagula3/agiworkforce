/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockFetchPreferenceNamespace = jest.fn();
const mockSavePreferenceNamespace = jest.fn();
const mockPatchPreferenceNamespace = jest.fn();

jest.mock('@/services/preferences', () => ({
  fetchPreferenceNamespace: (...args: unknown[]) => mockFetchPreferenceNamespace(...args),
  savePreferenceNamespace: (...args: unknown[]) => mockSavePreferenceNamespace(...args),
  patchPreferenceNamespace: (...args: unknown[]) => mockPatchPreferenceNamespace(...args),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
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
    CalendarClock: icon,
    Sparkles: icon,
    BellOff: icon,
    Bot: icon,
    CheckSquare: icon,
    MessageSquare: icon,
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
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  captureCloudAccountEpoch,
} from '../src/features/auth/services/cloudAccountSession';

const AGENT_PUSH_SWITCH_LABEL = 'Agent Run Push';
const AGENT_PUSH_SYNCED_COPY = 'Applies on every device on this account.';

describe('agent activity push preference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('agent-push-account');
    mockSavePreferenceNamespace.mockResolvedValue(undefined);
    mockPatchPreferenceNamespace.mockReset().mockResolvedValue(undefined);
    mockFetchPreferenceNamespace.mockImplementation((namespace: string) =>
      Promise.resolve(
        namespace === ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE
          ? { browserReplyReady: true, emailDigest: false }
          : {},
      ),
    );
    act(() => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      useAuthStore.setState({
        isClerkSignedIn: true,
        isClerkLoaded: true,
        clerkUserId: 'agent-push-account',
      });
    });
  });

  afterEach(() => {
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
      useAuthStore.setState({ isClerkSignedIn: false, isClerkLoaded: false, clerkUserId: null });
    });
  });

  it('patches only the agent push opt-out after loading web-owned sibling settings', async () => {
    const screen = render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(screen.getByText(AGENT_PUSH_SYNCED_COPY)).toBeTruthy();
    });

    const toggle = screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL);
    fireEvent(toggle, 'valueChange', false);

    await waitFor(() => {
      expect(mockPatchPreferenceNamespace.mock.calls).toEqual([
        [
          ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE,
          { [AGENT_ACTIVITY_PUSH_PREFERENCE_KEY]: false },
          { accountEpoch: captureCloudAccountEpoch(), signal: expect.any(AbortSignal) },
        ],
      ]);
      expect(screen.getByText(AGENT_PUSH_SYNCED_COPY)).toBeTruthy();
    });
    expect(mockSavePreferenceNamespace).not.toHaveBeenCalled();
    expect(screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL).props.value).toBe(false);
  });

  it('treats a stored opt-out as off', async () => {
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

  it('leaves an absent key on after hydration without writing defaults', async () => {
    const screen = render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(screen.getByText(AGENT_PUSH_SYNCED_COPY)).toBeTruthy();
    });
    expect(screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL).props.value).toBe(true);
    expect(mockPatchPreferenceNamespace).not.toHaveBeenCalled();
    expect(mockSavePreferenceNamespace).not.toHaveBeenCalled();
  });

  it('rolls back an optimistic toggle when its patch fails', async () => {
    let rejectPatch!: (reason: Error) => void;
    mockPatchPreferenceNamespace.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectPatch = reject;
      }),
    );
    const screen = render(<NotificationPreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByText(AGENT_PUSH_SYNCED_COPY)).toBeTruthy();
    });

    fireEvent(screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL), 'valueChange', false);
    expect(screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL).props.value).toBe(false);
    expect(screen.getByText('Saving to your account…')).toBeTruthy();
    expect(screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL).props.disabled).toBe(true);

    await act(async () => {
      rejectPatch(new Error('Patch failed'));
    });

    await waitFor(() => {
      expect(screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL).props.value).toBe(true);
      expect(
        screen.getByText(
          'Your notification preference could not be saved. The server may have received the change. Retry to reload it.',
        ),
      ).toBeTruthy();
    });
    expect(mockPatchPreferenceNamespace.mock.calls).toEqual([
      [
        ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE,
        { [AGENT_ACTIVITY_PUSH_PREFERENCE_KEY]: false },
        { accountEpoch: captureCloudAccountEpoch(), signal: expect.any(AbortSignal) },
      ],
    ]);
    expect(mockSavePreferenceNamespace).not.toHaveBeenCalled();
    expect(screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL).props.disabled).toBe(true);
    expect(screen.getByLabelText('Retry agent run notifications')).toBeTruthy();
  });

  it('offers an explicit retry after a failed read and disables the switch until hydrated', async () => {
    mockFetchPreferenceNamespace.mockImplementation((namespace: string) =>
      namespace === ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({}),
    );
    const screen = render(<NotificationPreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('Retry agent run notifications')).toBeTruthy();
    });
    expect(screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL).props.disabled).toBe(true);
    mockFetchPreferenceNamespace.mockImplementation((namespace: string) =>
      Promise.resolve(
        namespace === ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE
          ? { [AGENT_ACTIVITY_PUSH_PREFERENCE_KEY]: false }
          : {},
      ),
    );
    fireEvent.press(screen.getByLabelText('Retry agent run notifications'));
    await waitFor(() => {
      expect(screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL).props.disabled).toBe(false);
      expect(screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL).props.value).toBe(false);
    });
    expect(screen.queryByLabelText('Retry agent run notifications')).toBeNull();
    expect(mockPatchPreferenceNamespace).not.toHaveBeenCalled();
  });

  it('disables agent push changes in Local mode without reading or writing cloud preferences', () => {
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
    });
    const screen = render(<NotificationPreferencesScreen />);

    const toggle = screen.getByLabelText(AGENT_PUSH_SWITCH_LABEL);
    expect(toggle.props.disabled).toBe(true);
    fireEvent(toggle, 'valueChange', false);
    expect(mockFetchPreferenceNamespace).not.toHaveBeenCalled();
    expect(mockPatchPreferenceNamespace).not.toHaveBeenCalled();
    expect(mockSavePreferenceNamespace).not.toHaveBeenCalled();
  });
});
