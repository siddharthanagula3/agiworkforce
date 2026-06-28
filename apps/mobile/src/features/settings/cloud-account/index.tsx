/**
 * Cloud Account Settings Screen
 *
 * Aligns with the web AccountSection: session management + user ID.
 * Cloud-only — shown when FEATURES.auth is true and user is signed in.
 */

import { useCallback, useState } from 'react';
import { Alert, Clipboard, View } from 'react-native';
import { Copy, Check, LogOut, Smartphone, Trash2, UserRound } from 'lucide-react-native';
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

export default function CloudAccountScreen() {
  const colors = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;
  const displayName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? null;

  const [copied, setCopied] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleCopyId = useCallback(() => {
    if (!userId) return;
    Clipboard.setString(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [userId]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Log Out', 'Log out of AGI Cloud on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          setLoggingOut(true);
          signOut()
            .catch(() => {
              Alert.alert('Sign out failed', 'Please try again.');
            })
            .finally(() => setLoggingOut(false));
        },
      },
    ]);
  }, [signOut]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your AGI Cloud account and all cloud data (chats, projects, ' +
        'memory, artifacts) within 24 hours. This cannot be undone, and you will be signed out ' +
        'on this device.\n\n' +
        'On-device Local Mode data stays on this device — remove it separately from ' +
        'Settings → Data Controls if you want a full wipe.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            // Server derives the user from the Clerk Bearer token; no body needed.
            // CSRF is bypassed for Bearer-authenticated requests server-side.
            api
              .delete<{ message?: string }>('/api/user/delete-account')
              .then(async (res) => {
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
  }, [signOut]);

  return (
    <SettingsScreenShell title="Account">
      {/* Profile summary */}
      <SettingsInfo
        title="Session management and account security"
        body={userEmail ? `Signed in as ${userEmail}` : 'Manage your AGI Cloud account.'}
        icon={UserRound}
      />

      {/* Profile info row */}
      {(displayName || userEmail) && (
        <SettingsGroup>
          {displayName ? <SettingsRow label={displayName} icon={UserRound} value="Name" /> : null}
          {userEmail ? (
            <SettingsRow label={userEmail} icon={UserRound} value="Email" isLast />
          ) : null}
        </SettingsGroup>
      )}

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
