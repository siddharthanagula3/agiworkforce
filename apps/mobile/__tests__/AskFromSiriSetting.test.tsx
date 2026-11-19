import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

let mockAppMode: 'local' | 'cloud' = 'cloud';
jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (state: { appMode: 'local' | 'cloud' }) => unknown) =>
    selector({ appMode: mockAppMode }),
}));

const mockIsEnabled = jest.fn(() => false);
const mockEnable = jest.fn();
const mockDisable = jest.fn();
jest.mock('../src/features/siri/askIntentToken', () => ({
  askFromSiriSupported: () => true,
  isAskFromSiriEnabled: () => mockIsEnabled(),
  enableAskFromSiri: () => mockEnable(),
  disableAskFromSiri: () => mockDisable(),
}));

let mockFocusRead: (() => void) | null = null;
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocusRead = callback;
  },
}));

let mockConsentChanged: (() => void) | null = null;
jest.mock('@/services/providerConsent', () => ({
  ...jest.requireActual('@/services/providerConsent'),
  subscribeCloudProviderConsentChange: (listener: () => void) => {
    mockConsentChanged = listener;
    return () => {
      mockConsentChanged = null;
    };
  },
}));

let mockForgotten: Promise<void> = Promise.resolve();
jest.mock('@/src/features/chat/store/cloudModeDoor', () => ({
  askFromSiriTokenForgotten: () => mockForgotten,
}));

jest.mock('@/services/userMessage', () => ({
  toUserMessage: (_e: unknown, fallback: string) => fallback,
}));

jest.mock('@/src/features/settings/Common', () => {
  const { Switch, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SettingsGroup: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SettingsSwitchRow: ({
      label,
      description,
      value,
      onValueChange,
      disabled,
      testID,
    }: {
      label: string;
      description?: string;
      value: boolean;
      onValueChange: (next: boolean) => void;
      disabled?: boolean;
      testID?: string;
    }) => (
      <View>
        <Text>{label}</Text>
        {description ? <Text>{description}</Text> : null}
        <Switch testID={testID} value={value} onValueChange={onValueChange} disabled={disabled} />
      </View>
    ),
  };
});

import { EgressBlockedError } from '../lib/egressGuard';
import { CloudProviderConsentRequiredError } from '../services/llmGate';
import { AskFromSiriSetting } from '../src/features/siri/AskFromSiriSetting';

describe('AskFromSiriSetting', () => {
  beforeEach(() => {
    mockAppMode = 'cloud';
    mockFocusRead = null;
    mockConsentChanged = null;
    mockForgotten = Promise.resolve();
    mockIsEnabled.mockReturnValue(false);
    mockEnable.mockReset();
    mockDisable.mockReset();
  });

  async function turnOn(screen: ReturnType<typeof render>) {
    await act(async () => {
      fireEvent(screen.getByTestId('settings-ask-from-siri'), 'valueChange', true);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('stays off without an error when the person does not allow sharing with AI providers', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockEnable.mockRejectedValue(new CloudProviderConsentRequiredError());
    const screen = render(<AskFromSiriSetting />);

    await turnOn(screen);

    expect(mockEnable).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('settings-ask-from-siri').props.value).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('still explains any other failure to turn on', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockEnable.mockRejectedValue(new Error('offline'));
    const screen = render(<AskFromSiriSetting />);

    await turnOn(screen);

    expect(screen.getByTestId('settings-ask-from-siri').props.value).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith(
      'Ask from Siri was not turned on',
      'Check your connection and try again.',
    );
    alertSpy.mockRestore();
  });

  it('can be switched on in AGI Cloud', () => {
    const screen = render(<AskFromSiriSetting />);

    expect(screen.getByTestId('settings-ask-from-siri').props.disabled).toBeFalsy();
    expect(
      screen.getByText('Ask AGI through Siri and hear the answer, saved as a chat.'),
    ).toBeTruthy();
  });

  it('is disabled and says it needs AGI Cloud in Local mode', () => {
    mockAppMode = 'local';

    const screen = render(<AskFromSiriSetting />);

    expect(screen.getByTestId('settings-ask-from-siri').props.disabled).toBe(true);
    expect(screen.getByText('Needs AGI Cloud. Switch to Cloud mode to turn it on.')).toBeTruthy();
  });

  it('can be turned off in Local mode while it is on, and needs no connection to AGI Cloud for it', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockAppMode = 'local';
    mockIsEnabled.mockReturnValue(true);
    mockDisable.mockImplementation(async () => {
      mockIsEnabled.mockReturnValue(false);
      throw new EgressBlockedError('agiworkforce.com');
    });
    const screen = render(<AskFromSiriSetting />);
    expect(screen.getByTestId('settings-ask-from-siri').props.disabled).toBeFalsy();

    await act(async () => {
      fireEvent(screen.getByTestId('settings-ask-from-siri'), 'valueChange', false);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockDisable).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('settings-ask-from-siri').props.value).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  describe('while its screen stays mounted', () => {
    it('reads the stored value again when the screen comes back into focus', () => {
      mockIsEnabled.mockReturnValue(true);
      const screen = render(<AskFromSiriSetting />);
      expect(screen.getByTestId('settings-ask-from-siri').props.value).toBe(true);

      mockIsEnabled.mockReturnValue(false);
      act(() => mockFocusRead?.());

      expect(screen.getByTestId('settings-ask-from-siri').props.value).toBe(false);
    });

    it('reads off once sharing with AI providers is withdrawn and Ask from Siri is forgotten', async () => {
      mockIsEnabled.mockReturnValue(true);
      let forget: () => void = () => undefined;
      mockForgotten = new Promise<void>((resolve) => {
        forget = resolve;
      });
      const screen = render(<AskFromSiriSetting />);

      act(() => mockConsentChanged?.());
      expect(screen.getByTestId('settings-ask-from-siri').props.value).toBe(true);

      mockIsEnabled.mockReturnValue(false);
      await act(async () => {
        forget();
        await mockForgotten;
      });

      expect(screen.getByTestId('settings-ask-from-siri').props.value).toBe(false);
    });

    it('reads the stored value again when the app mode changes', () => {
      mockIsEnabled.mockReturnValue(true);
      const screen = render(<AskFromSiriSetting />);

      mockIsEnabled.mockReturnValue(false);
      mockAppMode = 'local';
      screen.rerender(<AskFromSiriSetting />);

      expect(screen.getByTestId('settings-ask-from-siri').props.value).toBe(false);
      expect(screen.getByTestId('settings-ask-from-siri').props.disabled).toBe(true);
    });

    it('stops listening for sharing changes when it unmounts', () => {
      const screen = render(<AskFromSiriSetting />);
      expect(mockConsentChanged).not.toBeNull();

      screen.unmount();

      expect(mockConsentChanged).toBeNull();
    });
  });
});
