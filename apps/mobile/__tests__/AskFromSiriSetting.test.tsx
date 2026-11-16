import React from 'react';
import { render } from '@testing-library/react-native';

let mockAppMode: 'local' | 'cloud' = 'cloud';
jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (state: { appMode: 'local' | 'cloud' }) => unknown) =>
    selector({ appMode: mockAppMode }),
}));

const mockIsEnabled = jest.fn(() => false);
jest.mock('../src/features/siri/askIntentToken', () => ({
  askFromSiriSupported: () => true,
  isAskFromSiriEnabled: () => mockIsEnabled(),
  enableAskFromSiri: jest.fn(),
  disableAskFromSiri: jest.fn(),
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

import { AskFromSiriSetting } from '../src/features/siri/AskFromSiriSetting';

describe('AskFromSiriSetting', () => {
  beforeEach(() => {
    mockAppMode = 'cloud';
    mockIsEnabled.mockReturnValue(false);
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
});
