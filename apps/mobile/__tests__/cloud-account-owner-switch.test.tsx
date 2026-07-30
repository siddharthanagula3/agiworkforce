import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

let mockClerkUser = {
  id: 'account-a',
  primaryEmailAddress: { emailAddress: 'a@example.com' },
  fullName: 'Account A',
  username: null,
  imageUrl: null,
};
jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: mockClerkUser }),
}));

const mockSignOut = jest.fn();
jest.mock('../src/features/auth/store', () => ({
  useAuthStore: (selector: (state: { signOut: typeof mockSignOut }) => unknown) =>
    selector({ signOut: mockSignOut }),
}));

const mockDeleteAccount = jest.fn();
jest.mock('../services/api', () => ({
  api: {
    delete: (...args: unknown[]) => mockDeleteAccount(...args),
  },
}));

const mockOpenExternalUrl = jest.fn();
jest.mock('../lib/safeOpenURL', () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

jest.mock('../src/ui/theme', () => ({
  useThemeColors: () => ({
    surfaceElevated: '#111111',
    surfaceHover: '#222222',
    border: '#333333',
    textPrimary: '#ffffff',
    textMuted: '#aaaaaa',
    accentText: '#000000',
    dangerSurface: '#220000',
    dangerBorder: '#550000',
    agentError: '#ff6666',
  }),
}));

jest.mock('../components/ui/text', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactRuntime = require('react') as typeof React;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: NativeText } = require('react-native') as typeof import('react-native');
  return {
    Text: (props: Record<string, unknown>) => ReactRuntime.createElement(NativeText, props),
  };
});

jest.mock('../src/features/settings/common', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactRuntime = require('react') as typeof React;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, View } = require('react-native') as typeof import('react-native');
  return {
    SettingsScreenShell: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(View, null, children),
    SettingsGroup: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(View, null, children),
    SettingsInfo: () => null,
    SettingsRow: ({ label, onPress }: { label: string; onPress?: () => void }) =>
      ReactRuntime.createElement(Pressable, {
        accessibilityRole: 'button',
        accessibilityLabel: label,
        onPress,
      }),
  };
});

jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactRuntime = require('react') as typeof React;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  const Icon = () => ReactRuntime.createElement(View);
  return {
    Copy: Icon,
    Check: Icon,
    LogOut: Icon,
    Mail: Icon,
    Smartphone: Icon,
    Trash2: Icon,
    UserRound: Icon,
  };
});

import CloudAccountScreen from '../src/features/settings/cloud-account';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

function destructiveActionFor(title: string): () => void {
  const call = (Alert.alert as jest.Mock).mock.calls.findLast(
    ([alertTitle]) => alertTitle === title,
  );
  const buttons = call?.[2] as Array<{ text?: string; onPress?: () => void }> | undefined;
  const action = buttons?.find((button) => button.text === title)?.onPress;
  if (!action) throw new Error(`Missing destructive ${title} alert action`);
  return action;
}

describe('Cloud Account destructive action ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
    mockClerkUser = {
      id: 'account-a',
      primaryEmailAddress: { emailAddress: 'a@example.com' },
      fullName: 'Account A',
      username: null,
      imageUrl: null,
    };
    mockSignOut.mockResolvedValue(undefined);
  });

  it('does not execute account A’s retained delete confirmation as account B', () => {
    const view = render(<CloudAccountScreen />);
    fireEvent.press(screen.getByLabelText('Delete Account'));
    const deleteAccountA = destructiveActionFor('Delete Account');

    act(() => {
      activateCloudAccount('account-b');
      mockClerkUser = {
        id: 'account-b',
        primaryEmailAddress: { emailAddress: 'b@example.com' },
        fullName: 'Account B',
        username: null,
        imageUrl: null,
      };
      view.rerender(<CloudAccountScreen />);
      deleteAccountA();
    });

    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Account changed',
      expect.stringContaining('no longer valid'),
    );
  });

  it('confirms the current email before handing account management to Web', () => {
    render(<CloudAccountScreen />);
    fireEvent.press(screen.getByLabelText('Email'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Change your email',
      'To change a@example.com, continue to AGI Workforce on the web.',
      expect.any(Array),
    );
    const call = (Alert.alert as jest.Mock).mock.calls.findLast(
      ([title]) => title === 'Change your email',
    );
    const buttons = call?.[2] as Array<{ text?: string; onPress?: () => void }>;
    buttons.find((button) => button.text === 'Continue')?.onPress?.();

    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://agiworkforce.com/settings/account');
  });

  it('does not sign out account B when account A’s deletion response resolves late', async () => {
    let resolveDeletion!: (value: { message: string }) => void;
    mockDeleteAccount.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDeletion = resolve;
      }),
    );
    const view = render(<CloudAccountScreen />);
    fireEvent.press(screen.getByLabelText('Delete Account'));

    await act(async () => {
      destructiveActionFor('Delete Account')();
    });
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(1));

    act(() => {
      activateCloudAccount('account-b');
      mockClerkUser = {
        id: 'account-b',
        primaryEmailAddress: { emailAddress: 'b@example.com' },
        fullName: 'Account B',
        username: null,
        imageUrl: null,
      };
      view.rerender(<CloudAccountScreen />);
    });
    await act(async () => {
      resolveDeletion({ message: 'Account A deletion scheduled' });
      await Promise.resolve();
    });

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Account changed',
      expect.stringContaining('No action was applied to the new account'),
    );
  });
});
