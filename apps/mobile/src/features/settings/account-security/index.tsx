import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/expo';
import {
  ExternalLink,
  Fingerprint,
  History,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  ShieldCheck,
  Smartphone,
  Timer,
} from 'lucide-react-native';

import { useBiometricFlag } from '@/lib/biometricFlagStore';
import { openInAppBrowser } from '@/lib/safeOpenURL';
import { useAuthStore } from '@/src/features/auth/store';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  CloudAccountRequired,
  CloudSyncBlockedBanner,
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/Common';
import { useStepUp } from '@/src/features/auth/hooks/useStepUp';
import { isStepUpCancelled, StepUpCancelledError } from '@/src/features/auth/services/stepUp';
import { ChangePasswordModal } from './ChangePasswordModal';
import { TwoFactorSection } from './TwoFactorSection';
import {
  useSecurityPreferences,
  isSecuritySettingsOwnerCurrent,
  type SecuritySettingsOwner,
} from './useSecurityPreferences';
import { AskFromSiriSetting } from '@/src/features/siri';
import {
  WEB_SECURITY_URL,
  changeAccountPassword,
  fetchAccountSecurityStatus,
  fetchAccountSessions,
  fetchAuditLog,
  fetchSignInMethods,
  groupAuditEntries,
  revokeAccountSession,
  revokeAllAccountSessions,
  type AccountSecurityStatus,
  type AccountSessionRow,
  type AccountSessions,
  type AuditLogEntry,
  type PasswordChange,
  type SessionTimeoutMinutes,
  type SignInMethods,
} from './service';
import { toUserMessage } from '@/services/userMessage';

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  google: 'Google',
  github: 'GitHub',
  apple: 'Apple',
  microsoft: 'Microsoft',
  email: 'Email and password',
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

function formatTimeout(minutes: SessionTimeoutMinutes): string {
  return minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`;
}

function formatAuditAction(action: string): string {
  const spaced = action.replace(/[._]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatAuditTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function formatLastActive(value: string | null): string {
  const time = value === null ? Number.NaN : Date.parse(value);
  if (Number.isNaN(time)) return 'Unknown';
  const minutes = Math.floor((Date.now() - time) / 60_000);
  if (minutes < 1) return 'Active now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatSessionLabel(row: AccountSessionRow): string {
  const parts = [row.device, row.browser, row.location].filter((part): part is string =>
    Boolean(part),
  );
  return row.isCurrent ? `${parts.join(' · ')} (this device)` : parts.join(' · ');
}

const WEB_ACCOUNT_URL = 'https://agiworkforce.com/settings/account';

export default function AccountSecurityScreen() {
  const router = useRouter();
  const isClerkLoaded = useAuthStore((state) => state.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);
  const { user: clerkUser } = useUser();
  const [ownedStatus, setOwnedStatus] = useState<{
    account: CloudAccountEpoch;
    value: AccountSecurityStatus;
  } | null>(null);
  const status =
    ownedStatus &&
    isCloudAccountEpochCurrent(ownedStatus.account) &&
    ownedStatus.account.ownerId === clerkUserId
      ? ownedStatus.value
      : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preferences = useSecurityPreferences();
  const {
    owner: settingsOwner,
    timeout: sessionTimeout,
    savingTimeout,
    lockdown,
    savingLockdown,
  } = preferences;
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[] | null>(null);
  const [auditFailed, setAuditFailed] = useState(false);
  const auditRequest = useRef(0);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordAccount, setPasswordAccount] = useState<CloudAccountEpoch | null>(null);
  const [accountRevision, setAccountRevision] = useState(0);
  const passwordRequest = useRef(0);
  const revokeRequest = useRef(0);
  const passwordModalOpen =
    isCloudAccountEpochCurrent(passwordAccount) &&
    passwordAccount.ownerId === clerkUserId &&
    clerkUser?.id === passwordAccount.ownerId;
  const closePassword = useCallback(() => {
    passwordRequest.current += 1;
    setPasswordAccount(null);
    setChangingPassword(false);
  }, []);
  useEffect(() => {
    const invalidate = () => {
      closePassword();
      revokeRequest.current += 1;
      setRevokingAll(false);
      setOwnedStatus(null);
      setAccountRevision((revision) => revision + 1);
    };
    const unsubscribe = subscribeCloudAccountEpochChange(invalidate);
    return () => {
      unsubscribe();
      passwordRequest.current += 1;
      revokeRequest.current += 1;
    };
  }, [closePassword]);
  const { withStepUp, modal: stepUpModal } = useStepUp();
  const hasPassword = clerkUser?.id === clerkUserId && clerkUser?.passwordEnabled === true;
  const [ownedSessions, setOwnedSessions] = useState<{
    owner: SecuritySettingsOwner;
    value: AccountSessions;
  } | null>(null);
  const sessions =
    ownedSessions &&
    ownedSessions.owner === settingsOwner &&
    isSecuritySettingsOwnerCurrent(ownedSessions.owner)
      ? ownedSessions.value
      : null;
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const singleRevokeIntent = useRef<{
    owner: SecuritySettingsOwner;
    phase: 'prompt' | 'request';
  } | null>(null);
  const sessionsRequest = useRef(0);
  const signOut = useAuthStore((state) => state.signOut);
  const appLockHydrated = useBiometricFlag((state) => state.hydrated);
  const appLockEnabled = useBiometricFlag((state) => state.enabled);

  const loadStatus = useCallback(
    async (signal?: AbortSignal) => {
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== clerkUserId) return;

      setLoading(true);
      setError(null);
      try {
        const nextStatus = await fetchAccountSecurityStatus(signal);
        if (!isCloudAccountEpochCurrent(account)) return;
        setOwnedStatus({ account, value: nextStatus });
      } catch {
        if (signal?.aborted) return;
        if (!isCloudAccountEpochCurrent(account)) return;
        setError('Could not load account security. Retry.');
      } finally {
        if (isCloudAccountEpochCurrent(account)) setLoading(false);
      }
    },
    [clerkUserId],
  );

  const loadAudit = useCallback(
    async (signal?: AbortSignal) => {
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== clerkUserId) return;
      const request = ++auditRequest.current;
      const current = () =>
        request === auditRequest.current && !signal?.aborted && isCloudAccountEpochCurrent(account);
      setAuditEntries(null);
      setAuditFailed(false);
      try {
        const entries = await fetchAuditLog(20, signal);
        if (current()) setAuditEntries(entries);
      } catch {
        if (current()) setAuditFailed(true);
      }
    },
    [clerkUserId],
  );

  const reloadSecurity = useCallback(() => {
    void loadStatus();
    void loadAudit();
  }, [loadAudit, loadStatus]);

  const loadSessions = useCallback(
    async (signal?: AbortSignal) => {
      const owner = settingsOwner;
      if (!isSecuritySettingsOwnerCurrent(owner)) return;
      const request = ++sessionsRequest.current;
      const current = () =>
        request === sessionsRequest.current && isSecuritySettingsOwnerCurrent(owner);
      try {
        const next = await fetchAccountSessions(signal ?? owner.controller.signal, owner.account);
        if (!current() || signal?.aborted) return;
        setOwnedSessions({ owner, value: next });
        setSessionsError(null);
      } catch {
        if (signal?.aborted || !current()) return;
        setOwnedSessions(null);
        setSessionsError('Could not load your devices. Retry.');
      }
    },
    [settingsOwner],
  );

  const confirmRevokeSession = useCallback(
    (row: AccountSessionRow) => {
      const owner = settingsOwner;
      if (!isSecuritySettingsOwnerCurrent(owner) || !sessions?.sessions.includes(row)) return;
      if (
        singleRevokeIntent.current &&
        isSecuritySettingsOwnerCurrent(singleRevokeIntent.current.owner)
      )
        return;
      const intent = { owner, phase: 'prompt' as 'prompt' | 'request' };
      singleRevokeIntent.current = intent;
      const current = () =>
        singleRevokeIntent.current === intent && isSecuritySettingsOwnerCurrent(owner);
      const cancel = () => {
        if (singleRevokeIntent.current === intent && intent.phase === 'prompt') {
          singleRevokeIntent.current = null;
        }
      };
      Alert.alert(
        'Sign out this device?',
        `${formatSessionLabel(row)} will lose access to your AGI account immediately.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: cancel },
          {
            text: 'Sign out',
            style: 'destructive',
            onPress: () => {
              if (!current() || intent.phase !== 'prompt') return;
              intent.phase = 'request';
              const active = current;
              void (async () => {
                setRevokingSessionId(row.id);
                try {
                  await revokeAccountSession(row.id, owner.account, owner.controller.signal);
                  if (active()) await loadSessions();
                } catch {
                  if (!active()) return;
                  Alert.alert(
                    'Could not confirm device sign-out',
                    'The server may have received the request. The device list will be refreshed.',
                  );
                  await loadSessions();
                } finally {
                  if (active()) setRevokingSessionId(null);
                  if (singleRevokeIntent.current === intent) singleRevokeIntent.current = null;
                }
              })();
            },
          },
        ],
        { cancelable: true, onDismiss: cancel },
      );
    },
    [loadSessions, sessions, settingsOwner],
  );

  const confirmRevokeAllSessions = useCallback(() => {
    const account = captureCloudAccountEpoch();
    if (!account || account.ownerId !== clerkUserId) return;
    const request = ++revokeRequest.current;
    const current = () => request === revokeRequest.current && isCloudAccountEpochCurrent(account);
    Alert.alert(
      'Log out of all devices?',
      'Every signed-in device, including this one, is signed out. You will need to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out everywhere',
          style: 'destructive',
          onPress: () => {
            if (!current()) return;
            void (async () => {
              setRevokingAll(true);
              try {
                await withStepUp('session.revoke_all', null, (headers) => {
                  if (!current()) throw new StepUpCancelledError();
                  return revokeAllAccountSessions(headers, account);
                });
                if (!current()) return;
                await signOut().catch((signOutError: unknown) => {
                  console.warn(
                    '[AccountSecurity] local sign-out after revoking every session failed:',
                    signOutError,
                  );
                });
              } catch (revokeError) {
                if (!current() || isStepUpCancelled(revokeError)) return;
                Alert.alert(
                  'Could not log out of all devices',
                  toUserMessage(revokeError, 'Please try again.'),
                );
              } finally {
                if (current()) setRevokingAll(false);
              }
            })();
          },
        },
      ],
    );
  }, [clerkUserId, signOut, withStepUp]);

  const openOwnedWebPage = useCallback(
    (url: string) => {
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== clerkUserId) return;
      void openInAppBrowser(url);
    },
    [clerkUserId],
  );

  const passwordIntentVersion = passwordRequest.current;
  const handleChangePassword = useCallback(
    (change: PasswordChange) => {
      const account = passwordAccount;
      if (
        passwordIntentVersion !== passwordRequest.current ||
        !isCloudAccountEpochCurrent(account) ||
        account.ownerId !== clerkUserId ||
        clerkUser?.id !== account.ownerId
      )
        return;
      const request = ++passwordRequest.current;
      const current = () =>
        request === passwordRequest.current && isCloudAccountEpochCurrent(account);
      void (async () => {
        setChangingPassword(true);
        try {
          await withStepUp('password.change', null, (headers) => {
            if (!current()) throw new StepUpCancelledError();
            return changeAccountPassword(change, headers, account);
          });
          if (!current()) return;
          setPasswordAccount(null);
          Alert.alert(
            'Password changed',
            'Your account password has been updated and your other sessions were signed out.',
          );
          if (current() && clerkUser?.id === account.ownerId)
            await clerkUser.reload().catch(() => undefined);
        } catch (changeError) {
          if (!current() || isStepUpCancelled(changeError)) return;
          Alert.alert('Could not change password', toUserMessage(changeError, 'Please try again.'));
        } finally {
          if (current()) setChangingPassword(false);
        }
      })();
    },
    [clerkUser, clerkUserId, passwordAccount, passwordIntentVersion, withStepUp],
  );

  useEffect(() => {
    setOwnedStatus(null);
    setLoading(false);
    setError(null);
    auditRequest.current += 1;
    setAuditEntries(null);
    setAuditFailed(false);
    setOwnedSessions(null);
    setSessionsError(null);
    setRevokingSessionId(null);
  }, [clerkUserId, settingsOwner]);

  const [signInMethods, setSignInMethods] = useState<SignInMethods | null>(null);
  const [signInMethodsError, setSignInMethodsError] = useState(false);

  useEffect(() => {
    if (!isClerkSignedIn || appMode !== 'cloud') return;
    const controller = new AbortController();
    void loadStatus(controller.signal);
    void loadAudit(controller.signal);
    void loadSessions(controller.signal);
    setSignInMethods(null);
    setSignInMethodsError(false);
    fetchSignInMethods(controller.signal)
      .then((methods) => {
        if (!controller.signal.aborted) setSignInMethods(methods);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSignInMethodsError(true);
      });
    return () => controller.abort();
  }, [accountRevision, appMode, isClerkSignedIn, loadAudit, loadSessions, loadStatus]);

  const groupedAuditEntries = useMemo(
    () => (auditEntries ? groupAuditEntries(auditEntries) : []),
    [auditEntries],
  );

  const twoFactorValue =
    appMode !== 'cloud'
      ? 'Cloud mode required'
      : loading || (!status && !error)
        ? 'Checking…'
        : error
          ? 'Unavailable'
          : status?.twoFactorEnabled
            ? 'On'
            : 'Off';

  if (!isClerkLoaded || !isClerkSignedIn) {
    return (
      <SettingsScreenShell
        title="Account Security"
        help={{ docId: 'account-security', label: 'How account security works' }}
      >
        <CloudAccountRequired
          isLoading={!isClerkLoaded}
          onSignIn={() => router.push(beginCloudPostAuthIntent('cloud-account-security'))}
        />
      </SettingsScreenShell>
    );
  }

  return (
    <SettingsScreenShell
      title="Account Security"
      help={{ docId: 'account-security', label: 'How account security works' }}
    >
      {passwordModalOpen ? null : stepUpModal}
      <ChangePasswordModal
        key={passwordAccount ? `${passwordAccount.ownerId}:${passwordAccount.epoch}` : 'closed'}
        visible={passwordModalOpen}
        hasPassword={hasPassword}
        saving={changingPassword}
        onCancel={() => {
          if (passwordIntentVersion === passwordRequest.current) closePassword();
        }}
        onSubmit={handleChangePassword}
      >
        {passwordModalOpen ? stepUpModal : null}
      </ChangePasswordModal>
      {appMode !== 'cloud' ? (
        <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />
      ) : null}

      {appMode === 'cloud' ? <AskFromSiriSetting /> : null}
      <TwoFactorSection
        key={
          ownedStatus
            ? `${ownedStatus.account.ownerId}:${ownedStatus.account.epoch}`
            : 'unavailable'
        }
        account={appMode === 'cloud' && status ? ownedStatus!.account : null}
        status={appMode === 'cloud' ? status : null}
        statusLabel={twoFactorValue}
        withStepUp={withStepUp}
        onChanged={reloadSecurity}
      />
      <SettingsGroup>
        <SettingsRow
          label="Advanced Account Security"
          icon={ShieldCheck}
          onPress={() => openOwnedWebPage(WEB_SECURITY_URL)}
          isLast
        />
      </SettingsGroup>

      <SettingsInfo
        title="Sign-in methods"
        body="Add or remove sign-in methods on the web."
        icon={Fingerprint}
      />
      <SettingsGroup>
        {appMode !== 'cloud' ? (
          <SettingsRow label="Sign-in methods" icon={Fingerprint} value="Cloud mode required" />
        ) : signInMethodsError ? (
          <SettingsRow label="Sign-in methods" icon={Fingerprint} value="Unavailable" />
        ) : !signInMethods ? (
          <SettingsRow label="Sign-in methods" icon={Fingerprint} value="Checking…" />
        ) : (
          <>
            {signInMethods.identities.map((identity) => (
              <SettingsRow
                key={identity.id}
                label={providerLabel(identity.provider)}
                icon={KeyRound}
                value={
                  identity.lastAuthenticatedAt
                    ? `Last used ${new Date(identity.lastAuthenticatedAt).toLocaleDateString()}`
                    : 'Linked'
                }
              />
            ))}
            {signInMethods.keys === null ? (
              <SettingsRow
                label="Passkeys and security keys"
                icon={Fingerprint}
                value="Unavailable"
              />
            ) : (
              signInMethods.keys.map((key) => (
                <SettingsRow
                  key={key.id}
                  label={key.name}
                  icon={Fingerprint}
                  value={key.kind === 'passkey' ? 'Passkey' : 'Security key'}
                />
              ))
            )}
          </>
        )}
        <SettingsRow
          label="Add or remove a sign-in method"
          icon={ExternalLink}
          value="Web"
          onPress={() => openOwnedWebPage(WEB_SECURITY_URL)}
          isLast
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          label={hasPassword ? 'Change password' : 'Set a password'}
          icon={KeyRound}
          value={changingPassword ? 'Saving…' : hasPassword ? 'Change' : 'Set'}
          onPress={
            appMode === 'cloud'
              ? () => {
                  const account = captureCloudAccountEpoch();
                  if (
                    !account ||
                    account.ownerId !== clerkUserId ||
                    clerkUser?.id !== account.ownerId
                  )
                    return;
                  passwordRequest.current += 1;
                  setChangingPassword(false);
                  setPasswordAccount(account);
                }
              : undefined
          }
          isLast
        />
      </SettingsGroup>

      <SettingsInfo
        title="Sessions"
        body="Sign out any device you don’t recognize."
        icon={Smartphone}
      />
      <SettingsGroup>
        <SettingsRow
          label="Session timeout"
          icon={Timer}
          value={
            appMode !== 'cloud'
              ? 'Cloud mode required'
              : preferences.timeoutError && sessionTimeout === null
                ? 'Unavailable'
                : sessionTimeout === null
                  ? 'Checking…'
                  : savingTimeout
                    ? 'Saving…'
                    : formatTimeout(sessionTimeout)
          }
          onPress={
            appMode === 'cloud' && sessionTimeout !== null && !savingTimeout
              ? () => void preferences.cycleTimeout()
              : undefined
          }
        />
        {preferences.timeoutError ? (
          <SettingsRow
            label={preferences.timeoutError}
            icon={Timer}
            value="Retry"
            onPress={savingTimeout ? undefined : preferences.retryTimeout}
          />
        ) : null}
        {appMode !== 'cloud' ? (
          <SettingsRow label="Devices" icon={Laptop} value="Cloud mode required" />
        ) : sessionsError ? (
          <SettingsRow
            label="Devices"
            icon={Laptop}
            value="Unavailable · Retry"
            onPress={() => void loadSessions()}
          />
        ) : sessions === null ? (
          <SettingsRow label="Devices" icon={Laptop} value="Checking…" />
        ) : sessions.sessions.length === 0 ? (
          <SettingsRow label="No active devices" icon={Laptop} />
        ) : (
          <>
            {sessions.sessions.map((row) => (
              <SettingsRow
                key={row.id}
                label={formatSessionLabel(row)}
                icon={row.isCurrent ? Smartphone : Laptop}
                value={
                  revokingSessionId === row.id ? 'Signing out…' : formatLastActive(row.lastActiveAt)
                }
                onPress={
                  row.isCurrent || revokingSessionId !== null
                    ? undefined
                    : () => confirmRevokeSession(row)
                }
              />
            ))}
            {sessions.currentSessionKnown ? null : (
              <SettingsRow
                label="This device could not be matched to a listed session"
                icon={Smartphone}
              />
            )}
          </>
        )}
        {appMode === 'cloud' ? (
          <SettingsRow
            label="Log out of all devices"
            icon={LogOut}
            value={revokingAll ? 'Signing out…' : undefined}
            onPress={revokingAll ? undefined : confirmRevokeAllSessions}
            destructive
          />
        ) : null}
        <SettingsRow
          label="Open Web account"
          icon={ExternalLink}
          value="Web"
          onPress={() => openOwnedWebPage(WEB_ACCOUNT_URL)}
          isLast
        />
      </SettingsGroup>

      <SettingsInfo
        title="Device protection"
        body="App Lock uses this device’s Face ID, Touch ID or passcode."
        icon={Fingerprint}
      />
      <SettingsGroup>
        <SettingsRow
          label="App Lock"
          icon={Fingerprint}
          value={appLockHydrated ? (appLockEnabled ? 'On' : 'Off') : 'Checking…'}
          onPress={() =>
            router.push('/(app)/settings/safety-security' as Parameters<typeof router.push>[0])
          }
          isLast
        />
      </SettingsGroup>

      <SettingsInfo
        title="Recent security activity"
        body="Sign-ins and account changes, newest first."
        icon={History}
      />
      <SettingsGroup>
        {appMode !== 'cloud' ? (
          <SettingsRow label="Activity" icon={History} value="Cloud mode required" isLast />
        ) : auditFailed ? (
          <SettingsRow
            label="Activity"
            icon={History}
            value="Unavailable · Retry"
            onPress={() => void loadAudit()}
            isLast
          />
        ) : auditEntries === null ? (
          <SettingsRow label="Activity" icon={History} value="Checking…" isLast />
        ) : auditEntries.length === 0 ? (
          <SettingsRow label="No activity recorded yet" icon={History} isLast />
        ) : (
          groupedAuditEntries.map((entry, index) => (
            <SettingsRow
              key={entry.id}
              label={
                entry.repeats > 1
                  ? `${formatAuditAction(entry.action)} ×${entry.repeats}`
                  : formatAuditAction(entry.action)
              }
              icon={History}
              value={formatAuditTime(entry.createdAt)}
              isLast={index === groupedAuditEntries.length - 1}
            />
          ))
        )}
      </SettingsGroup>

      {appMode === 'cloud' && lockdown !== null ? (
        <SettingsGroup>
          <SettingsSwitchRow
            label="Lockdown mode"
            description="Blocks connectors, web access, code execution and Deep Research."
            icon={Lock}
            value={lockdown}
            onValueChange={(next) => void preferences.changeLockdown(next)}
            disabled={savingLockdown}
            isLast
          />
        </SettingsGroup>
      ) : null}

      {preferences.lockdownError ? (
        <SettingsGroup>
          <SettingsRow
            label={preferences.lockdownError}
            icon={Lock}
            value="Retry lockdown"
            onPress={savingLockdown ? undefined : preferences.retryLockdown}
          />
        </SettingsGroup>
      ) : null}

      <SettingsInfo
        title="Managed on the web"
        body="Add or remove passkeys and security keys on the web."
        icon={ShieldCheck}
      />
    </SettingsScreenShell>
  );
}
