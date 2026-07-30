/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockOpenExternalUrl = jest.fn();
const mockFetchStatus = jest.fn();
const mockSetAppMode = jest.fn();
let mockAppMode: 'local' | 'cloud' = 'cloud';
let mockOwnerId = 'account-a';
let mockAuthState = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'account-a' as string | null,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy(
    {},
    {
      get: (_target, name) => (name === '__esModule' ? true : Icon),
    },
  );
});

jest.mock('../lib/safeOpenURL', () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

jest.mock('../src/features/auth/store', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: mockOwnerId, epoch: 1 }),
  isCloudAccountEpochCurrent: (snapshot: { ownerId: string }) => snapshot.ownerId === mockOwnerId,
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (
    selector: (state: { appMode: 'local' | 'cloud'; setAppMode: typeof mockSetAppMode }) => unknown,
  ) => selector({ appMode: mockAppMode, setAppMode: mockSetAppMode }),
}));

jest.mock('../src/features/settings/account-security/service', () => ({
  fetchAccountSecurityStatus: (...args: unknown[]) => mockFetchStatus(...args),
}));

jest.mock('../src/features/settings/common', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    SettingsScreenShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    ),
    SettingsInfo: ({ title, body }: { title: string; body: string }) => (
      <View>
        <Text>{title}</Text>
        <Text>{body}</Text>
      </View>
    ),
    SettingsGroup: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SettingsRow: ({
      label,
      value,
      onPress,
    }: {
      label: string;
      value?: string;
      onPress?: () => void;
    }) => (
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={value ? `${label}. ${value}` : label}
        onPress={onPress}
      >
        <Text>{label}</Text>
        {value ? <Text>{value}</Text> : null}
      </Pressable>
    ),
    CloudAccountRequired: ({
      isLoading,
      onSignIn,
    }: {
      isLoading: boolean;
      onSignIn: () => void;
    }) => (
      <Pressable accessibilityLabel="Sign in to AGI Cloud" onPress={onSignIn}>
        <Text>{isLoading ? 'Checking AGI Cloud account…' : 'Sign in to AGI Cloud'}</Text>
      </Pressable>
    ),
    CloudSyncBlockedBanner: ({ onSwitchToCloud }: { onSwitchToCloud: () => void }) => (
      <Pressable accessibilityLabel="Switch to AGI Cloud" onPress={onSwitchToCloud}>
        <Text>Chat is set to Local Mode</Text>
      </Pressable>
    ),
  };
});

import AccountSecurityScreen from '../src/features/settings/account-security';

describe('Mobile Account Security screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppMode = 'cloud';
    mockOwnerId = 'account-a';
    mockAuthState = {
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'account-a',
    };
    mockFetchStatus.mockResolvedValue({
      twoFactorEnabled: true,
      enabledAt: '2026-07-30T12:00:00.000Z',
      backupCodesRemaining: 4,
    });
  });

  it('renders authoritative factor and current-session state with bounded Web handoffs', async () => {
    const screen = render(<AccountSecurityScreen />);

    await waitFor(() => expect(screen.getByText('4 remaining')).toBeTruthy());
    expect(screen.getByLabelText('Authenticator app. On')).toBeTruthy();
    expect(screen.getByLabelText('Current Mobile session. Active')).toBeTruthy();
    expect(screen.getByLabelText('Other devices. Not exposed')).toBeTruthy();
    expect(
      screen.getByText(
        'Passkeys, SMS MFA, and Lockdown mode are not exposed by the current AGI account contracts, so Mobile does not show editable controls for them.',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Open Web security. Web'));
    fireEvent.press(screen.getByLabelText('Open Web account. Web'));
    fireEvent.press(screen.getByLabelText('App Lock. On device'));

    expect(mockOpenExternalUrl).toHaveBeenNthCalledWith(
      1,
      'https://agiworkforce.com/settings/security',
    );
    expect(mockOpenExternalUrl).toHaveBeenNthCalledWith(
      2,
      'https://agiworkforce.com/settings/account',
    );
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/safety-security');
  });

  it('does not fetch Cloud security state while the app is in Local Mode', () => {
    mockAppMode = 'local';
    const screen = render(<AccountSecurityScreen />);

    expect(screen.getByText('Chat is set to Local Mode')).toBeTruthy();
    expect(mockFetchStatus).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Switch to AGI Cloud'));
    expect(mockSetAppMode).toHaveBeenCalledWith('cloud');
  });

  it('sign-in gates direct route access before any account request', () => {
    mockAuthState = {
      isClerkLoaded: true,
      isClerkSignedIn: false,
      clerkUserId: null,
    };
    const screen = render(<AccountSecurityScreen />);

    fireEvent.press(screen.getByLabelText('Sign in to AGI Cloud'));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
    expect(mockFetchStatus).not.toHaveBeenCalled();
  });
});
