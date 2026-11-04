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
const mockReloadUser = jest.fn();
const mockChangeAccountPassword = jest.fn();
const mockSetAppMode = jest.fn();
let mockAppMode: 'local' | 'cloud' = 'cloud';
let mockOwnerId = 'account-a';
let mockEpoch = 1;
const mockEpochListeners = new Set<() => void>();
const mockRevokeAll = jest.fn();
const mockTurnOffTwoFactor = jest.fn();
const mockStartSetup = jest.fn();
const mockCopySecret = jest.fn();
const mockWithStepUp = jest.fn();
let mockAuthState = {
  isClerkLoaded: true,
  isClerkSignedIn: true,
  clerkUserId: 'account-a' as string | null,
};

jest.mock('expo-clipboard', () => ({ setStringAsync: (...args: unknown[]) => mockCopySecret(...args) }));

jest.mock('../src/features/auth/hooks/useStepUp', () => ({
  useStepUp: () => ({ withStepUp: mockWithStepUp, modal: null }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
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
  openInAppBrowser: (...args: unknown[]) => mockOpenInAppBrowser(...args),
}));

jest.mock('../src/features/auth/store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
    { getState: () => mockAuthState, subscribe: () => () => undefined },
  ),
}));

jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: mockOwnerId, epoch: mockEpoch }),
  isCloudAccountEpochCurrent: (snapshot: { ownerId: string; epoch: number } | null) => Boolean(snapshot && snapshot.ownerId === mockOwnerId && snapshot.epoch === mockEpoch),
  subscribeCloudAccountEpochChange: (listener: () => void) => {
    mockEpochListeners.add(listener);
    return () => mockEpochListeners.delete(listener);
  },
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: Object.assign(
    (
      selector: (state: {
        appMode: 'local' | 'cloud';
        setAppMode: typeof mockSetAppMode;
      }) => unknown,
    ) => selector({ appMode: mockAppMode, setAppMode: mockSetAppMode }),
    {
      getState: () => ({ appMode: mockAppMode, setAppMode: mockSetAppMode }),
      subscribe: () => () => undefined,
    },
  ),
}));

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: { id: mockOwnerId, passwordEnabled: true, reload: mockReloadUser } }),
  useSession: () => ({ session: null }),
}));

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
  changeAccountPassword: (...args: unknown[]) => mockChangeAccountPassword(...args),
  groupAuditEntries: jest.requireActual('../src/features/settings/account-security/service')
    .groupAuditEntries,
  SESSION_TIMEOUT_MINUTES: [15, 30, 60, 120, 480],
  DEFAULT_SESSION_TIMEOUT: 60,
  WEB_SECURITY_URL: 'https://agiworkforce.com/settings/security',
  fetchLockdownMode: jest.fn(async () => false),
  saveLockdownMode: jest.fn(async () => undefined),
  revokeAllAccountSessions: (...args: unknown[]) => mockRevokeAll(...args),
  startAuthenticatorSetup: (...args: unknown[]) => mockStartSetup(...args),
  verifyAuthenticatorCode: jest.fn(),
  regenerateBackupCodes: jest.fn(),
  turnOffTwoFactor: (...args: unknown[]) => mockTurnOffTwoFactor(...args),
  fetchSignInMethods: jest.fn(async () => ({
    identities: [],
    keys: [{ id: 'key-1', name: 'Work laptop', kind: 'passkey' }],
  })),
}));

jest.mock('../src/features/settings/Common', () => {
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
    SettingsSwitchRow: ({ label, value }: { label: string; value: boolean }) => (
      <View accessibilityLabel={`${label}. ${value ? 'On' : 'Off'}`}>
        <Text>{label}</Text>
      </View>
    ),
  };
});

import AccountSecurityScreen from '../src/features/settings/account-security';

describe('Mobile Account Security screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppMode = 'cloud';
    mockOwnerId = 'account-a';
    mockEpoch = 1;
    mockEpochListeners.clear();
    mockReloadUser.mockResolvedValue(undefined);
    mockWithStepUp.mockImplementation(async (_action, _resource, send) => send({}));
    mockAuthState = {
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'account-a',
    };
    mockFetchStatus.mockResolvedValue({ twoFactorEnabled: true, backupCodesReady: true });
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

    await waitFor(() => expect(screen.getByLabelText('Backup codes. Ready')).toBeTruthy());
    expect(screen.getByLabelText('Authenticator app. On')).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('Work laptop. Passkey')).toBeTruthy());
    expect(screen.getByLabelText('Add or remove a sign-in method. Web')).toBeTruthy();

    expect(screen.queryByLabelText('Open Web security. Web')).toBeNull();
    fireEvent.press(screen.getByLabelText('Advanced Account Security'));
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
    await waitFor(() => expect(screen.getByText('Rate limit exceeded ×2')).toBeTruthy());
    expect(screen.getByText('Login success')).toBeTruthy();
  });

  it('restores the previous session timeout when the account rejects the change', async () => {
    mockSaveSessionTimeout.mockRejectedValue(new Error('nope'));
    const screen = render(<AccountSecurityScreen />);

    await waitFor(() => expect(screen.getByText('1 hr')).toBeTruthy());
    fireEvent.press(screen.getByText('Session timeout'));

    await waitFor(() => expect(mockSaveSessionTimeout).toHaveBeenCalledWith(120));
    await waitFor(() => expect(screen.getByText('1 hr')).toBeTruthy());
  });

  it('lists the account devices the server reports and marks this device', async () => {
    const screen = render(<AccountSecurityScreen />);

    await waitFor(() => expect(screen.getByText('iPhone (this device)')).toBeTruthy());
    expect(screen.getByLabelText('Macintosh · Chrome 141. 3h ago')).toBeTruthy();
    expect(screen.getByLabelText('iPhone (this device). Active now').props.accessibilityRole).toBe(
      undefined,
    );
  });

  it('revokes another device only after an explicit confirmation, then re-reads the list', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<AccountSecurityScreen />);

    await waitFor(() => expect(screen.getByText('Macintosh · Chrome 141')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Macintosh · Chrome 141. 3h ago'));

    expect(mockRevokeAccountSession).not.toHaveBeenCalled();
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    await act(async () => {
      buttons.find((button) => button.text === 'Sign out')?.onPress?.();
    });

    await waitFor(() => expect(mockRevokeAccountSession).toHaveBeenCalledWith('sess_laptop'));
    await waitFor(() => expect(mockFetchAccountSessions).toHaveBeenCalledTimes(2));
    alertSpy.mockRestore();
  });

  it('does not show raw account-provider failures when device revocation fails', async () => {
    mockRevokeAccountSession.mockRejectedValueOnce(
      new Error('Private session token failed at /internal/revoke'),
    );
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<AccountSecurityScreen />);

    await waitFor(() => expect(screen.getByText('Macintosh · Chrome 141')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Macintosh · Chrome 141. 3h ago'));
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    await act(async () => buttons.find((button) => button.text === 'Sign out')?.onPress?.());

    expect(alertSpy).toHaveBeenLastCalledWith(
      'Could not sign out that device',
      'Please try again.',
    );
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

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { postAuthIntent: 'cloud-account-security' },
    });
    expect(mockFetchStatus).not.toHaveBeenCalled();
    expect(mockFetchAccountSessions).not.toHaveBeenCalled();
  });
  it('rejects an old revoke-all confirmation after A to B to A', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<AccountSecurityScreen />);
    await waitFor(() => expect(screen.getByText('Log out of all devices')).toBeTruthy());
    fireEvent.press(screen.getByText('Log out of all devices'));
    const confirm = alertSpy.mock.calls.at(-1)?.[2]?.find((button) => button.text === 'Log out everywhere');
    expect(confirm?.onPress).toBeDefined();
    await act(async () => {
      mockEpoch += 2;
      mockEpochListeners.forEach((listener) => listener());
      confirm?.onPress?.();
    });
    expect(mockRevokeAll).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('rejects an old disable-factor confirmation after account replacement', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<AccountSecurityScreen />);
    await waitFor(() => expect(screen.getByText('Turn off two-factor')).toBeTruthy());
    fireEvent.press(screen.getByText('Turn off two-factor'));
    const confirm = alertSpy.mock.calls.at(-1)?.[2]?.find((button) => button.text === 'Turn off');
    expect(confirm?.onPress).toBeDefined();
    await act(async () => {
      mockEpoch += 1;
      mockEpochListeners.forEach((listener) => listener());
      confirm?.onPress?.();
    });
    expect(mockTurnOffTwoFactor).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('closes password input rather than carrying it into a replacement epoch', async () => {
    const screen = render(<AccountSecurityScreen />);
    fireEvent.press(screen.getByText('Change password'));
    fireEvent.changeText(screen.getByLabelText('New password'), 'fixture-password');
    expect(screen.getByLabelText('New password').props.value).toBe('fixture-password');
    await act(async () => {
      mockEpoch += 2;
      mockEpochListeners.forEach((listener) => listener());
    });
    expect(screen.queryByLabelText('New password')).toBeNull();
    fireEvent.press(screen.getByText('Change password'));
    expect(screen.getByLabelText('New password').props.value).toBe('');
    expect(mockChangeAccountPassword).not.toHaveBeenCalled();
  });

  it('does not resend a factor mutation after its step-up wait crosses an epoch', async () => {
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    mockWithStepUp.mockImplementation(async (_action, _resource, send) => {
      await gate;
      return send({ 'x-step-up-token': 'fixture-grant' });
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<AccountSecurityScreen />);
    await waitFor(() => expect(screen.getByText('Turn off two-factor')).toBeTruthy());
    fireEvent.press(screen.getByText('Turn off two-factor'));
    await act(async () => {
      alertSpy.mock.calls.at(-1)?.[2]?.find((button) => button.text === 'Turn off')?.onPress?.();
    });
    expect(mockWithStepUp).toHaveBeenCalledTimes(1);
    await act(async () => {
      mockEpoch += 2;
      mockEpochListeners.forEach((listener) => listener());
      resume();
      await gate;
    });
    expect(mockTurnOffTwoFactor).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('does not publish a setup secret returned to an obsolete account stage', async () => {
    mockFetchStatus.mockResolvedValue({ twoFactorEnabled: false, backupCodesReady: false, enrollmentAvailable: true });
    let finish!: (value: { secret: string; otpauthUrl: string }) => void;
    mockStartSetup.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const screen = render(<AccountSecurityScreen />);
    await waitFor(() => expect(screen.getByText('Set up authenticator app')).toBeTruthy());
    fireEvent.press(screen.getByText('Set up authenticator app'));
    await waitFor(() => expect(mockStartSetup).toHaveBeenCalledTimes(1));
    await act(async () => {
      mockEpoch += 2;
      mockEpochListeners.forEach((listener) => listener());
      finish({ secret: 'fixture-setup-secret', otpauthUrl: 'fixture-url' });
    });
    expect(screen.queryByText('fixture-setup-secret')).toBeNull();
    expect(screen.queryByLabelText('Authenticator code')).toBeNull();
  });

  it('does not copy a setup secret through an obsolete stage callback', async () => {
    mockFetchStatus.mockResolvedValue({ twoFactorEnabled: false, backupCodesReady: false, enrollmentAvailable: true });
    mockStartSetup.mockResolvedValueOnce({ secret: 'fixture-setup-secret', otpauthUrl: 'fixture-url' });
    const screen = render(<AccountSecurityScreen />);
    fireEvent.press(await screen.findByText('Set up authenticator app'));
    const copy = (await screen.findByLabelText('Copy setup key')).props.onPress as () => void;
    await act(async () => {
      mockEpoch += 2;
      mockEpochListeners.forEach((listener) => listener());
      copy();
    });
    expect(mockCopySecret).not.toHaveBeenCalled();
  });

});
