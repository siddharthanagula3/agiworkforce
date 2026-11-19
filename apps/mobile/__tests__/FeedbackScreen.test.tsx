import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Dimensions, Linking, Platform, StyleSheet } from 'react-native';

const mockPost = jest.fn();
const mockFocusEffects: Array<{ blur: () => void; focus: () => void }> = [];
let mockSearchParams: Record<string, string> = {};

jest.mock('@/services/api', () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { version: '0.0.1', ios: { buildNumber: '2' } },
    platform: { ios: { buildNumber: '42' } },
  },
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<ImportedReact>('react');
    useEffect(() => {
      let cleanup: (() => void) | undefined;
      const blur = () => {
        cleanup?.();
        cleanup = undefined;
      };
      const focus = () => {
        blur();
        const next = callback();
        cleanup = typeof next === 'function' ? next : undefined;
      };
      const entry = { blur, focus };
      mockFocusEffects.push(entry);
      focus();
      return () => {
        blur();
        mockFocusEffects.splice(mockFocusEffects.indexOf(entry), 1);
      };
    }, [callback]);
  },
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    useTheme: () => ({ statusBarStyle: 'dark', colors: tokens.lightColors }),
    useThemeColors: () => tokens.lightColors,
  };
});

import { router } from 'expo-router';
import FeedbackScreen from '../src/features/feedback';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { SUPPORT_EMAIL } from '../src/features/support/contact';

function leaveAndReturn() {
  act(() => {
    for (const effect of mockFocusEffects) effect.blur();
  });
  act(() => {
    for (const effect of mockFocusEffects) effect.focus();
  });
}

describe('Report App Issue screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusEffects.length = 0;
    mockSearchParams = {};
    mockPost.mockResolvedValue({ success: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('titles the shared centred header Report App Issue and goes back through the router', () => {
    (router.canGoBack as jest.Mock).mockReturnValue(true);
    render(<FeedbackScreen />);

    const header = screen.getByRole('header');
    expect(header).toHaveTextContent('Report App Issue');
    expect(StyleSheet.flatten(header.props.style)).toMatchObject({ textAlign: 'center' });

    fireEvent.press(screen.getByLabelText('Go back'));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('titles the header Report an incorrect refusal for an appeal and returns to settings without history', () => {
    mockSearchParams = { appeal: 'safety_refusal', messageId: 'message-1' };
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    render(<FeedbackScreen />);

    expect(screen.getByRole('header')).toHaveTextContent('Report an incorrect refusal');

    fireEvent.press(screen.getByLabelText('Go back'));

    expect(router.back).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith('/(app)/settings');
  });

  it('sends the build, platform, device class and app mode with the feedback', async () => {
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    render(<FeedbackScreen />);

    fireEvent.changeText(screen.getByLabelText('Feedback message'), 'The list froze');
    fireEvent.press(screen.getByLabelText('Submit feedback'));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/api/mobile/feedback', {
      type: 'general',
      message: 'The list froze',
      client: {
        appVersion: '0.0.1',
        appBuild: Platform.OS === 'ios' ? '42' : null,
        platform: Platform.OS,
        osVersion: String(Platform.Version),
        deviceClass: 'phone',
        appMode: 'cloud',
      },
    });
  });

  it('calls a tablet-sized screen a tablet', async () => {
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 1024, height: 1366, scale: 2, fontScale: 1 });
    render(<FeedbackScreen />);

    fireEvent.changeText(screen.getByLabelText('Feedback message'), 'Split view');
    fireEvent.press(screen.getByLabelText('Submit feedback'));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [, body] = mockPost.mock.calls[0] as [string, { client: { deviceClass: string } }];
    expect(body.client.deviceClass).toBe('tablet');
  });

  it('keeps a draft while the person is on the screen and drops it once they leave', () => {
    render(<FeedbackScreen />);

    fireEvent.press(screen.getByLabelText('Bug Report'));
    fireEvent.changeText(screen.getByLabelText('Bug description'), 'Half written');
    expect(screen.getByDisplayValue('Half written')).toBeTruthy();

    leaveAndReturn();

    expect(screen.queryByDisplayValue('Half written')).toBeNull();
    expect(screen.getByLabelText('Feedback message').props.value).toBe('');
    expect(screen.getByLabelText('General Feedback').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('clears the form once the feedback is sent', async () => {
    render(<FeedbackScreen />);

    fireEvent.changeText(screen.getByLabelText('Feedback message'), 'Sent once');
    fireEvent.press(screen.getByLabelText('Submit feedback'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Thank You!',
        'Your feedback has been submitted.',
        expect.any(Array),
      ),
    );
    expect(screen.getByLabelText('Feedback message').props.value).toBe('');
  });

  it('gives the support address and a copy action when no mail app is set up in Local Mode', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No handler for mailto'));
    render(<FeedbackScreen />);

    fireEvent.changeText(screen.getByLabelText('Feedback message'), 'By email');
    fireEvent.press(screen.getByLabelText('Email feedback'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0] as [
      string,
      string,
      Array<{ text: string }>,
    ];
    expect(title).toBe('No mail app');
    expect(body).toBe(`No mail app is set up on this device. Write to ${SUPPORT_EMAIL}.`);
    expect(buttons.map((button) => button.text)).toEqual(['Copy address', 'Share address', 'OK']);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('keeps a draft whose send failed while the person is still on the screen', async () => {
    mockPost.mockRejectedValue(new Error('offline'));
    render(<FeedbackScreen />);

    fireEvent.changeText(screen.getByLabelText('Feedback message'), 'Try again later');
    fireEvent.press(screen.getByLabelText('Submit feedback'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Submission Failed', expect.any(String)),
    );
    expect(screen.getByDisplayValue('Try again later')).toBeTruthy();
  });
});

type ImportedReact = typeof import('react');
