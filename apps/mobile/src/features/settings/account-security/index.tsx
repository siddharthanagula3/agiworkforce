import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@/src/features/settings/common';
import { useStepUp } from '@/src/features/auth/hooks/useStepUp';
import { isStepUpCancelled } from '@/src/features/auth/services/stepUp';
import { ChangePasswordModal } from './ChangePasswordModal';
import { TwoFactorSection } from './TwoFactorSection';
import { AskFromSiriSetting } from '@/src/features/siri';
import {
  DEFAULT_SESSION_TIMEOUT,
  SESSION_TIMEOUT_MINUTES,
  WEB_SECURITY_URL,
  changeAccountPassword,
  fetchAccountSecurityStatus,
  fetchAccountSessions,
  fetchAuditLog,
  fetchLockdownMode,
  fetchSessionTimeout,
  fetchSignInMethods,
  groupAuditEntries,
  revokeAccountSession,
  revokeAllAccountSessions,
  saveLockdownMode,
  saveSessionTimeout,
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
  const [status, setStatus] = useState<AccountSecurityStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionTimeout, setSessionTimeout] = useState<SessionTimeoutMinutes | null>(null);
  const [savingTimeout, setSavingTimeout] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[] | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const { withStepUp, modal: stepUpModal } = useStepUp();
  const hasPassword = clerkUser?.passwordEnabled === true;
  const [sessions, setSessions] = useState<AccountSessions | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [lockdown, setLockdown] = useState<boolean | null>(null);
  const [savingLockdown, setSavingLockdown] = useState(false);
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
        const [nextStatus, timeout, entries] = await Promise.all([
          fetchAccountSecurityStatus(signal),
          fetchSessionTimeout().catch(() => DEFAULT_SESSION_TIMEOUT),
          fetchAuditLog(20, signal).catch(() => [] as AuditLogEntry[]),
        ]);
        if (!isCloudAccountEpochCurrent(account)) return;
        setStatus(nextStatus);
        setSessionTimeout(timeout);
        setAuditEntries(entries);
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

  const loadSessions = useCallback(
    async (signal?: AbortSignal) => {
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== clerkUserId) return;

      try {
        const next = await fetchAccountSessions(signal);
        if (!isCloudAccountEpochCurrent(account)) return;
        setSessions(next);
        setSessionsError(null);
      } catch {
        if (signal?.aborted) return;
        if (!isCloudAccountEpochCurrent(account)) return;
        setSessions(null);
        setSessionsError('Could not load your devices. Retry.');
      }
    },
    [clerkUserId],
  );

  const confirmRevokeSession = useCallback(
    (row: AccountSessionRow) => {
      Alert.alert(
        'Sign out this device?',
        `${formatSessionLabel(row)} will lose access to your AGI account immediately.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign out',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setRevokingSessionId(row.id);
                try {
                  await revokeAccountSession(row.id);
                  await loadSessions();
                } catch {
                  Alert.alert('Could not sign out that device', 'Please try again.');
                } finally {
                  setRevokingSessionId(null);
                }
              })();
            },
          },
        ],
      );
    },
    [loadSessions],
  );

  useEffect(() => {
    if (!isClerkSignedIn || appMode !== 'cloud') return;
    let cancelled = false;
    fetchLockdownMode()
      .then((enabled) => {
        if (!cancelled) setLockdown(enabled);
      })
      .catch(() => {
        if (!cancelled) setLockdown(null);
      });
    return () => {
      cancelled = true;
    };
  }, [appMode, isClerkSignedIn, clerkUserId]);

  const changeLockdown = useCallback(
    (next: boolean) => {
      const previous = lockdown;
      setLockdown(next);
      void (async () => {
        setSavingLockdown(true);
        try {
          await saveLockdownMode(next);
        } catch (saveError) {
          setLockdown(previous);
          Alert.alert(
            'Lockdown mode was not changed',
            toUserMessage(saveError, 'Please try again.'),
          );
        } finally {
          setSavingLockdown(false);
        }
      })();
    },
    [lockdown],
  );

  const confirmRevokeAllSessions = useCallback(() => {
    const account = captureCloudAccountEpoch();
    if (!account || account.ownerId !== clerkUserId) return;
    Alert.alert(
      'Log out of all devices?',
      'Every signed-in device, including this one, is signed out. You will need to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out everywhere',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setRevokingAll(true);
              try {
                await withStepUp('session.revoke_all', null, (headers) =>
                  revokeAllAccountSessions(headers),
                );
                if (!isCloudAccountEpochCurrent(account)) return;
                await signOut();
              } catch (revokeError) {
                if (isStepUpCancelled(revokeError)) return;
                Alert.alert(
                  'Could not log out of all devices',
                  toUserMessage(revokeError, 'Please try again.'),
                );
              } finally {
                setRevokingAll(false);
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

  const cycleSessionTimeout = useCallback(() => {
    const current = sessionTimeout ?? DEFAULT_SESSION_TIMEOUT;
    const index = SESSION_TIMEOUT_MINUTES.indexOf(current);
    const next =
      SESSION_TIMEOUT_MINUTES[(index + 1) % SESSION_TIMEOUT_MINUTES.length] ??
      DEFAULT_SESSION_TIMEOUT;

    void (async () => {
      const previous = sessionTimeout;
      setSessionTimeout(next);
      setSavingTimeout(true);
      try {
        await saveSessionTimeout(next);
      } catch {
        setSessionTimeout(previous);
        Alert.alert('Could not save session timeout', 'Please try again.');
      } finally {
        setSavingTimeout(false);
      }
    })();
  }, [sessionTimeout]);

  const handleChangePassword = useCallback(
    (change: PasswordChange) => {
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== clerkUserId) return;
      void (async () => {
        setChangingPassword(true);
        try {
          await withStepUp('password.change', null, (headers) =>
            changeAccountPassword(change, headers),
          );
          if (!isCloudAccountEpochCurrent(account)) return;
          setPasswordModalOpen(false);
          Alert.alert(
            'Password changed',
            'Your account password has been updated and your other sessions were signed out.',
          );
          await clerkUser?.reload();
        } catch (changeError) {
          if (isStepUpCancelled(changeError)) return;
          Alert.alert('Could not change password', toUserMessage(changeError, 'Please try again.'));
        } finally {
          setChangingPassword(false);
        }
      })();
    },
    [clerkUser, clerkUserId, withStepUp],
  );

  useEffect(() => {
    setStatus(null);
    setLoading(false);
    setError(null);
    setSessionTimeout(null);
    setAuditEntries(null);
    setSessions(null);
    setSessionsError(null);
    setRevokingSessionId(null);
  }, [clerkUserId]);

  const [signInMethods, setSignInMethods] = useState<SignInMethods | null>(null);
  const [signInMethodsError, setSignInMethodsError] = useState(false);

  useEffect(() => {
    if (!isClerkSignedIn || appMode !== 'cloud') return;
    const controller = new AbortController();
    void loadStatus(controller.signal);
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
  }, [appMode, isClerkSignedIn, loadSessions, loadStatus]);

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
      <SettingsScreenShell title="Account Security">
        <CloudAccountRequired
          isLoading={!isClerkLoaded}
          onSignIn={() => router.push(beginCloudPostAuthIntent('cloud-account-security'))}
        />
      </SettingsScreenShell>
    );
  }

  return (
    <SettingsScreenShell title="Account Security">
      {passwordModalOpen ? null : stepUpModal}
      <ChangePasswordModal
        visible={passwordModalOpen}
        hasPassword={hasPassword}
        saving={changingPassword}
        onCancel={() => setPasswordModalOpen(false)}
        onSubmit={handleChangePassword}
      >
        {passwordModalOpen ? stepUpModal : null}
      </ChangePasswordModal>
      {appMode !== 'cloud' ? (
        <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />
      ) : null}

      {appMode === 'cloud' ? <AskFromSiriSetting /> : null}
      <TwoFactorSection
        status={appMode === 'cloud' ? status : null}
        statusLabel={twoFactorValue}
        withStepUp={withStepUp}
        onChanged={() => void loadStatus()}
      />
      <SettingsGroup>
        <SettingsRow
          label="Advanced Account Security"
          icon={ShieldCheck}
          value="Set up on web"
          onPress={() => openOwnedWebPage(WEB_SECURITY_URL)}
        />
        <SettingsRow
          label="Open Web security"
          icon={ExternalLink}
          value="Web"
          onPress={() => openOwnedWebPage(WEB_SECURITY_URL)}
          isLast
        />
      </SettingsGroup>

      <SettingsInfo
        title="Sign-in methods"
        body="Every way you can sign in to your AGI account. Add or remove one in Security settings on the web."
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
            {signInMethods.keys.map((key) => (
              <SettingsRow
                key={key.id}
                label={key.name}
                icon={Fingerprint}
                value={key.kind === 'passkey' ? 'Passkey' : 'Security key'}
              />
            ))}
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
          onPress={appMode === 'cloud' ? () => setPasswordModalOpen(true) : undefined}
          isLast
        />
      </SettingsGroup>

      <SettingsInfo
        title="Sessions"
        body="Every device signed in to your AGI account, reported by your account provider. Sign out anything you do not recognize."
        icon={Smartphone}
      />
      <SettingsGroup>
        <SettingsRow
          label="Session timeout"
          icon={Timer}
          value={
            appMode !== 'cloud'
              ? 'Cloud mode required'
              : sessionTimeout === null
                ? 'Checking…'
                : savingTimeout
                  ? 'Saving…'
                  : formatTimeout(sessionTimeout)
          }
          onPress={appMode === 'cloud' && sessionTimeout !== null ? cycleSessionTimeout : undefined}
        />
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
        body="AGI App Lock uses the Face ID, Touch ID, or passcode already enrolled on this device."
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

      {/* Security activity, the same account audit trail web shows. */}
      <SettingsInfo
        title="Recent security activity"
        body="Sign-ins and account changes recorded for this account, newest first."
        icon={History}
      />
      <SettingsGroup>
        {appMode !== 'cloud' ? (
          <SettingsRow label="Activity" icon={History} value="Cloud mode required" isLast />
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
            description="Refuses connector tools, web search, page fetch, code execution and Deep Research in every chat on this account, so a page or document cannot talk the model into calling one."
            icon={Lock}
            value={lockdown}
            onValueChange={changeLockdown}
            disabled={savingLockdown}
            isLast
          />
        </SettingsGroup>
      ) : null}

      <SettingsInfo
        title="Managed on the web"
        body="Passkeys and security keys are added and removed in Security settings on the web. SMS MFA is not offered on mobile."
        icon={ShieldCheck}
      />
    </SettingsScreenShell>
  );
}
