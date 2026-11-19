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
import { useFocusEffect, useRouter } from 'expo-router';
import { normalizeDisplayName } from '@agiworkforce/utils/display-name';
import {
  MANAGED_CLOUD_ACCOUNT_DELETION_PATH,
  MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH,
  AccountDeletionScheduleCancellationRequestSchema,
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
  CloudAccountRequired,
  SettingsScreenShell,
} from '@/src/features/settings/Common';
import { beginCloudPostAuthIntentForDestination } from '@/src/features/auth/services/postAuthIntent';
import { useAuthStore } from '@/src/features/auth/store';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
import { useStepUp } from '@/src/features/auth/hooks/useStepUp';
import {
  captureStepUpIdentity,
  isStepUpCancelled,
  type StepUpIdentity,
} from '@/src/features/auth/services/stepUp';
import {
  CloudExportSharingUnavailableError,
  PartialCloudDataExportError,
  describePartialCloudDataExport,
  exportCloudUserData,
  shareCloudDataExport,
} from '@/services/cloudDataExport';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudSyncStateStore } from '@/stores/chat/cloudSyncStateStore';
import { syncNow } from '@/services/cloudSyncEngine';
import {
  captureCloudAccountEpoch,
  subscribeCloudAccountEpochChange,
  isCloudAccountEpochCurrent,
  isStaleCloudAccountOperation,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { accountDeletionRefusal } from './accountDeletionRefusal';
import { DELETE_ACCOUNT_CONFIRMATION } from './deleteAccountConfirmation';
import { useCloudProfilePhoto } from './useCloudProfilePhoto';
import { useCloudProfileStore } from './cloudProfileStore';
import {
  activeDeviceAccount,
  deviceAccountErrorMessage,
  getDeviceAccountsClerk,
  planSignOutHandover,
  readDeviceAccounts,
} from '@/src/features/accounts/deviceAccounts';

const ORGANIZATION_PATH = '/api/settings/organization';

type DeletionOwner = { account: CloudAccountEpoch | null; active: boolean };
type DeletionReady = { ownerId: string; value: AccountDeletionStatus };
type DeletionIntent = {
  owner: DeletionOwner;
  identity: StepUpIdentity;
  ready: DeletionReady;
  phase: 'confirming' | 'running' | 'finished';
};

function parseOrganizationId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('organization' in body)) return null;
  const organization = body.organization;
  if (typeof organization !== 'object' || organization === null || !('id' in organization)) {
    return null;
  }
  return typeof organization.id === 'string' && organization.id ? organization.id : null;
}

export default function CloudAccountScreen() {
  const router = useRouter();
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);

  if (!isClerkLoaded || !isClerkSignedIn) {
    return (
      <SettingsScreenShell title="Account">
        <CloudAccountRequired
          isLoading={!isClerkLoaded}
          onSignIn={() =>
            router.push(beginCloudPostAuthIntentForDestination('/(app)/settings/cloud-account'))
          }
        />
      </SettingsScreenShell>
    );
  }

  return <SignedInCloudAccount />;
}

function SignedInCloudAccount() {
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
  const [deletionStatus, setDeletionStatus] = useState<DeletionReady | null>(null);
  const [deletionStatusError, setDeletionStatusError] = useState(false);
  const deletionStatusRequest = useRef(0);
  const deletionOwner = useRef<DeletionOwner | null>(null);
  const [deletionViewOwner, setDeletionViewOwner] = useState<DeletionOwner | null>(null);
  const deletionReady = useRef<DeletionReady | null>(null);
  const deletionIntent = useRef<DeletionIntent | null>(null);
  const [organization, setOrganization] = useState<{ ownerId: string; id: string } | null>(null);
  const [organizationCopied, setOrganizationCopied] = useState(false);

  useLayoutEffect(() => {
    setCopied(false);
    setLoggingOut(false);
    setExporting(false);
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

  const retireConfirmation = useCallback(() => {
    const intent = deletionIntent.current;
    if (intent?.phase !== 'confirming') return;
    intent.phase = 'finished';
    deletionIntent.current = null;
  }, []);

  const refreshDeletionStatus = useCallback(
    async (owner: DeletionOwner, account = owner.account) => {
      if (
        !owner.active ||
        deletionOwner.current !== owner ||
        !isCloudAccountEpochCurrent(owner.account) ||
        !isCloudAccountEpochCurrent(account) ||
        !userId ||
        account.ownerId !== userId ||
        owner.account.epoch !== account.epoch
      )
        return;
      retireConfirmation();
      deletionReady.current = null;
      const request = ++deletionStatusRequest.current;
      setDeletionStatus(null);
      setDeletionStatusError(false);
      const current = () =>
        owner.active &&
        deletionOwner.current === owner &&
        isCloudAccountEpochCurrent(account) &&
        request === deletionStatusRequest.current;
      try {
        const status = parseAccountDeletionStatus(
          await api.get<unknown>(MANAGED_CLOUD_ACCOUNT_DELETION_PATH, { accountEpoch: account }),
        );
        if (current()) {
          const ready = { ownerId: account.ownerId, value: status };
          deletionReady.current = ready;
          setDeletionStatus(ready);
        }
      } catch {
        if (current()) setDeletionStatusError(true);
      }
    },
    [retireConfirmation, userId],
  );

  useFocusEffect(
    useCallback(() => {
      const retire = () => {
        if (deletionOwner.current) deletionOwner.current.active = false;
        deletionOwner.current = null;
        deletionReady.current = null;
        const intent = deletionIntent.current;
        if (intent) intent.phase = 'finished';
        deletionIntent.current = null;
        deletionStatusRequest.current += 1;
      };
      const renew = () => {
        retire();
        const account = captureCloudAccountEpoch();
        const owner = { account, active: true };
        deletionOwner.current = owner;
        setDeletionViewOwner(owner);
        setDeleting(false);
        setCancellingDeletion(false);
        setDeletionStatus(null);
        setDeletionStatusError(false);
        void refreshDeletionStatus(owner, account);
      };
      renew();
      const unsubscribe = subscribeCloudAccountEpochChange(renew);
      return () => {
        retire();
        unsubscribe();
      };
    }, [refreshDeletionStatus]),
  );

  const finishDeletionIntent = useCallback((intent: DeletionIntent) => {
    if (deletionIntent.current !== intent) return;
    intent.phase = 'finished';
    deletionIntent.current = null;
    if (intent.owner.active && deletionOwner.current === intent.owner) {
      setDeleting(false);
      setCancellingDeletion(false);
    }
  }, []);

  const deletionIntentIsCurrent = useCallback(
    (intent: DeletionIntent) =>
      intent.owner.active &&
      deletionOwner.current === intent.owner &&
      deletionIntent.current === intent &&
      intent.identity.isCurrent(),
    [],
  );

  const beginDeletionIntent = useCallback(
    (action: 'schedule' | 'cancel'): DeletionIntent | null => {
      const owner = deletionViewOwner;
      const ready = deletionStatus;
      if (
        !owner?.active ||
        deletionOwner.current !== owner ||
        !ready ||
        deletionReady.current !== ready ||
        !isCloudAccountEpochCurrent(owner.account) ||
        owner.account.ownerId !== userId ||
        ready.ownerId !== userId ||
        (action === 'schedule'
          ? ready.value.pending
          : !ready.value.pending ||
            !ready.value.canCancel ||
            ready.value.cancellationPrecondition !== 'schedule-pair-v1')
      ) {
        return null;
      }
      const previous = deletionIntent.current;
      if (previous?.phase === 'confirming' && !previous.identity.isCurrent()) {
        finishDeletionIntent(previous);
      }
      if (deletionIntent.current) return null;
      let identity: StepUpIdentity;
      try {
        identity = captureStepUpIdentity();
      } catch (error) {
        if (isStepUpCancelled(error)) return null;
        throw error;
      }
      const intent: DeletionIntent = { owner, ready, identity, phase: 'confirming' };
      deletionIntent.current = intent;
      return intent;
    },
    [deletionStatus, deletionViewOwner, finishDeletionIntent, userId],
  );

  const consumeDeletionIntent = useCallback(
    (intent: DeletionIntent) => {
      if (intent.phase !== 'confirming') return false;
      if (!deletionIntentIsCurrent(intent) || deletionReady.current !== intent.ready) {
        finishDeletionIntent(intent);
        return false;
      }
      intent.phase = 'running';
      return true;
    },
    [deletionIntentIsCurrent, finishDeletionIntent],
  );

  const cancelDeletionIntent = useCallback(
    (intent: DeletionIntent) => {
      if (intent.phase === 'confirming') finishDeletionIntent(intent);
    },
    [finishDeletionIntent],
  );

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
    const deviceAccounts = readDeviceAccounts(getDeviceAccountsClerk());
    const signedInAccount = deviceAccounts.multiSession
      ? activeDeviceAccount(deviceAccounts)
      : null;
    const handover = planSignOutHandover(deviceAccounts);
    const message = signedInAccount
      ? handover
        ? `Log out of ${signedInAccount.email} on this device? You will continue as ${handover.next.email}.`
        : `Log out of ${signedInAccount.email} on this device?`
      : 'Log out of AGI Cloud on this device?';
    Alert.alert('Log Out', message, [
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
            .catch((error: unknown) => {
              Alert.alert('Sign out failed', deviceAccountErrorMessage(error, 'sign-out'));
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

    const runExport = (work: Promise<void>) => {
      setExporting(true);
      work
        .catch((error: unknown) => {
          if (isStaleCloudAccountOperation(error) || !isCloudAccountEpochCurrent(account)) {
            return;
          }
          if (error instanceof PartialCloudDataExportError) {
            const leavesRowsOut =
              error.completeness.truncated_sections.length > 0 ||
              error.completeness.skipped_rows.length > 0;
            Alert.alert(
              'Your export is incomplete',
              describePartialCloudDataExport(error.completeness),
              [
                { text: 'Cancel', style: 'cancel' },
                ...(leavesRowsOut
                  ? [
                      {
                        text: 'Get help',
                        onPress: () =>
                          router.push('/(app)/support' as Parameters<typeof router.push>[0]),
                      },
                    ]
                  : []),
                {
                  text: 'Save what’s included',
                  onPress: () => {
                    if (!isCloudAccountEpochCurrent(account)) return;
                    runExport(shareCloudDataExport(account, error.document, 'partial'));
                  },
                },
              ],
            );
            return;
          }
          if (error instanceof CloudExportSharingUnavailableError) {
            Alert.alert(
              'Export not saved',
              'This device has no way to save or share the export file. Nothing was shared.',
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
    };
    runExport(exportCloudUserData(account));
  }, [appMode, captureVisibleAccount, router, setAppMode]);

  const handleDeleteAccount = useCallback(() => {
    const intent = beginDeletionIntent('schedule');
    if (!intent) return;
    const account = intent.identity.account;
    Alert.alert(
      DELETE_ACCOUNT_CONFIRMATION.title,
      DELETE_ACCOUNT_CONFIRMATION.message,
      [
        {
          text: DELETE_ACCOUNT_CONFIRMATION.cancelLabel,
          style: 'cancel',
          onPress: () => cancelDeletionIntent(intent),
        },
        {
          text: DELETE_ACCOUNT_CONFIRMATION.confirmLabel,
          style: 'destructive',
          onPress: () => {
            if (!consumeDeletionIntent(intent)) return;
            setDeleting(true);
            withStepUp('account.delete', null, (headers) =>
              api.delete<unknown>(MANAGED_CLOUD_ACCOUNT_DELETION_PATH, {
                headers,
                accountEpoch: account,
              }),
            )
              .then(async (res) => {
                if (!deletionIntentIsCurrent(intent)) return;
                const receipt = parseAccountDeletionScheduleReceipt(res);
                await signOut().catch(() => {});
                const storeBilling = receipt.storeBilling;
                if (!storeBilling) {
                  Alert.alert('Account deletion scheduled', receipt.message);
                  return;
                }
                Alert.alert('Account deletion scheduled', receipt.message, [
                  { text: 'OK', style: 'cancel' },
                  {
                    text: 'Open subscriptions',
                    onPress: () => void openExternalUrl(storeBilling.manageUrl),
                  },
                ]);
              })
              .catch(async (err: unknown) => {
                if (isStepUpCancelled(err)) return;
                if (!deletionIntentIsCurrent(intent)) return;
                const refusal = accountDeletionRefusal(err);
                if (refusal) {
                  Alert.alert(
                    'Could not delete account',
                    refusal.message,
                    refusal.reason === 'active_subscription'
                      ? [
                          { text: 'OK', style: 'cancel' },
                          {
                            text: 'View plan',
                            onPress: () =>
                              router.push(
                                '/(app)/settings/cloud-billing' as Parameters<
                                  typeof router.push
                                >[0],
                              ),
                          },
                        ]
                      : undefined,
                  );
                  return;
                }
                Alert.alert(
                  'Could not confirm deletion scheduling',
                  'The scheduling outcome is unknown. Check the refreshed status in this account before taking another action. A status check may not reflect a request still in progress.',
                );
                await refreshDeletionStatus(intent.owner, account);
              })
              .finally(() => {
                finishDeletionIntent(intent);
              });
          },
        },
      ],
      { cancelable: true, onDismiss: () => cancelDeletionIntent(intent) },
    );
  }, [
    beginDeletionIntent,
    cancelDeletionIntent,
    consumeDeletionIntent,
    deletionIntentIsCurrent,
    finishDeletionIntent,
    refreshDeletionStatus,
    router,
    signOut,
    withStepUp,
  ]);

  const handleCancelDeletion = useCallback(() => {
    const intent = beginDeletionIntent('cancel');
    if (!intent) return;
    const parsed = AccountDeletionScheduleCancellationRequestSchema.safeParse({
      expectedSchedule: {
        scheduledFor: intent.ready.value.scheduledFor,
        requestedAt: intent.ready.value.requestedAt,
      },
    });
    if (!parsed.success) {
      finishDeletionIntent(intent);
      return;
    }
    const body = Object.freeze({ expectedSchedule: Object.freeze(parsed.data.expectedSchedule) });
    const account = intent.identity.account;
    Alert.alert(
      'Cancel account deletion?',
      'Ask to cancel this scheduled account deletion. This does not restore data already erased or change other account restrictions.',
      [
        {
          text: 'Keep deletion scheduled',
          style: 'cancel',
          onPress: () => cancelDeletionIntent(intent),
        },
        {
          text: 'Cancel deletion',
          onPress: () => {
            if (!consumeDeletionIntent(intent)) return;
            setCancellingDeletion(true);
            deletionStatusRequest.current += 1;
            deletionReady.current = null;
            setDeletionStatus(null);
            setDeletionStatusError(false);
            api
              .put<unknown>(MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH, body, {
                accountEpoch: account,
                auth401Recovery: 'caller-owned',
              })
              .then((response) => {
                if (!deletionIntentIsCurrent(intent)) return;
                deletionStatusRequest.current += 1;
                const receipt = parseAccountDeletionCancellationReceipt(response);
                const ready = { ownerId: account.ownerId, value: NO_PENDING_ACCOUNT_DELETION };
                deletionReady.current = ready;
                setDeletionStatus(ready);
                setDeletionStatusError(false);
                Alert.alert(
                  receipt.cancelled ? 'Account deletion cancelled' : 'No account deletion pending',
                  receipt.cancelled
                    ? receipt.planRenewal
                      ? receipt.message
                      : 'Your account deletion was cancelled.'
                    : 'The server confirmed that no account deletion is pending.',
                );
              })
              .catch(async (error: unknown) => {
                if (!deletionIntentIsCurrent(intent)) return;
                const expired =
                  error instanceof ApiHttpError &&
                  error.status === 409 &&
                  error.body?.['reason'] === 'grace_window_expired';
                const changed =
                  error instanceof ApiHttpError &&
                  error.status === 409 &&
                  error.body?.['reason'] === 'schedule_changed';
                Alert.alert(
                  changed
                    ? 'Deletion schedule changed'
                    : expired
                      ? 'Cancellation window closed'
                      : 'Could not confirm cancellation',
                  changed
                    ? 'The server refused to cancel because the deletion schedule changed. Check the refreshed status and open a new confirmation before deciding whether to cancel.'
                    : expired
                      ? 'The server refused cancellation because the grace window has closed. Check the refreshed deletion status. This does not confirm that erasure is complete.'
                      : 'The cancellation outcome is unknown. A later status showing no scheduled deletion does not prove this cancellation succeeded. Check the refreshed status and open a new confirmation before trying again.',
                );
                await refreshDeletionStatus(intent.owner, account);
              })
              .finally(() => {
                finishDeletionIntent(intent);
              });
          },
        },
      ],
      { cancelable: true, onDismiss: () => cancelDeletionIntent(intent) },
    );
  }, [
    beginDeletionIntent,
    cancelDeletionIntent,
    consumeDeletionIntent,
    deletionIntentIsCurrent,
    finishDeletionIntent,
    refreshDeletionStatus,
  ]);

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
              ? `Cancellation deadline: ${new Date(deletionStatus.value.scheduledFor).toLocaleString()}. ${
                  deletionStatus.value.canCancel
                    ? deletionStatus.value.cancellationPrecondition === 'schedule-pair-v1'
                      ? 'You can request cancellation before then.'
                      : 'Protected cancellation is unavailable. Refresh the status before trying again.'
                    : 'The cancellation window has closed.'
                } Erasure is processed after the deadline and may take longer.`
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
            label={
              deletionStatusError
                ? 'Could not check deletion status. Retry'
                : 'Check deletion status'
            }
            icon={RefreshCw}
            onPress={() => {
              if (deletionViewOwner) void refreshDeletionStatus(deletionViewOwner);
            }}
            isLast
          />
        ) : deletionStatus.value.pending ? (
          <SettingsRow
            label={
              deletionStatus.value.canCancel
                ? deletionStatus.value.cancellationPrecondition !== 'schedule-pair-v1'
                  ? 'Protected cancellation unavailable. Refresh'
                  : cancellingDeletion
                    ? 'Cancelling…'
                    : 'Cancel Account Deletion'
                : 'Cancellation window closed'
            }
            icon={deletionStatus.value.canCancel ? Undo2 : Trash2}
            onPress={
              cancellingDeletion || !deletionStatus.value.canCancel
                ? undefined
                : deletionStatus.value.cancellationPrecondition !== 'schedule-pair-v1'
                  ? () => {
                      if (deletionViewOwner) void refreshDeletionStatus(deletionViewOwner);
                    }
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
              deleting ||
              cancellingDeletion ||
              deletionStatusError ||
              deletionStatus?.ownerId !== userId
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
