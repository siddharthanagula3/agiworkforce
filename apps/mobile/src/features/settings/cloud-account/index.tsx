/**
 * Cloud Account Settings Screen
 *
 * Aligns with the web AccountSection: session management + user ID.
 * Cloud-only — shown when FEATURES.auth is true and user is signed in.
 */

import { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, Clipboard, Image, View } from 'react-native';
import {
  Copy,
  Check,
  Download,
  LogOut,
  Mail,
  Smartphone,
  Trash2,
  UserRound,
} from 'lucide-react-native';
import { useUser } from '@clerk/expo';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { useAuthStore } from '@/src/features/auth/store';
import { api } from '@/services/api';
import { exportCloudUserData } from '@/services/cloudDataExport';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  isStaleCloudAccountOperation,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

export default function CloudAccountScreen() {
  const colors = useThemeColors();
  const signOut = useAuthStore((s) => s.signOut);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  // useAuthStore().user is always null in v1 — Clerk is the real signed-in
  // user source (see app/(app)/profile/index.tsx for the same pattern).
  const { user: clerkUser } = useUser();

  const userId = clerkUser?.id ?? null;
  const userEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
  const displayName = clerkUser?.fullName ?? clerkUser?.username ?? null;
  const avatarUrl = clerkUser?.imageUrl ?? null;

  const [copied, setCopied] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useLayoutEffect(() => {
    // Expo Router can retain this screen instance across a direct Clerk A→B
    // switch. Clear transient account-A UI before account B paints.
    setCopied(false);
    setLoggingOut(false);
    setExporting(false);
    setDeleting(false);
  }, [userId]);

  const captureVisibleAccount = useCallback((): CloudAccountEpoch | null => {
    const account = captureCloudAccountEpoch();
    if (!account || !userId || account.ownerId !== userId) {
      Alert.alert(
        'Account changed',
        'This action belongs to a different AGI Cloud account. Open it again to continue.',
      );
      return null;
    }
    return account;
  }, [userId]);

  const handleCopyId = useCallback(() => {
    if (!userId) return;
    Clipboard.setString(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [userId]);

  const handleChangeEmail = useCallback(() => {
    const account = captureVisibleAccount();
    if (!account || !userEmail) return;
    Alert.alert(
      'Change your email',
      `To change ${userEmail}, continue to AGI Workforce on the web.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            if (!isCloudAccountEpochCurrent(account)) {
              Alert.alert(
                'Account changed',
                'This email-change confirmation is no longer valid. Open it again for the current account.',
              );
              return;
            }
            void openExternalUrl('https://agiworkforce.com/settings/account');
          },
        },
      ],
    );
  }, [captureVisibleAccount, userEmail]);

  const handleSignOut = useCallback(() => {
    const account = captureVisibleAccount();
    if (!account) return;
    Alert.alert('Log Out', 'Log out of AGI Cloud on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          if (!isCloudAccountEpochCurrent(account)) {
            Alert.alert(
              'Account changed',
              'This log-out confirmation is no longer valid. Open it again for the current account.',
            );
            return;
          }
          setLoggingOut(true);
          signOut()
            .catch(() => {
              Alert.alert('Sign out failed', 'Please try again.');
            })
            .finally(() => setLoggingOut(false));
        },
      },
    ]);
  }, [captureVisibleAccount, signOut]);

  const handleExportCloudData = useCallback(() => {
    const account = captureVisibleAccount();
    if (!account) return;

    if (appMode !== 'cloud') {
      Alert.alert(
        'Switch to AGI Cloud',
        'Cloud export needs a managed-cloud connection. Switching modes does not upload your Local Mode chats or files.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Switch to Cloud',
            onPress: () => {
              if (!isCloudAccountEpochCurrent(account)) {
                Alert.alert(
                  'Account changed',
                  'This mode-change confirmation is no longer valid. Open it again for the current account.',
                );
                return;
              }
              setAppMode('cloud');
            },
          },
        ],
      );
      return;
    }

    setExporting(true);
    exportCloudUserData(account)
      .catch((error: unknown) => {
        if (isStaleCloudAccountOperation(error) || !isCloudAccountEpochCurrent(account)) {
          Alert.alert(
            'Account changed',
            'The export was stopped because the active AGI Cloud account changed.',
          );
          return;
        }
        Alert.alert(
          'Export failed',
          error instanceof Error
            ? error.message
            : 'AGI could not create your Cloud data export. Check your connection and try again.',
        );
      })
      .finally(() => {
        if (isCloudAccountEpochCurrent(account)) setExporting(false);
      });
  }, [appMode, captureVisibleAccount, setAppMode]);

  const handleDeleteAccount = useCallback(() => {
    const account = captureVisibleAccount();
    if (!account) return;
    Alert.alert(
      'Delete Account',
      'This permanently deletes your AGI Cloud account and all cloud data (chats, projects, ' +
        'memory, artifacts) within 24 hours. This cannot be undone, and you will be signed out ' +
        'on this device. Export your Cloud data above first if you want to keep a copy.\n\n' +
        'On-device Local Mode data stays on this device — remove it separately from ' +
        'Settings → Data Controls if you want a full wipe.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            if (!isCloudAccountEpochCurrent(account)) {
              Alert.alert(
                'Account changed',
                'This deletion confirmation is no longer valid. Open it again for the current account.',
              );
              return;
            }
            setDeleting(true);
            // Server derives the user from the Clerk Bearer token; no body needed.
            // CSRF is bypassed for Bearer-authenticated requests server-side.
            api
              .delete<{ message?: string }>('/api/user/delete-account')
              .then(async (res) => {
                if (!isCloudAccountEpochCurrent(account)) {
                  Alert.alert(
                    'Account changed',
                    'The active account changed before deletion completed. No action was applied to the new account.',
                  );
                  return;
                }
                // Sign out to clear cloud-scoped local state on this device.
                // (Local Mode on-device data is intentionally preserved — it is
                // not tied to the deleted cloud account.)
                await signOut().catch(() => {});
                Alert.alert(
                  'Account deletion scheduled',
                  res?.message ??
                    'Your account and all cloud data will be permanently deleted within 24 hours.',
                );
              })
              .catch((err: unknown) => {
                if (!isCloudAccountEpochCurrent(account)) {
                  Alert.alert(
                    'Account changed',
                    'The deletion request did not apply to the current account.',
                  );
                  return;
                }
                const is401 = err instanceof Error && err.message.includes('401');
                Alert.alert(
                  'Could not delete account',
                  is401
                    ? 'Your session expired. Please sign in again and retry.'
                    : 'We could not delete your account. Check your connection and try again, ' +
                        'or contact support@agiworkforce.com.',
                );
              })
              .finally(() => setDeleting(false));
          },
        },
      ],
    );
  }, [captureVisibleAccount, signOut]);

  return (
    <SettingsScreenShell title="Account">
      {/* Avatar + name/email header — mirrors desktop/website account header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderRadius: 14,
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 14,
          marginBottom: 18,
        }}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: 52, height: 52, borderRadius: 26 }}
            accessibilityLabel="Profile picture"
          />
        ) : (
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.surfaceHover,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UserRound size={24} color={colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}
          >
            {displayName || 'AGI Cloud account'}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
            {userEmail || 'Signed in'}
          </Text>
        </View>
      </View>

      {/* Profile summary */}
      <SettingsInfo
        title="Session management and account security"
        body={userEmail ? `Signed in as ${userEmail}` : 'Manage your AGI Cloud account.'}
        icon={UserRound}
      />

      <SettingsGroup>
        <SettingsRow
          label="Email"
          icon={Mail}
          value={userEmail ?? 'Unavailable'}
          onPress={userEmail ? handleChangeEmail : undefined}
          isLast
        />
      </SettingsGroup>

      {/* Current session */}
      <SettingsGroup>
        <SettingsRow label="Current session" icon={Smartphone} value="Active" isLast />
      </SettingsGroup>

      {/* User ID copy row */}
      {userId && (
        <SettingsGroup>
          <SettingsRow
            label={copied ? 'Copied!' : 'Copy User ID'}
            icon={copied ? Check : Copy}
            onPress={handleCopyId}
            value={userId.slice(0, 8) + '…'}
            isLast
          />
        </SettingsGroup>
      )}

      {/* Sign out */}
      <SettingsGroup>
        <SettingsRow
          label={loggingOut ? 'Signing out…' : 'Log Out'}
          icon={LogOut}
          onPress={loggingOut ? undefined : handleSignOut}
          isLast
        />
      </SettingsGroup>

      <SettingsInfo
        title="Your AGI Cloud data"
        body="Download chats, projects, file manifests, memories, artifacts, account details, and billing records as JSON. Local Mode data is exported separately in Data Controls."
        icon={Download}
      />
      <SettingsGroup>
        <SettingsRow
          label={exporting ? 'Exporting…' : 'Export Cloud Data'}
          icon={Download}
          value={appMode === 'cloud' ? 'JSON' : 'Cloud mode required'}
          onPress={exporting || deleting ? undefined : handleExportCloudData}
          isLast
        />
      </SettingsGroup>

      {/* Danger zone */}
      <View
        style={{
          borderRadius: 14,
          backgroundColor: colors.dangerSurface,
          borderWidth: 1,
          borderColor: colors.dangerBorder,
          overflow: 'hidden',
          marginBottom: 18,
        }}
      >
        <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.dangerBorder }}>
          <Text
            style={{
              color: colors.agentError,
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            Danger Zone
          </Text>
        </View>
        <SettingsRow
          label={deleting ? 'Deleting…' : 'Delete Account'}
          icon={Trash2}
          onPress={deleting ? undefined : handleDeleteAccount}
          isLast
        />
      </View>
    </SettingsScreenShell>
  );
}
