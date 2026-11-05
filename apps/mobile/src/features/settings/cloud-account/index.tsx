import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Clipboard, Image, TextInput, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
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
  parseAccountDeletionScheduleReceipt,
  parseAccountDeletionCancellationReceipt,
  type AccountDeletionStatus,
} from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/Common';
import { useAuthStore } from '@/src/features/auth/store';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
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

const ORGANIZATION_PATH = '/api/settings/organization';

function parseOrganizationId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('organization' in body)) return null;
  const organization = body.organization;
  if (typeof organization !== 'object' || organization === null || !('id' in organization)) {
    return null;
  }
  return typeof organization.id === 'string' && organization.id ? organization.id : null;
}

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
  const deletionStatusRequest = useRef(0);
  const cancellationInFlight = useRef(false);
  const [organization, setOrganization] = useState<{ ownerId: string; id: string } | null>(null);
  const [organizationCopied, setOrganizationCopied] = useState(false);

  useLayoutEffect(() => {
    deletionStatusRequest.current += 1;
    cancellationInFlight.current = false;
    setCopied(false);
    setLoggingOut(false);
    setExporting(false);
    setDeleting(false);
    setCancellingDeletion(false);
    setDeletionStatus(null);
    setDeletionStatusError(false);
    setOrganization(null);
    setOrganizationCopied(false);
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

  const refreshDeletionStatus = useCallback(async (
    account = captureCloudAccountEpoch(),
  ) => {
    if (!isCloudAccountEpochCurrent(account) || !userId || account.ownerId !== userId) return;
    const request = ++deletionStatusRequest.current;
    setDeletionStatus(null);
    setDeletionStatusError(false);
    try {
      const status = parseAccountDeletionStatus(
        await api.get<unknown>(MANAGED_CLOUD_ACCOUNT_DELETION_PATH, { accountEpoch: account }),
      );
      if (isCloudAccountEpochCurrent(account) && request === deletionStatusRequest.current) {
        setDeletionStatus({ ownerId: account.ownerId, value: status });
      }
    } catch {
      if (isCloudAccountEpochCurrent(account) && request === deletionStatusRequest.current) {
        setDeletionStatusError(true);
      }
    }
  }, [userId]);

  useEffect(() => {
    void refreshDeletionStatus();
  }, [refreshDeletionStatus]);

  useEffect(() => {
    const account = captureCloudAccountEpoch();
    if (!account || !userId || account.ownerId !== userId) return;
    void api
      .get<unknown>(ORGANIZATION_PATH)
      .then((body) => {
        const id = parseOrganizationId(body);
        if (id && isCloudAccountEpochCurrent(account)) {
          setOrganization({ ownerId: account.ownerId, id });
        }
      })
      .catch(() => undefined);
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

  const organizationId = organization?.ownerId === userId ? organization.id : null;

  const handleCopyOrganizationId = useCallback(() => {
    if (!organizationId) return;
    Clipboard.setString(organizationId);
    setOrganizationCopied(true);
    setTimeout(() => setOrganizationCopied(false), 2000);
  }, [organizationId]);

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
        'Cloud export needs AGI Cloud. Switching does not upload your Local Mode chats or files.',
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
    if (cancellationInFlight.current) return;
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
          if (cancellationInFlight.current) return;
          setDeleting(true);
          withStepUp('account.delete', null, (headers) =>
            api.delete<unknown>(
              MANAGED_CLOUD_ACCOUNT_DELETION_PATH,
              { headers, accountEpoch: account },
            ),
          )
            .then(async (res) => {
              if (!isCloudAccountEpochCurrent(account)) {
                Alert.alert(
                  'Account changed',
                  'The active account changed. Check deletion status in the original account to confirm the outcome.',
                );
                return;
              }
              const receipt = parseAccountDeletionScheduleReceipt(res);
              await signOut().catch(() => {});
              Alert.alert(
                'Account deletion scheduled',
                receipt.message,
              );
            })
            .catch((err: unknown) => {
              if (isStepUpCancelled(err)) return;
              if (!isCloudAccountEpochCurrent(account)) {
                Alert.alert(
                  'Account changed',
                  'The active account changed. Check deletion status in the original account to confirm the outcome.',
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
                is401 ? 'Session expired' : 'Could not confirm deletion scheduling',
                is401
                  ? 'Your session expired. Sign in to the original account and check deletion status before taking another action.'
                  : 'The scheduling outcome is unknown. Check the refreshed status in this account before taking another action. A status check may not reflect a request still in progress.',
              );
              void refreshDeletionStatus(account);
            })
            .finally(() => {
              if (isCloudAccountEpochCurrent(account)) setDeleting(false);
            });
        },
      },
    ]);
  }, [captureVisibleAccount, refreshDeletionStatus, router, signOut, withStepUp]);

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
            if (cancellationInFlight.current) return;
            cancellationInFlight.current = true;
            setCancellingDeletion(true);
            deletionStatusRequest.current += 1;
            setDeletionStatus(null);
            setDeletionStatusError(false);
            api
              .post<unknown>(
                MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_PATH,
                undefined,
                { accountEpoch: account },
              )
              .then((response) => {
                if (!isCloudAccountEpochCurrent(account)) return;
                deletionStatusRequest.current += 1;
                const receipt = parseAccountDeletionCancellationReceipt(response);
                setDeletionStatus({
                  ownerId: account.ownerId,
                  value: NO_PENDING_ACCOUNT_DELETION,
                });
                setDeletionStatusError(false);
                Alert.alert(
                  receipt.cancelled ? 'Account deletion cancelled' : 'No account deletion pending',
                  receipt.cancelled
                    ? 'Your account deletion was cancelled.'
                    : 'The server confirmed that no account deletion is pending.',
                );
              })
              .catch((error: unknown) => {
                if (!isCloudAccountEpochCurrent(account)) return;
                const expired =
                  error instanceof ApiHttpError && error.status === 409 &&
                  error.body?.['reason'] === 'grace_window_expired';
                Alert.alert(
                  expired ? 'Cancellation window closed' : 'Could not confirm cancellation',
                  expired
                    ? 'The server refused cancellation because the grace window has closed. Check the refreshed deletion status. This does not confirm that erasure is complete.'
                    : 'The cancellation outcome is unknown. Check the refreshed deletion status before taking another action.',
                );
                void refreshDeletionStatus(account);
              })
              .finally(() => {
                if (isCloudAccountEpochCurrent(account)) {
                  cancellationInFlight.current = false;
                  setCancellingDeletion(false);
                }
              });
          },
        },
      ],
    );
  }, [captureVisibleAccount, refreshDeletionStatus]);

  return (
    <SettingsScreenShell title="Account">
      {stepUpModal}
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

      {userId && (
        <SettingsGroup>
          <SettingsRow
            label={copied ? 'Copied!' : 'Copy User ID'}
            icon={copied ? Check : Copy}
            onPress={handleCopyId}
            value={userId.slice(0, 8) + '…'}
            isLast={!organizationId}
          />
          {organizationId ? (
            <SettingsRow
              label={organizationCopied ? 'Copied!' : 'Copy Organization ID'}
              icon={organizationCopied ? Check : Copy}
              onPress={handleCopyOrganizationId}
              value={organizationId.slice(0, 8) + '…'}
              isLast
            />
          ) : null}
        </SettingsGroup>
      )}

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
        body="Download everything in your AGI Cloud account as JSON."
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
        {deletionStatus?.ownerId !== userId ? (
          <SettingsRow
            label={deletionStatusError ? 'Could not check deletion status. Retry' : 'Check deletion status'}
            icon={RefreshCw}
            onPress={() => void refreshDeletionStatus()}
            isLast
          />
        ) : deletionStatus.value.pending ? (
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
            destructive
            onPress={
              deleting || cancellingDeletion || deletionStatusError || deletionStatus?.ownerId !== userId
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
