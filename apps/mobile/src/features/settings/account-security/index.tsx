import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ExternalLink,
  Fingerprint,
  KeyRound,
  Laptop,
  ShieldCheck,
  Smartphone,
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
import { fetchAccountSecurityStatus, type AccountSecurityStatus } from './service';

const WEB_SECURITY_URL = 'https://agiworkforce.com/settings/security';
const WEB_ACCOUNT_URL = 'https://agiworkforce.com/settings/account';

export default function AccountSecurityScreen() {
  const router = useRouter();
  const isClerkLoaded = useAuthStore((state) => state.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);
  const [status, setStatus] = useState<AccountSecurityStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(
    async (signal?: AbortSignal) => {
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== clerkUserId) return;

      setLoading(true);
      setError(null);
      try {
        const nextStatus = await fetchAccountSecurityStatus(signal);
        if (!isCloudAccountEpochCurrent(account)) return;
        setStatus(nextStatus);
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

  useEffect(() => {
    setStatus(null);
    setLoading(false);
    setError(null);
  }, [clerkUserId]);

  useEffect(() => {
    if (!isClerkSignedIn || appMode !== 'cloud') return;
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [appMode, isClerkSignedIn, loadStatus]);

  const openOwnedWebPage = useCallback(
    (url: string) => {
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== clerkUserId) return;
      void openExternalUrl(url);
    },
    [clerkUserId],
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

      <SettingsInfo
        title="Sessions"
        body="This app can confirm only the current Mobile session. The current account contract does not provide a trusted device list or a cross-device revoke operation."
        icon={Smartphone}
      />
      <SettingsGroup>
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

      <SettingsInfo
        title="Unavailable account controls"
        body="Passkeys, SMS MFA, and Lockdown mode are not exposed by the current AGI account contracts, so Mobile does not show editable controls for them."
        icon={ShieldCheck}
      />
    </SettingsScreenShell>
  );
}
