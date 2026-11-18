import React from 'react';
import { Alert, Platform } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockAuth = { isClerkLoaded: true, isClerkSignedIn: false };
const mockExport = { exporting: false, handleExport: jest.fn() };

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openInAppBrowser: jest.fn().mockResolvedValue(true),
  openExternalUrl: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/src/features/auth/store', () => {
  const useAuthStore = (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth);
  useAuthStore.getState = () => mockAuth;
  useAuthStore.subscribe = () => () => undefined;
  return { useAuthStore };
});

jest.mock('@/src/features/settings/data-controls/useLocalDataExport', () => ({
  useLocalDataExport: () => ({
    exporting: mockExport.exporting,
    progress: null,
    handleExport: mockExport.handleExport,
  }),
}));

import { openInAppBrowser } from '@/lib/safeOpenURL';
import { useSettingsStore } from '@/stores/settingsStore';
import { beginCloudPostAuthIntentForDestination } from '@/src/features/auth/services/postAuthIntent';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  TEMPORARY_CHAT_CLOUD_EXPLAINER,
  TEMPORARY_CHAT_LOCAL_EXPLAINER,
} from '@/src/features/chat/components/TemporaryChatBanner';
import ChatPrivacyScreen, {
  CLOUD_CHAT_RETENTION,
} from '@/src/features/settings/cloud-privacy/ChatPrivacyScreen';
import DataUseScreen from '@/src/features/settings/cloud-privacy/DataUseScreen';
import { webContentPageUrl } from '@/src/platform/webContentPage';

const mockOpenInAppBrowser = openInAppBrowser as jest.Mock;

beforeEach(() => {
  mockPush.mockClear();
  mockOpenInAppBrowser.mockClear();
  mockOpenInAppBrowser.mockResolvedValue(true);
  mockAuth.isClerkLoaded = true;
  mockAuth.isClerkSignedIn = false;
  mockExport.exporting = false;
  mockExport.handleExport.mockClear();
  useSettingsStore.setState({ isTemporaryChat: false });
  useChatAppModeStore.setState({ appMode: 'local' });
});

describe('Chat privacy', () => {
  it('binds the Temporary Chat switch to the same setting as General', () => {
    render(<ChatPrivacyScreen />);
    const toggle = screen.getByTestId('chat-privacy-temporary-chat');
    expect(toggle.props.value).toBe(false);

    fireEvent(toggle, 'valueChange', true);
    expect(useSettingsStore.getState().isTemporaryChat).toBe(true);
    expect(screen.getByTestId('chat-privacy-temporary-chat').props.value).toBe(true);

    act(() => useSettingsStore.getState().setTemporaryChat(false));
    expect(screen.getByTestId('chat-privacy-temporary-chat').props.value).toBe(false);
  });

  it('in Local Mode offers only device rows and says what a local temporary chat does', () => {
    render(<ChatPrivacyScreen />);

    expect(screen.getByText(TEMPORARY_CHAT_LOCAL_EXPLAINER)).toBeTruthy();
    expect(screen.queryByText(TEMPORARY_CHAT_CLOUD_EXPLAINER)).toBeNull();
    expect(screen.queryByText('Shared links')).toBeNull();
    expect(screen.queryByText('Archived chats')).toBeNull();
    expect(screen.queryByText(CLOUD_CHAT_RETENTION)).toBeNull();

    fireEvent.press(screen.getByLabelText('Delete all chats. Data Controls'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/data-controls');
  });

  it('in Cloud Mode when signed out sends shared links and archived chats through sign-in', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    render(<ChatPrivacyScreen />);

    expect(screen.getByText(TEMPORARY_CHAT_CLOUD_EXPLAINER)).toBeTruthy();
    expect(screen.getByText(CLOUD_CHAT_RETENTION)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Shared links. Sign in'));
    expect(mockPush).toHaveBeenLastCalledWith(
      beginCloudPostAuthIntentForDestination('/(app)/settings/shared-links'),
    );
    fireEvent.press(screen.getByLabelText('Archived chats. Sign in'));
    expect(mockPush).toHaveBeenLastCalledWith(
      beginCloudPostAuthIntentForDestination('/(app)/settings/archived-chats'),
    );
    fireEvent.press(screen.getByLabelText('Delete all chats. Data Controls'));
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/settings/data-controls');
  });

  it('in Cloud Mode when signed in opens shared links and archived chats directly', () => {
    mockAuth.isClerkSignedIn = true;
    useChatAppModeStore.setState({ appMode: 'cloud' });
    render(<ChatPrivacyScreen />);

    fireEvent.press(screen.getByLabelText('Shared links'));
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/settings/shared-links');
    fireEvent.press(screen.getByLabelText('Archived chats'));
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/settings/archived-chats');
  });

  it('adds no destructive action of its own', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    render(<ChatPrivacyScreen />);

    fireEvent.press(screen.getByLabelText('Delete all chats. Data Controls'));
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

describe('Data use & access', () => {
  it('opens in Local Mode without an account and lists where each feature processes data', () => {
    render(<DataUseScreen />);

    expect(screen.getByText('Where each feature processes your data')).toBeTruthy();
    expect(screen.getByText('Chat in Local Mode')).toBeTruthy();
    expect(screen.getByText('Read aloud')).toBeTruthy();
    expect(screen.getByLabelText('Export Cloud data. Sign in')).toBeTruthy();
  });

  it('says Read aloud in AGI Cloud goes to the speech provider and keeps scanning and translation on the device', () => {
    render(<DataUseScreen />);

    expect(
      screen.getByLabelText(
        'Read aloud. In AGI Cloud, the answer’s text goes from AGI Cloud to OpenAI’s speech service. In Local Mode, this device’s voice reads it.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Text scanning and translation. On this device.')).toBeTruthy();
    expect(screen.queryByText('Read aloud, text scanning and translation')).toBeNull();
    expect(screen.queryByLabelText(/^Read aloud[^.]*\. On this device\.$/)).toBeNull();
  });

  it.each([
    ['ios', true],
    ['android', false],
  ] as const)('on %s lists Ask from Siri only where Siri exists', (os, listed) => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
    try {
      render(<DataUseScreen />);
      expect(screen.queryByText('Ask from Siri') !== null).toBe(listed);
      expect(screen.getByText('Read aloud')).toBeTruthy();
      expect(screen.getByText('Text scanning and translation')).toBeTruthy();
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
    }
  });

  it('exports local data with the Data Controls export', () => {
    render(<DataUseScreen />);

    fireEvent.press(screen.getByLabelText('Export local data'));
    expect(mockExport.handleExport).toHaveBeenCalledTimes(1);
  });

  it('shows the export running and does not start a second one', () => {
    mockExport.exporting = true;
    render(<DataUseScreen />);

    expect(screen.getByText('Exporting…')).toBeTruthy();
    const row = screen.getByTestId('data-use-export-local');
    expect(row.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true, busy: true }),
    );
    fireEvent.press(row);
    expect(mockExport.handleExport).not.toHaveBeenCalled();
  });

  it('sends Export Cloud data through sign-in when signed out and opens the account when signed in', () => {
    const { unmount } = render(<DataUseScreen />);
    fireEvent.press(screen.getByLabelText('Export Cloud data. Sign in'));
    expect(mockPush).toHaveBeenLastCalledWith(
      beginCloudPostAuthIntentForDestination('/(app)/settings/cloud-account'),
    );
    unmount();

    mockAuth.isClerkSignedIn = true;
    render(<DataUseScreen />);
    fireEvent.press(screen.getByLabelText('Export Cloud data'));
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/settings/cloud-account');
  });

  it('opens the privacy request page and says so when it cannot', async () => {
    render(<DataUseScreen />);
    fireEvent.press(screen.getByLabelText('Submit a privacy request'));
    expect(mockOpenInAppBrowser).toHaveBeenCalledWith(webContentPageUrl('/privacy/requests'));

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockOpenInAppBrowser.mockResolvedValue(false);
    fireEvent.press(screen.getByLabelText('Submit a privacy request'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(alert).toHaveBeenCalledWith(
      'Error',
      'Could not open the link. Please try again.',
      undefined,
      { cancelable: true },
    );
    alert.mockRestore();
  });
});
