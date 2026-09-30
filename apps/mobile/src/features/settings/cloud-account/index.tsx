import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Clipboard, Image, TextInput, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import {
  Copy,
  Check,
  Download,
  LogOut,
  Mail,
  Pencil,
  Smartphone,
  RefreshCw,
  Trash2,
  Undo2,
  UserRound,
} from 'lucide-react-native';
import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { normalizeDisplayName } from '@agiworkforce/utils/display-name';
import {
  MANAGED_CLOUD_ACCOUNT_DELETION_PATH,
  MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_PATH,
  NO_PENDING_ACCOUNT_DELETION,
  parseAccountDeletionStatus,
  type AccountDeletionStatus,
} from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { useAuthStore } from '@/src/features/auth/store';
import { api } from '@/services/api';
import { useStepUp } from '@/src/features/auth/hooks/useStepUp';
import { isStepUpCancelled } from '@/src/features/auth/services/stepUp';
import { exportCloudUserData } from '@/services/cloudDataExport';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudSyncStateStore } from '@/stores/chat/cloudSyncStateStore';
import { syncNow } from '@/services/cloudSyncEngine';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  isStaleCloudAccountOperation,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { accountDeletionRefusal } from './accountDeletionRefusal';
import { DELETE_ACCOUNT_CONFIRMATION } from './deleteAccountConfirmation';
import { useCloudProfilePhoto } from './useCloudProfilePhoto';
import { useCloudProfileStore } from './cloudProfileStore';

const ACCOUNT_DELETE_FAILED =
  'We could not delete your account. Check your connection and try again, ' +
  'or contact support@agiworkforce.com.';

export default function CloudAccountScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const signOut = useAuthStore((s) => s.signOut);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const syncStatus = useCloudSyncStateStore((s) => s.status);
  const lastSyncAt = useCloudSyncStateStore((s) => s.lastSyncAt);
  const { user: clerkUser } = useUser();
  const { withStepUp, modal: stepUpModal } = useStepUp();
  const { changePhoto, savingPhoto } = useCloudProfilePhoto(clerkUser);

  const userId = clerkUser?.id ?? null;
  const userEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
  const rawDisplayName = clerkUser?.fullName ?? clerkUser?.username ?? null;
  const storedProfileName = useCloudProfileStore((state) =>
    state.ownerId === userId ? state.displayName : null,
  );
  const storedProfileAvatar = useCloudProfileStore((state) =>
    state.ownerId === userId && state.loaded ? state.avatarUrl : clerkUser?.imageUrl,
  );
  const profileNameError = useCloudProfileStore((state) =>
    state.ownerId === userId ? state.error : null,
  );
  const savingName = useCloudProfileStore((state) => state.saving && state.ownerId === userId);
  const loadProfileName = useCloudProfileStore((state) => state.load);
  const saveProfileName = useCloudProfileStore((state) => state.save);
  const displayName =
    storedProfileName || (rawDisplayName ? normalizeDisplayName(rawDisplayName) : null);
  const avatarUrl = storedProfileAvatar ?? null;

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancellingDeletion, setCancellingDeletion] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<{
    ownerId: string;
    value: AccountDeletionStatus;
  } | null>(null);
  const [deletionStatusError, setDeletionStatusError] = useState(false);

  useLayoutEffect(() => {
    setCopied(false);
    setLoggingOut(false);
    setExporting(false);
    setDeleting(false);
    setCancellingDeletion(false);
    setDeletionStatus(null);
    setDeletionStatusError(false);
    setEditingName(false);
    setNameDraft('');
  }, [userId]);

  useEffect(() => {
    if (userId) void loadProfileName(userId);
  }, [loadProfileName, userId]);

  const handleSaveName = useCallback(async () => {
    if (!userId) return;
    if (await saveProfileName(userId, nameDraft)) setEditingName(false);
  }, [nameDraft, saveProfileName, userId]);

  const refreshDeletionStatus = useCallback(async () => {
    const account = captureCloudAccountEpoch();
    if (!account || !userId || account.ownerId !== userId) return;
    setDeletionStatusError(false);
    try {
      const status = parseAccountDeletionStatus(
        await api.get<unknown>(MANAGED_CLOUD_ACCOUNT_DELETION_PATH),
      );
      if (isCloudAccountEpochCurrent(account)) {
        setDeletionStatus({ ownerId: account.ownerId, value: status });
      }
    } catch {
      if (isCloudAccountEpochCurrent(account)) setDeletionStatusError(true);
    }
  }, [userId]);

  useEffect(() => {
    void refreshDeletionStatus();
  }, [refreshDeletionStatus]);

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
          'AGI could not create your Cloud data export. Check your connection and try again.',
        );
      })
      .finally(() => {
        if (isCloudAccountEpochCurrent(account)) setExporting(false);
      });
  }, [appMode, captureVisibleAccount, setAppMode]);

  const handleDeleteAccount = useCallback(() => {
    const account = captureVisibleAccount();
    if (!account) return;
    Alert.alert(DELETE_ACCOUNT_CONFIRMATION.title, DELETE_ACCOUNT_CONFIRMATION.message, [
      { text: DELETE_ACCOUNT_CONFIRMATION.cancelLabel, style: 'cancel' },
      {
        text: DELETE_ACCOUNT_CONFIRMATION.confirmLabel,
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
          withStepUp('account.delete', null, (headers) =>
            api.delete<{ message?: string; scheduledFor?: string }>(
              MANAGED_CLOUD_ACCOUNT_DELETION_PATH,
              { headers },
            ),
          )
            .then(async (res) => {
              if (!isCloudAccountEpochCurrent(account)) {
                Alert.alert(
                  'Account changed',
                  'The active account changed before deletion completed. No action was applied to the new account.',
                );
                return;
              }
              await signOut().catch(() => {});
              Alert.alert(
                res?.scheduledFor ? 'Account deletion scheduled' : 'Account deleted',
                res?.message ?? 'Your account deletion request was completed.',
              );
            })
            .catch((err: unknown) => {
              if (isStepUpCancelled(err)) return;
              if (!isCloudAccountEpochCurrent(account)) {
                Alert.alert(
                  'Account changed',
                  'The deletion request did not apply to the current account.',
                );
                return;
              }
              const refusal = accountDeletionRefusal(err);
              if (refusal) {
                Alert.alert(
                  'Could not delete account',
                  refusal.message,
                  refusal.reason === 'active_subscription'
                    ? [
                        { text: 'OK', style: 'cancel' },
                        {
                          text: 'Open Billing',
                          onPress: () =>
                            router.push(
                              '/(app)/settings/cloud-billing' as Parameters<typeof router.push>[0],
                            ),
                        },
                      ]
                    : undefined,
                );
                return;
              }
              const is401 = err instanceof Error && err.message.includes('401');
              Alert.alert(
                'Could not delete account',
                is401
                  ? 'Your session expired. Please sign in again and retry.'
                  : ACCOUNT_DELETE_FAILED,
              );
            })
            .finally(() => setDeleting(false));
        },
      },
    ]);
  }, [captureVisibleAccount, router, signOut, withStepUp]);

  const handleCancelDeletion = useCallback(() => {
    const account = captureVisibleAccount();
    if (!account) return;
    Alert.alert(
      'Cancel account deletion?',
      'Your AGI Cloud account will stay active and its data will not be erased.',
      [
        { text: 'Keep deletion scheduled', style: 'cancel' },
        {
          text: 'Cancel deletion',
          onPress: () => {
            if (!isCloudAccountEpochCurrent(account)) {
              Alert.alert('Account changed', 'Open this action again for the current account.');
              return;
            }
            setCancellingDeletion(true);
            api
              .post<{ cancelled: boolean; message?: string }>(
                MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_PATH,
              )
              .then((response) => {
                if (!isCloudAccountEpochCurrent(account)) return;
                if (response.cancelled !== true) {
                  throw new Error('The server did not confirm cancellation.');
                }
                setDeletionStatus({
                  ownerId: account.ownerId,
                  value: NO_PENDING_ACCOUNT_DELETION,
                });
                Alert.alert(
                  'Account deletion cancelled',
                  response.message ?? 'Your account is active.',
                );
              })
              .catch(() => {
                if (!isCloudAccountEpochCurrent(account)) return;
                Alert.alert(
                  'Could not cancel account deletion',
                  'Check your connection and try again. The scheduled deletion remains in place until cancellation is confirmed.',
                );
                void refreshDeletionStatus();
              })
              .finally(() => {
                if (isCloudAccountEpochCurrent(account)) setCancellingDeletion(false);
              });
          },
        },
      ],
    );
  }, [captureVisibleAccount, refreshDeletionStatus]);

  return (
    <SettingsScreenShell title="Account">
      {stepUpModal}
      {/* Avatar + name/email header, mirrors desktop/website account header */}
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
        <Pressable
          testID="cloud-account-change-photo"
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          accessibilityState={{ disabled: savingPhoto || !clerkUser }}
          disabled={savingPhoto || !clerkUser}
          onPress={() => void changePhoto()}
          style={{ width: 52, height: 52 }}
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
          <View
            style={{
              position: 'absolute',
              right: -3,
              bottom: -3,
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Pencil size={11} color={colors.textPrimary} />
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          {editingName ? (
            <View style={{ gap: 8 }}>
              <TextInput
                testID="cloud-account-name-input"
                accessibilityLabel="Display name"
                value={nameDraft}
                onChangeText={setNameDraft}
                maxLength={120}
                autoCapitalize="words"
                autoCorrect={false}
                style={{
                  minHeight: 44,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  color: colors.textPrimary,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Pressable
                  testID="cloud-account-save-name"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: savingName || !nameDraft.trim() }}
                  disabled={savingName || !nameDraft.trim()}
                  onPress={() => void handleSaveName()}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>
                    {savingName ? 'Saving…' : 'Save'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={savingName}
                  onPress={() => setEditingName(false)}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.textMuted }}>Cancel</Text>
                </Pressable>
              </View>
              {profileNameError ? (
                <Text style={{ color: colors.agentError }}>{profileNameError}</Text>
              ) : null}
            </View>
          ) : (
            <Pressable
              testID="cloud-account-edit-name"
              accessibilityRole="button"
              accessibilityLabel="Edit display name"
              onPress={() => {
                setNameDraft(displayName ?? '');
                setEditingName(true);
              }}
              style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.headline,
                  fontWeight: '700',
                  flexShrink: 1,
                }}
              >
                {displayName || 'AGI Cloud account'}
              </Text>
              <Pencil size={13} color={colors.textMuted} />
            </Pressable>
          )}
          <Text
            numberOfLines={1}
            style={{ color: colors.textMuted, fontSize: typeScale.footnote, marginTop: 2 }}
          >
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

      <SettingsGroup>
        <SettingsRow
          label="Last synced"
          icon={RefreshCw}
          value={
            syncStatus === 'syncing'
              ? 'Syncing…'
              : lastSyncAt
                ? new Date(lastSyncAt).toLocaleString()
                : 'Never'
          }
          onPress={syncStatus === 'error' ? () => void syncNow() : undefined}
          isLast
        />
      </SettingsGroup>
      {syncStatus === 'error' ? (
        <SettingsInfo
          title="Cloud sync needs attention"
          body="Recent changes have not reached your account. Tap Last synced to retry."
          icon={RefreshCw}
        />
      ) : null}

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

      {deletionStatus?.ownerId === userId && deletionStatus.value.pending && (
        <SettingsInfo
          title="Account deletion scheduled"
          body={
            deletionStatus.value.scheduledFor
              ? `Erasure is scheduled for ${new Date(deletionStatus.value.scheduledFor).toLocaleString()}. ${
                  deletionStatus.value.canCancel
                    ? 'You can cancel before then.'
                    : 'The cancellation window has closed.'
                }`
              : 'Your account is scheduled for deletion.'
          }
          icon={Trash2}
        />
      )}
      {deletionStatusError && (
        <SettingsGroup>
          <SettingsRow
            label="Could not check deletion status. Retry"
            icon={Trash2}
            onPress={() => void refreshDeletionStatus()}
            isLast
          />
        </SettingsGroup>
      )}
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
            accessibilityRole="header"
            style={{
              color: colors.agentError,
              fontSize: typeScale.caption,
              fontWeight: '700',
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            Danger Zone
          </Text>
        </View>
        {deletionStatus?.ownerId === userId && deletionStatus.value.pending ? (
          <SettingsRow
            label={
              deletionStatus.value.canCancel
                ? cancellingDeletion
                  ? 'Cancelling…'
                  : 'Cancel Account Deletion'
                : 'Cancellation window closed'
            }
            icon={deletionStatus.value.canCancel ? Undo2 : Trash2}
            onPress={
              cancellingDeletion || !deletionStatus.value.canCancel
                ? undefined
                : handleCancelDeletion
            }
            isLast
          />
        ) : (
          <SettingsRow
            label={deleting ? 'Deleting…' : 'Delete Account'}
            icon={Trash2}
            onPress={
              deleting || deletionStatusError || deletionStatus?.ownerId !== userId
                ? undefined
                : handleDeleteAccount
            }
            isLast
          />
        )}
      </View>
    </SettingsScreenShell>
  );
}
