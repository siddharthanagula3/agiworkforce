jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockShowToast = jest.fn();
jest.mock('@/src/shared/components/Toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import React from 'react';
import { Alert, Linking, Share, type AlertButton } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AboutScreen from '../app/(app)/about';
import { SUPPORT_EMAIL } from '../src/features/support/contact';

describe('Email Support with no mail app set up', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No handler for mailto'));
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  function lastAlert(): { title: string; body: string; buttons: AlertButton[] } {
    const call = (Alert.alert as jest.Mock).mock.calls.at(-1) as [string, string, AlertButton[]];
    return { title: call[0], body: call[1], buttons: call[2] };
  }

  it('says no mail app is set up and gives the support address, with a way to copy it', async () => {
    render(<AboutScreen />);
    fireEvent.press(screen.getByLabelText('Email Support'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const alert = lastAlert();
    expect(alert.title).toBe('No mail app');
    expect(alert.body).toBe(`No mail app is set up on this device. Write to ${SUPPORT_EMAIL}.`);
    expect(alert.buttons.map((button) => button.text)).toEqual([
      'Copy address',
      'Share address',
      'OK',
    ]);

    alert.buttons[0]?.onPress?.();

    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(SUPPORT_EMAIL));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Copied'));
  });

  it('shares the address when the person would rather send it to another app', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    render(<AboutScreen />);
    fireEvent.press(screen.getByLabelText('Email Support'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    lastAlert().buttons[1]?.onPress?.();

    expect(share).toHaveBeenCalledWith({ message: SUPPORT_EMAIL });
  });
});
