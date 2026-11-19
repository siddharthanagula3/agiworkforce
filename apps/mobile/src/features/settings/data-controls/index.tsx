import { useCallback, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import {
  Archive,
  ArrowUpFromLine,
  ChevronRight,
  Cloud,
  Database,
  Download,
  History,
  MessagesSquare,
  ShieldCheck,
  Trash2,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useLocalDataExport } from './useLocalDataExport';
import { countLocalChats, deleteAllLocalChats } from './deleteLocalChats';
import { prepareLocalCloudSync, syncLocalConversationsToCloud } from './localCloudSyncService';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/Common';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuthStore } from '@/src/features/auth/store';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { archiveAllConversations, deleteAllConversations } from '@/src/features/archived-chats';
import { beginCloudPostAuthIntentForDestination } from '@/src/features/auth/services/postAuthIntent';
import {
  captureCloudAccountEpoch,
  subscribeCloudAccountEpochChange,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

type BulkChatAction = 'archive' | 'delete';

type BulkChatScope = { account: CloudAccountEpoch | null; active: boolean };
type BulkChatIntent = {
  owner: BulkChatScope;
  controller: AbortController;
  phase: 'first' | 'second' | 'running' | 'finished';
};

export default function DataControlsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { exporting, handleExport } = useLocalDataExport();
  const [syncing, setSyncing] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkChatAction | null>(null);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const loadConversations = useChatMessageStore((s) => s.loadConversations);
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const openCloudAccount = useCallback(() => {
    if (!isClerkLoaded) return;
    if (!isClerkSignedIn) {
      router.push(beginCloudPostAuthIntentForDestination('/(app)/settings/cloud-account'));
      return;
    }
    router.push('/(app)/settings/cloud-account');
  }, [isClerkLoaded, isClerkSignedIn, router]);

  const [bulkScope, setBulkScope] = useState<BulkChatScope | null>(null);
  const bulkScopeRef = useRef<BulkChatScope | null>(null);
  const bulkIntent = useRef<BulkChatIntent | null>(null);

  useFocusEffect(
    useCallback(() => {
      const retire = () => {
        if (bulkScopeRef.current) bulkScopeRef.current.active = false;
        bulkScopeRef.current = null;
        const intent = bulkIntent.current;
        bulkIntent.current = null;
        if (intent) {
          intent.phase = 'finished';
          intent.controller.abort();
        }
      };
      const renew = () => {
        retire();
        const owner = { account: captureCloudAccountEpoch(), active: true };
        bulkScopeRef.current = owner;
        setBulkScope(owner);
        setBulkAction(null);
      };
      renew();
      const stopAccount = subscribeCloudAccountEpochChange(renew);
      const stopMode = useChatAppModeStore.subscribe((next, previous) => {
        if (next.appMode !== previous.appMode) renew();
      });
      const stopAuth = useAuthStore.subscribe((next, previous) => {
        if (
          next.clerkUserId !== previous.clerkUserId ||
          next.isClerkSignedIn !== previous.isClerkSignedIn ||
          next.isClerkLoaded !== previous.isClerkLoaded
        )
          renew();
      });
      const stopAccess = useWaitlistStore.subscribe((next, previous) => {
        if (next.cloudUnlocked !== previous.cloudUnlocked) renew();
      });
      return () => {
        retire();
        stopAccount();
        stopMode();
        stopAuth();
        stopAccess();
      };
    }, []),
  );

  const syncOperation = useRef<AbortController | null>(null);
  const focused = useRef(false);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setSyncing(false);
      const invalidate = () => {
        syncOperation.current?.abort();
        syncOperation.current = null;
        if (focused.current) setSyncing(false);
      };
      const unsubscribeAccount = subscribeCloudAccountEpochChange(invalidate);
      const unsubscribeMode = useChatAppModeStore.subscribe((state, previous) => {
        if (state.appMode !== previous.appMode) invalidate();
      });
      return () => {
        focused.current = false;
        invalidate();
        unsubscribeAccount();
        unsubscribeMode();
      };
    }, []),
  );

  const handleSyncToCloud = () => {
    if (!focused.current || syncOperation.current) return;
    if (!cloudUnlocked || !captureCloudAccountEpoch()) {
      Alert.alert('AGI Cloud required', 'Sign in to AGI Cloud to copy local chats to the cloud.');
      return;
    }
    if (useChatAppModeStore.getState().appMode !== 'cloud') {
      Alert.alert(
        'Chat is set to Local Mode',
        'Switch chat to AGI Cloud, then return here to review the text-copy summary.',
      );
      return;
    }
    const plan = prepareLocalCloudSync();
    if (plan.messageCount === 0) {
      Alert.alert(
        'No eligible text to copy',
        'There is no eligible text in the selected local chats. Temporary chats and blank, unfinished or queued messages are excluded.',
      );
      return;
    }
    const operation = new AbortController();
    syncOperation.current = operation;
    const isCurrent = () =>
      focused.current &&
      syncOperation.current === operation &&
      !operation.signal.aborted &&
      isCloudAccountEpochCurrent(plan.account) &&
      useChatAppModeStore.getState().appMode === plan.mode;
    const finish = () => {
      if (!isCurrent()) return;
      syncOperation.current = null;
      setSyncing(false);
    };
    let started = false;
    Alert.alert(
      'Sync Local Chats to AGI Cloud?',
      `Copy ${plan.conversations.length} chats and ${plan.messageCount} text messages to your current AGI Cloud account. Local originals, files and memory stay on this device.\n\n` +
        `Limited to ${plan.conversationLimit} chats and the last ${plan.messageLimit} completed messages per chat, excluding blanks. Excluded: ${plan.temporaryChatsExcluded} temporary chats, ${plan.emptyChatsExcluded} chats with no eligible text, ${plan.conversationsOmitted} additional chats, and ${plan.messagesOmitted} messages from selected chats (including blank, unfinished or queued messages).\n\n` +
        'If a copy is interrupted, some text may already be in Cloud. Check Cloud before starting another copy; another copy can create duplicates.',
      [
        { text: 'Cancel', style: 'cancel', onPress: finish },
        {
          text: 'Sync to Cloud',
          style: 'default',
          onPress: () => {
            if (!isCurrent() || started) return;
            started = true;
            setSyncing(true);
            syncLocalConversationsToCloud(plan, operation.signal, () => {
              if (!isCurrent()) throw new Error('This copy is no longer active.');
            })
              .then((result) => {
                if (!isCurrent()) return;
                const incomplete = result.outcomeUnknown || result.errors.length > 0;
                Alert.alert(
                  incomplete ? 'Copy not fully confirmed' : 'Selected text copied',
                  `Selected text copied for ${result.conversationsSynced} chats; ${result.messagesSynced} messages acknowledged by Cloud.` +
                    (incomplete
                      ? `\n\n${result.errors.slice(0, 3).join('\n')}\n\nSome text may already be in Cloud. Check Cloud before starting another copy; another copy can create duplicates.`
                      : '') +
                    '\n\nLocal originals are unchanged.',
                );
              })
              .catch(() => {
                if (!isCurrent()) return;
                Alert.alert(
                  'Copy outcome unknown',
                  'Some text may already be in Cloud. Local originals are unchanged. Check Cloud before starting another copy; another copy can create duplicates.',
                );
              })
              .finally(finish);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          if (!started) finish();
        },
      },
    );
  };

  const beginBulkChatAction = useCallback(
    (action: BulkChatAction) => {
      const owner = bulkScope;
      if (!owner?.active || bulkScopeRef.current !== owner || bulkIntent.current) return;
      const auth = useAuthStore.getState();
      if (!cloudUnlocked || !useWaitlistStore.getState().cloudUnlocked) {
        Alert.alert(
          'AGI Cloud required',
          'Sign in to AGI Cloud to archive or delete your cloud chat history.',
        );
        return;
      }
      if (appMode !== 'cloud' || useChatAppModeStore.getState().appMode !== 'cloud') {
        Alert.alert(
          'Chat is set to Local Mode',
          'Switch chat to AGI Cloud to archive or delete your Cloud chats.',
        );
        return;
      }
      const account = owner.account;
      if (
        !isCloudAccountEpochCurrent(account) ||
        !auth.isClerkLoaded ||
        !auth.isClerkSignedIn ||
        auth.clerkUserId !== account.ownerId
      )
        return;
      const intent: BulkChatIntent = { owner, controller: new AbortController(), phase: 'first' };
      bulkIntent.current = intent;
      setBulkAction(action);
      const isCurrent = () => {
        const currentAuth = useAuthStore.getState();
        return (
          owner.active &&
          bulkScopeRef.current === owner &&
          bulkIntent.current === intent &&
          !intent.controller.signal.aborted &&
          isCloudAccountEpochCurrent(account) &&
          useChatAppModeStore.getState().appMode === 'cloud' &&
          useWaitlistStore.getState().cloudUnlocked &&
          currentAuth.isClerkLoaded &&
          currentAuth.isClerkSignedIn &&
          currentAuth.clerkUserId === account.ownerId
        );
      };
      const finish = () => {
        if (!isCurrent()) return;
        intent.phase = 'finished';
        bulkIntent.current = null;
        setBulkAction(null);
      };
      const cancel = (phase: BulkChatIntent['phase']) => {
        if (isCurrent() && intent.phase === phase) finish();
      };
      const run = async () => {
        if (!isCurrent() || intent.phase !== 'second') return;
        intent.phase = 'running';
        try {
          const affectedCount = await (action === 'archive'
            ? archiveAllConversations(account, intent.controller.signal)
            : deleteAllConversations(account, intent.controller.signal));
          if (!isCurrent()) return;
          let refreshFailed = false;
          try {
            await loadConversations();
            refreshFailed = Boolean(useChatMessageStore.getState().conversationLoadError);
          } catch {
            refreshFailed = true;
          }
          if (!isCurrent()) return;
          const noun = affectedCount === 1 ? 'chat' : 'chats';
          Alert.alert(
            action === 'archive' ? 'Chats archived' : 'Chats deleted',
            (action === 'archive'
              ? `${affectedCount} ${noun} moved to Archived chats.`
              : `${affectedCount} ${noun} deleted.`) +
              (refreshFailed
                ? '\n\nThe change was confirmed, but the chat list could not be refreshed. Refresh the list to see the current history.'
                : ''),
          );
        } catch {
          if (!isCurrent()) return;
          Alert.alert(
            action === 'archive' ? 'Archive outcome unknown' : 'Delete outcome unknown',
            'The change could not be confirmed. Some chats may already have changed. Check your Cloud chat history before starting another bulk action.',
          );
        } finally {
          finish();
        }
      };
      Alert.alert(
        action === 'archive' ? 'Archive all chats?' : 'Delete all chats?',
        action === 'archive'
          ? 'Every AGI Cloud chat moves to Archived chats, where you can restore it.'
          : 'Deletes every AGI Cloud chat, archived ones too, on all devices; restorable on the web for 30 days.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => cancel('first') },
          {
            text: action === 'archive' ? 'Archive all' : 'Delete all',
            style: 'destructive',
            onPress: () => {
              if (!isCurrent() || intent.phase !== 'first') return;
              intent.phase = 'second';
              Alert.alert(
                action === 'archive' ? 'Archive every cloud chat?' : 'Are you absolutely sure?',
                action === 'archive'
                  ? 'Your chat list will be empty until you restore chats from Archived chats.'
                  : 'Your entire AGI Cloud chat history will be deleted.',
                [
                  { text: 'Cancel', style: 'cancel', onPress: () => cancel('second') },
                  {
                    text: action === 'archive' ? 'Yes, archive all' : 'Yes, delete all chats',
                    style: 'destructive',
                    onPress: () => {
                      void run();
                    },
                  },
                ],
                { cancelable: true, onDismiss: () => cancel('second') },
              );
            },
          },
        ],
        { cancelable: true, onDismiss: () => cancel('first') },
      );
    },
    [appMode, bulkScope, cloudUnlocked, loadConversations],
  );

  const handleArchiveAll = useCallback(() => beginBulkChatAction('archive'), [beginBulkChatAction]);
  const handleDeleteAll = useCallback(() => beginBulkChatAction('delete'), [beginBulkChatAction]);

  const bulkBusy = bulkAction !== null;

  const handleDeleteLocalChats = useCallback(() => {
    if (useChatAppModeStore.getState().appMode !== 'local') return;
    const count = countLocalChats();
    if (count === 0) {
      Alert.alert('No local chats', 'There are no chats stored on this device.');
      return;
    }
    Alert.alert(
      'Delete all local chats?',
      'Deletes every chat and its messages stored on this device. Memory, settings, projects and downloaded models stay. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => {
            if (useChatAppModeStore.getState().appMode !== 'local') return;
            deleteAllLocalChats()
              .then((deleted) =>
                Alert.alert(
                  'Chats deleted',
                  `${deleted} ${deleted === 1 ? 'chat' : 'chats'} deleted from this device.`,
                ),
              )
              .catch(() =>
                Alert.alert(
                  'Could not delete chats',
                  'Some chats may still be on this device. Try again.',
                ),
              );
          },
        },
      ],
    );
  }, []);

  return (
    <SettingsScreenShell
      title="Data Controls"
      help={{ docId: 'privacy-controls', label: 'How privacy controls work' }}
    >
      <SettingsInfo
        title="Model training"
        body="AGI doesn’t train its own models on your chats; Free-plan providers may unless you opt out in Privacy settings."
        icon={ShieldCheck}
      />
      <SettingsInfo
        title="Local data"
        body="Chats, memory, settings and model details, exported on this device."
        icon={Database}
      />
      <SettingsGroup>
        <PressableBox
          onPress={handleExport}
          disabled={exporting}
          accessibilityRole="button"
          accessibilityLabel="Export local data"
          style={{
            minHeight: 52,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            opacity: exporting ? 0.6 : 1,
          }}
        >
          <Download size={19} color={colors.textSecondary} />
          <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>
            {exporting ? 'Exporting…' : 'Export Local Data'}
          </Text>
        </PressableBox>
        <SettingsRow
          label="Storage"
          icon={Trash2}
          isLast
          onPress={() =>
            router.push({
              pathname: '/(app)/settings/storage',
              params: { returnTo: '/(app)/settings/data-controls' },
            } as Parameters<typeof router.push>[0])
          }
        />
      </SettingsGroup>

      {appMode === 'local' ? (
        <>
          <SettingsInfo
            title="Local chats"
            body="Deletes chats on this device only. AGI Cloud is untouched."
            icon={History}
          />
          <SettingsGroup>
            <PressableBox
              onPress={handleDeleteLocalChats}
              accessibilityRole="button"
              accessibilityLabel="Delete all local chats"
              testID="delete-all-local-chats-button"
              style={{
                minHeight: 52,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Trash2 size={19} color={colors.agentError} />
              <Text style={{ flex: 1, color: colors.agentError, fontSize: typeScale.body }}>
                Delete all chats
              </Text>
            </PressableBox>
          </SettingsGroup>
        </>
      ) : null}
      <SettingsInfo
        title="Chat history"
        body="These act only on chats stored in AGI Cloud."
        icon={History}
      />
      <SettingsGroup>
        <SettingsRow
          label="Archived chats"
          icon={MessagesSquare}
          onPress={() =>
            router.push('/(app)/settings/archived-chats' as Parameters<typeof router.push>[0])
          }
        />
        <PressableBox
          onPress={handleArchiveAll}
          disabled={bulkBusy}
          accessibilityRole="button"
          accessibilityLabel="Archive all cloud chats"
          testID="archive-all-chats-button"
          style={{
            minHeight: 52,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            opacity: bulkBusy ? 0.6 : 1,
          }}
        >
          <Archive size={19} color={cloudUnlocked ? colors.teal : colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
              {bulkAction === 'archive' ? 'Archiving…' : 'Archive all chats'}
            </Text>
            {!cloudUnlocked ? (
              <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, marginTop: 2 }}>
                Requires AGI Cloud sign-in
              </Text>
            ) : null}
          </View>
        </PressableBox>
        <PressableBox
          onPress={handleDeleteAll}
          disabled={bulkBusy}
          accessibilityRole="button"
          accessibilityLabel="Delete all cloud chats"
          testID="delete-all-chats-button"
          style={{
            minHeight: 52,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: bulkBusy ? 0.6 : 1,
          }}
        >
          <Trash2 size={19} color={cloudUnlocked ? colors.agentError : colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: cloudUnlocked ? colors.agentError : colors.textPrimary,
                fontSize: typeScale.body,
              }}
            >
              {bulkAction === 'delete' ? 'Deleting…' : 'Delete all chats'}
            </Text>
            {!cloudUnlocked ? (
              <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, marginTop: 2 }}>
                Requires AGI Cloud sign-in
              </Text>
            ) : null}
          </View>
        </PressableBox>
      </SettingsGroup>

      {/*
        PERMITTED-SYNC: explicit, user-triggered, one-time sync to cloud.
        This is the ONLY allowed Local↔Cloud data crossing per the founder
        hard rule (2026-06-14). Never automatic, never background.
      */}
      <SettingsInfo
        title="Sync to AGI Cloud"
        body="Copies chat text you select, not temporary chats. Files and memory stay on this device."
        icon={Cloud}
      />
      <SettingsGroup>
        <PressableBox
          onPress={handleSyncToCloud}
          disabled={syncing}
          accessibilityRole="button"
          accessibilityLabel="Sync local chats to AGI Cloud"
          testID="sync-to-cloud-button"
          style={{
            minHeight: 52,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: syncing ? 0.6 : 1,
          }}
        >
          <ArrowUpFromLine size={19} color={cloudUnlocked ? colors.teal : colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
              {syncing ? 'Syncing...' : 'Sync Local Chats to Cloud'}
            </Text>
            {!cloudUnlocked ? (
              <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, marginTop: 2 }}>
                Requires AGI Cloud sign-in
              </Text>
            ) : null}
          </View>
        </PressableBox>
      </SettingsGroup>

      <SettingsInfo
        title="AGI Cloud account"
        body="Deleting your Cloud account doesn’t erase data kept only on this device."
        icon={Cloud}
      />
      <SettingsGroup>
        <SettingsRow
          label="Export Cloud data"
          icon={Download}
          value={cloudUnlocked ? undefined : 'Sign in required'}
          onPress={openCloudAccount}
        />
        <PressableBox
          onPress={openCloudAccount}
          accessibilityRole="button"
          accessibilityLabel={cloudUnlocked ? 'Delete account' : 'Delete account. Sign in required'}
          accessibilityHint="Opens account deletion, which asks you to confirm first"
          testID="delete-account-row"
          style={{
            minHeight: 52,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Trash2 size={19} color={colors.agentError} />
          <Text
            numberOfLines={1}
            style={{ flex: 1, color: colors.agentError, fontSize: typeScale.body }}
          >
            Delete account
          </Text>
          {cloudUnlocked ? null : (
            <Text
              numberOfLines={1}
              style={{ color: colors.textMuted, fontSize: typeScale.footnote, maxWidth: 140 }}
            >
              Sign in required
            </Text>
          )}
          <ChevronRight size={17} color={colors.textMuted} />
        </PressableBox>
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
