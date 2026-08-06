import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/expo';
import {
  ExternalLink,
  Fingerprint,
  History,
  KeyRound,
  Laptop,
  ShieldCheck,
  Smartphone,
  Timer,
} from 'lucide-react-native';

import { useBiometricFlag } from '@/lib/biometricFlagStore';
import { openInAppBrowser } from '@/lib/safeOpenURL';
import { useAuthStore } from '@/src/features/auth/store';
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
} from '@/src/features/settings/common';
import {
  DEFAULT_SESSION_TIMEOUT,
  SESSION_TIMEOUT_MINUTES,
  fetchAccountSecurityStatus,
  fetchAccountSessions,
  fetchAuditLog,
  fetchSessionTimeout,
  groupAuditEntries,
  revokeAccountSession,
  saveSessionTimeout,
  type AccountSecurityStatus,
  type AccountSessionRow,
  type AccountSessions,
  type AuditLogEntry,
  type SessionTimeoutMinutes,
} from './service';

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

/**
 * The value column is one short line, so an absolute timestamp truncates. A
 * coarse age is what "is this device still in use" actually needs; a missing or
 * unparseable timestamp says so rather than rendering a fabricated recency.
 */
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

const WEB_SECURITY_URL = 'https://agiworkforce.com/settings/security';
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
  const [sessions, setSessions] = useState<AccountSessions | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const appLockHydrated = useBiometricFlag((state) => state.hydrated);
  const appLockEnabled = useBiometricFlag((state) => state.enabled);

  const loadStatus = useCallback(
    async (signal?: AbortSignal) => {
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== clerkUserId) return;

      setLoading(true);
      setError(null);
      try {
        // Session timeout and the activity log are separate account reads, and
        // a failure in either must not blank the 2FA status that did load —
        // they settle independently.
        const [nextStatus, timeout, entries] = await Promise.all([
          fetchAccountSecurityStatus(signal),
          fetchSessionTimeout().catch(() => DEFAULT_SESSION_TIMEOUT),
          fetchAuditLog(20, signal).catch(() => [] as AuditLogEntry[]),
        ]);
        if (!isCloudAccountEpochCurrent(account)) return;
        setStatus(nextStatus);
        setSessionTimeout(timeout);
        setAuditEntries(entries);
      } catch (loadError) {
        if (signal?.aborted) return;
        if (!isCloudAccountEpochCurrent(account)) return;
        setError(
          loadError instanceof Error ? loadError.message : 'Could not load account security.',
        );
      } finally {
        if (isCloudAccountEpochCurrent(account)) setLoading(false);
      }
    },
    [clerkUserId],
  );

  /**
   * The device list settles on its own read: it is the one section whose
   * failure has to be named ("we could not list your devices") instead of being
   * folded into the 2FA error, because an empty list and an unreachable list
   * mean opposite things for a security decision.
   */
  const loadSessions = useCallback(
    async (signal?: AbortSignal) => {
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== clerkUserId) return;

      try {
        const next = await fetchAccountSessions(signal);
        if (!isCloudAccountEpochCurrent(account)) return;
        setSessions(next);
        setSessionsError(null);
      } catch (loadError) {
        if (signal?.aborted) return;
        if (!isCloudAccountEpochCurrent(account)) return;
        setSessions(null);
        setSessionsError(
          loadError instanceof Error ? loadError.message : 'Could not load your devices.',
        );
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
                  // Re-read instead of splicing the row out locally: the server
                  // is the only thing that knows what is still active.
                  await loadSessions();
                } catch (revokeError) {
                  Alert.alert(
                    'Could not sign out that device',
                    revokeError instanceof Error ? revokeError.message : 'Please try again.',
                  );
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

  const openOwnedWebPage = useCallback(
    (url: string) => {
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== clerkUserId) return;
      // In-app sheet (PAR-M39): the security handoff stays inside the app so
      // dismissing it returns to the row the user tapped.
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
      } catch (saveError) {
        // Put the old value back rather than leaving the row showing a timeout
        // the account never accepted.
        setSessionTimeout(previous);
        Alert.alert(
          'Could not save session timeout',
          saveError instanceof Error ? saveError.message : 'Please try again.',
        );
      } finally {
        setSavingTimeout(false);
      }
    })();
  }, [sessionTimeout]);

  const handleChangePassword = useCallback(() => {
    // Clerk owns the credential; this is the same updatePassword call web makes
    // through the browser SDK, not a second password store.
    if (!clerkUser?.updatePassword) {
      Alert.alert(
        'Password change unavailable',
        'This account signs in without a password, so there is none to change.',
      );
      return;
    }

    // Alert.prompt is iOS-only. On Android it returns silently, which would
    // make this row look broken, so send Android to the web form instead of
    // rendering a control that does nothing.
    if (Platform.OS !== 'ios') {
      openOwnedWebPage(WEB_SECURITY_URL);
      return;
    }

    Alert.prompt(
      'Change password',
      'Enter a new password for your AGI account.',
      (newPassword: string) => {
        const trimmed = newPassword.trim();
        if (trimmed.length < 8) {
          Alert.alert('Password too short', 'Use at least 8 characters.');
          return;
        }
        void (async () => {
          setChangingPassword(true);
          try {
            await clerkUser.updatePassword({ newPassword: trimmed });
            Alert.alert('Password changed', 'Your account password has been updated.');
          } catch (changeError) {
            Alert.alert(
              'Could not change password',
              changeError instanceof Error ? changeError.message : 'Please try again.',
            );
          } finally {
            setChangingPassword(false);
          }
        })();
      },
      'secure-text',
    );
  }, [clerkUser, openOwnedWebPage]);

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

  useEffect(() => {
    if (!isClerkSignedIn || appMode !== 'cloud') return;
    const controller = new AbortController();
    void loadStatus(controller.signal);
    void loadSessions(controller.signal);
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
          onSignIn={() => router.push('/(auth)/login' as Parameters<typeof router.push>[0])}
        />
      </SettingsScreenShell>
    );
  }

  return (
    <SettingsScreenShell title="Account Security">
      {appMode !== 'cloud' ? (
        <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />
      ) : null}

      <SettingsInfo
        title="Account factors"
        body="Authenticator status is read from AGI Cloud. Mobile does not enroll or disable account factors."
        icon={ShieldCheck}
      />
      <SettingsGroup>
        <SettingsRow label="Authenticator app" icon={KeyRound} value={twoFactorValue} />
        {status?.twoFactorEnabled ? (
          <SettingsRow
            label="Backup codes"
            icon={KeyRound}
            value={`${status.backupCodesRemaining} remaining`}
          />
        ) : null}
        <SettingsRow
          label="Open Web security"
          icon={ExternalLink}
          value="Web"
          onPress={() => openOwnedWebPage(WEB_SECURITY_URL)}
          isLast
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          label="Change password"
          icon={KeyRound}
          value={changingPassword ? 'Saving…' : 'Change'}
          onPress={appMode === 'cloud' ? handleChangePassword : undefined}
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
          // Retryable, and never silently empty — an unreachable list must not
          // read as "no other devices are signed in".
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
                // Signing this device out belongs to the account sign-out flow,
                // not to a device row, so only other devices are actionable.
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
          // The flag defaults to enabled before hydration so the gate fails
          // closed; reporting that default as "On" would be a claim about a
          // setting nothing has read yet.
          value={appLockHydrated ? (appLockEnabled ? 'On' : 'Off') : 'Checking…'}
          onPress={() =>
            router.push('/(app)/settings/safety-security' as Parameters<typeof router.push>[0])
          }
          isLast
        />
      </SettingsGroup>

      {/* Security activity — the same account audit trail web shows. */}
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

      <SettingsInfo
        title="Unavailable account controls"
        body="Passkeys, SMS MFA, and Lockdown mode are not exposed by the current AGI account contracts, so Mobile does not show editable controls for them."
        icon={ShieldCheck}
      />
    </SettingsScreenShell>
  );
}
