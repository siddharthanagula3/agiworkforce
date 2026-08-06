/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockOpenInAppBrowser = jest.fn();
const mockFetchStatus = jest.fn();
const mockFetchSessionTimeout = jest.fn();
const mockSaveSessionTimeout = jest.fn();
const mockFetchAuditLog = jest.fn();
const mockFetchAccountSessions = jest.fn();
const mockRevokeAccountSession = jest.fn();
const mockUpdatePassword = jest.fn();
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

// PAR-M39: the Web handoffs present the in-app browser sheet rather than
// backgrounding the app, but they keep the same host allowlist.
jest.mock('../lib/safeOpenURL', () => ({
  openInAppBrowser: (...args: unknown[]) => mockOpenInAppBrowser(...args),
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

// The screen reads the Clerk user to offer "Change password" — Clerk owns the
// credential, so this is the same updatePassword call web makes rather than a
// second password store. No ClerkProvider wraps a unit render, so stub it.
jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: { updatePassword: mockUpdatePassword } }),
}));

// App Lock is a device setting, not an account one: the screen reports the real
// SecureStore-backed flag, so the store is stubbed as hydrated + off here.
jest.mock('../lib/biometricFlagStore', () => ({
  useBiometricFlag: (selector: (state: { hydrated: boolean; enabled: boolean }) => unknown) =>
    selector({ hydrated: true, enabled: false }),
}));

jest.mock('../src/features/settings/account-security/service', () => ({
  fetchAccountSecurityStatus: (...args: unknown[]) => mockFetchStatus(...args),
  fetchSessionTimeout: (...args: unknown[]) => mockFetchSessionTimeout(...args),
  saveSessionTimeout: (...args: unknown[]) => mockSaveSessionTimeout(...args),
  fetchAuditLog: (...args: unknown[]) => mockFetchAuditLog(...args),
  fetchAccountSessions: (...args: unknown[]) => mockFetchAccountSessions(...args),
  revokeAccountSession: (...args: unknown[]) => mockRevokeAccountSession(...args),
  groupAuditEntries: jest.requireActual('../src/features/settings/account-security/service')
    .groupAuditEntries,
  SESSION_TIMEOUT_MINUTES: [15, 30, 60, 120, 480],
  DEFAULT_SESSION_TIMEOUT: 60,
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
    mockFetchSessionTimeout.mockResolvedValue(60);
    mockSaveSessionTimeout.mockResolvedValue(undefined);
    mockFetchAuditLog.mockResolvedValue([]);
    mockFetchAccountSessions.mockResolvedValue({
      sessions: [
        {
          id: 'sess_mobile',
          device: 'iPhone',
          browser: null,
          location: null,
          lastActiveAt: new Date().toISOString(),
          isCurrent: true,
        },
        {
          id: 'sess_laptop',
          device: 'Macintosh',
          browser: 'Chrome 141',
          location: null,
          lastActiveAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          isCurrent: false,
        },
      ],
      currentSessionKnown: true,
    });
    mockRevokeAccountSession.mockResolvedValue(undefined);
  });

  it('renders authoritative factor and current-session state with bounded Web handoffs', async () => {
    const screen = render(<AccountSecurityScreen />);

    await waitFor(() => expect(screen.getByText('4 remaining')).toBeTruthy());
    expect(screen.getByLabelText('Authenticator app. On')).toBeTruthy();
    expect(
      screen.getByText(
        'Passkeys, SMS MFA, and Lockdown mode are not exposed by the current AGI account contracts, so Mobile does not show editable controls for them.',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Open Web security. Web'));
    fireEvent.press(screen.getByLabelText('Open Web account. Web'));
    fireEvent.press(screen.getByLabelText('App Lock. Off'));

    expect(mockOpenInAppBrowser).toHaveBeenNthCalledWith(
      1,
      'https://agiworkforce.com/settings/security',
    );
    expect(mockOpenInAppBrowser).toHaveBeenNthCalledWith(
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
    // Session timeout and the activity log are account reads on the same
    // boundary — Local Mode must not reach for either.
    expect(mockFetchSessionTimeout).not.toHaveBeenCalled();
    expect(mockFetchAuditLog).not.toHaveBeenCalled();
    expect(mockFetchAccountSessions).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Devices. Cloud mode required')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Switch to AGI Cloud'));
    expect(mockSetAppMode).toHaveBeenCalledWith('cloud');
  });

  it('shows the account session timeout and recent activity in Cloud Mode', async () => {
    mockFetchSessionTimeout.mockResolvedValue(30);
    mockFetchAuditLog.mockResolvedValue([
      { id: 'a1', action: 'login_success', ipAddress: null, createdAt: '2026-07-31T18:00:00.000Z' },
      {
        id: 'a2',
        action: 'rate_limit_exceeded',
        ipAddress: null,
        createdAt: '2026-07-31T17:59:00.000Z',
      },
      {
        id: 'a3',
        action: 'rate_limit_exceeded',
        ipAddress: null,
        createdAt: '2026-07-31T17:58:00.000Z',
      },
    ]);

    const screen = render(<AccountSecurityScreen />);

    await waitFor(() => expect(screen.getByText('Session timeout')).toBeTruthy());
    expect(screen.getByText('30 min')).toBeTruthy();
    expect(screen.getByText('Change password')).toBeTruthy();
    // The repeat run is collapsed with its count rather than filling the list.
    await waitFor(() => expect(screen.getByText('Rate limit exceeded ×2')).toBeTruthy());
    expect(screen.getByText('Login success')).toBeTruthy();
  });

  it('restores the previous session timeout when the account rejects the change', async () => {
    mockSaveSessionTimeout.mockRejectedValue(new Error('nope'));
    const screen = render(<AccountSecurityScreen />);

    await waitFor(() => expect(screen.getByText('1 hr')).toBeTruthy());
    fireEvent.press(screen.getByText('Session timeout'));

    // 60 → 120 optimistically, then back to 60 once the save fails, so the row
    // never reports a timeout the account never accepted.
    await waitFor(() => expect(mockSaveSessionTimeout).toHaveBeenCalledWith(120));
    await waitFor(() => expect(screen.getByText('1 hr')).toBeTruthy());
  });

  it('lists the account devices the server reports and marks this device', async () => {
    const screen = render(<AccountSecurityScreen />);

    await waitFor(() => expect(screen.getByText('iPhone (this device)')).toBeTruthy());
    expect(screen.getByLabelText('Macintosh · Chrome 141. 3h ago')).toBeTruthy();
    // The current row carries no revoke action — signing THIS device out is the
    // account sign-out flow, not a device row.
    expect(screen.getByLabelText('iPhone (this device). Active now').props.accessibilityRole).toBe(
      undefined,
    );
  });

  it('revokes another device only after an explicit confirmation, then re-reads the list', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<AccountSecurityScreen />);

    await waitFor(() => expect(screen.getByText('Macintosh · Chrome 141')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Macintosh · Chrome 141. 3h ago'));

    // Tapping alone must not revoke anything.
    expect(mockRevokeAccountSession).not.toHaveBeenCalled();
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    await act(async () => {
      buttons.find((button) => button.text === 'Sign out')?.onPress?.();
    });

    await waitFor(() => expect(mockRevokeAccountSession).toHaveBeenCalledWith('sess_laptop'));
    // Two reads: the initial load and the post-revoke re-read.
    await waitFor(() => expect(mockFetchAccountSessions).toHaveBeenCalledTimes(2));
    alertSpy.mockRestore();
  });

  it('says the device list is unavailable instead of showing no other devices', async () => {
    mockFetchAccountSessions.mockRejectedValue(new Error('offline'));
    const screen = render(<AccountSecurityScreen />);

    await waitFor(() => expect(screen.getByLabelText('Devices. Unavailable · Retry')).toBeTruthy());
    expect(screen.queryByText('No active devices')).toBeNull();

    mockFetchAccountSessions.mockResolvedValue({ sessions: [], currentSessionKnown: true });
    fireEvent.press(screen.getByLabelText('Devices. Unavailable · Retry'));
    await waitFor(() => expect(screen.getByText('No active devices')).toBeTruthy());
  });

  it('discloses when the server could not match this device to a listed session', async () => {
    mockFetchAccountSessions.mockResolvedValue({
      sessions: [
        {
          id: 'sess_laptop',
          device: 'Macintosh',
          browser: null,
          location: null,
          lastActiveAt: null,
          isCurrent: false,
        },
      ],
      currentSessionKnown: false,
    });
    const screen = render(<AccountSecurityScreen />);

    await waitFor(() =>
      expect(screen.getByText('This device could not be matched to a listed session')).toBeTruthy(),
    );
    expect(screen.getByLabelText('Macintosh. Unknown')).toBeTruthy();
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
    expect(mockFetchAccountSessions).not.toHaveBeenCalled();
  });
});
