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

import { openExternalUrl } from '@/lib/safeOpenURL';
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
  fetchAuditLog,
  fetchSessionTimeout,
  groupAuditEntries,
  saveSessionTimeout,
  type AccountSecurityStatus,
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

  const openOwnedWebPage = useCallback(
    (url: string) => {
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== clerkUserId) return;
      void openExternalUrl(url);
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
  }, [clerkUserId]);

  useEffect(() => {
    if (!isClerkSignedIn || appMode !== 'cloud') return;
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [appMode, isClerkSignedIn, loadStatus]);

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
        body="This app can confirm only the current Mobile session. The current account contract does not provide a trusted device list or a cross-device revoke operation."
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
        <SettingsRow label="Current Mobile session" icon={Smartphone} value="Active" />
        <SettingsRow label="Other devices" icon={Laptop} value="Not exposed" />
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
          value="On device"
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
