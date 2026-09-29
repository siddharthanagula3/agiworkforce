import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import {
  Archive,
  ArrowUpFromLine,
  Cloud,
  Database,
  Download,
  History,
  MessagesSquare,
  ShieldCheck,
  Trash2,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { exportAllUserData } from '@/services/dsarExport';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { buildLocalDataExportSnapshot } from './localDataSnapshot';
import { syncLocalConversationsToCloud } from './localCloudSyncService';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { useRouter } from 'expo-router';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { archiveAllConversations, deleteAllConversations } from '@/src/features/archived-chats';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

type BulkChatAction = 'archive' | 'delete';

export default function DataControlsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkChatAction | null>(null);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const loadConversations = useChatMessageStore((s) => s.loadConversations);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAllUserData(undefined, buildLocalDataExportSnapshot());
    } catch {
      Alert.alert('Export failed', 'AGI could not create the local data export.');
    } finally {
      setExporting(false);
    }
  };

  const handleSyncToCloud = () => {
    if (!cloudUnlocked) {
      Alert.alert('AGI Cloud required', 'Sign in to AGI Cloud to sync local chats to the cloud.');
      return;
    }

    Alert.alert(
      'Sync Local Chats to AGI Cloud?',
      'This will copy your local conversation titles and message text to AGI Cloud. File attachments and memory facts stay on this device. This action is one-time and manual, AGI never syncs automatically.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sync to Cloud',
          style: 'default',
          onPress: () => {
            const account = captureCloudAccountEpoch();
            if (!account) {
              Alert.alert('AGI Cloud required', 'Sign in to AGI Cloud before syncing local chats.');
              return;
            }
            setSyncing(true);
            syncLocalConversationsToCloud()
              .then((result) => {
                if (!isCloudAccountEpochCurrent(account)) return;
                if (result.errors.length > 0) {
                  Alert.alert(
                    'Sync completed with errors',
                    `${result.conversationsSynced} chats synced, ${result.errors.length} failed.\n\n${result.errors.slice(0, 3).join('\n')}`,
                  );
                } else {
                  Alert.alert(
                    'Sync complete',
                    `${result.conversationsSynced} chats and ${result.messagesSynced} messages copied to AGI Cloud.`,
                  );
                }
              })
              .catch(() => {
                if (!isCloudAccountEpochCurrent(account)) return;
                Alert.alert('Sync failed', 'Could not reach AGI Cloud. Check your connection.');
              })
              .finally(() => setSyncing(false));
          },
        },
      ],
    );
  };

  const requireCloudChats = useCallback((): boolean => {
    if (!cloudUnlocked) {
      Alert.alert(
        'AGI Cloud required',
        'Sign in to AGI Cloud to archive or delete your cloud chat history.',
      );
      return false;
    }
    if (appMode !== 'cloud') {
      Alert.alert(
        'Chat is set to Local Mode',
        'Archive all and Delete all act on chats stored in AGI Cloud. Switch chat to AGI Cloud to manage them, chats that only exist on this device are wiped from Settings → Storage.',
      );
      return false;
    }
    return true;
  }, [appMode, cloudUnlocked]);

  const runBulkChatAction = useCallback(
    (action: BulkChatAction, account: CloudAccountEpoch) => {
      if (
        !isCloudAccountEpochCurrent(account) ||
        useChatAppModeStore.getState().appMode !== 'cloud'
      )
        return;
      setBulkAction(action);
      const request = action === 'archive' ? archiveAllConversations() : deleteAllConversations();
      request
        .then(async (affectedCount) => {
          if (!isCloudAccountEpochCurrent(account)) return;
          await loadConversations();
          if (!isCloudAccountEpochCurrent(account)) return;
          const noun = affectedCount === 1 ? 'chat' : 'chats';
          Alert.alert(
            action === 'archive' ? 'Chats archived' : 'Chats deleted',
            action === 'archive'
              ? `${affectedCount} ${noun} moved to Archived chats.`
              : `${affectedCount} ${noun} deleted.`,
          );
        })
        .catch(() => {
          if (!isCloudAccountEpochCurrent(account)) return;
          Alert.alert(
            action === 'archive' ? 'Could not archive chats' : 'Could not delete chats',
            'AGI could not reach your AGI Cloud chat history. Check your connection and try again.',
          );
        })
        .finally(() => setBulkAction(null));
    },
    [loadConversations],
  );

  const handleArchiveAll = useCallback(() => {
    if (!requireCloudChats()) return;
    const account = captureCloudAccountEpoch();
    if (!account) return;
    Alert.alert(
      'Archive all chats?',
      'Every chat in AGI Cloud moves into Archived chats. Nothing is deleted, and you can restore any of them later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive all',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Archive every cloud chat?',
              'Your chat list will be empty until you restore chats from Archived chats.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, archive all',
                  style: 'destructive',
                  onPress: () => runBulkChatAction('archive', account),
                },
              ],
            );
          },
        },
      ],
    );
  }, [requireCloudChats, runBulkChatAction]);

  const handleDeleteAll = useCallback(() => {
    if (!requireCloudChats()) return;
    const account = captureCloudAccountEpoch();
    if (!account) return;
    Alert.alert(
      'Delete all chats?',
      'Every chat in AGI Cloud, including archived ones, and all of their messages are removed from every device on this account. You can restore them from Recently deleted in Settings on the web for 30 days.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Your entire AGI Cloud chat history will be deleted. Export your data first if you want a copy.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete all chats',
                  style: 'destructive',
                  onPress: () => runBulkChatAction('delete', account),
                },
              ],
            );
          },
        },
      ],
    );
  }, [requireCloudChats, runBulkChatAction]);

  const bulkBusy = bulkAction !== null;

  return (
    <SettingsScreenShell title="Data Controls">
      <SettingsInfo
        title="Model training"
        body="AGI does not use your prompts, responses or files to train AGI-owned models. On the Free plan, requests are served by providers’ free models, and those providers’ terms may allow them to train on what you send, unless you turn on Only use models that do not train on your chats in Privacy settings."
        icon={ShieldCheck}
      />
      <SettingsInfo
        title="Local data"
        body="Export runs on this device and includes chats, memory, settings, and installed model details."
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

      <SettingsInfo
        title="Chat history"
        body="These act on chats stored in AGI Cloud. Chats that only exist on this device are never sent to AGI and are wiped from Settings → Storage."
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
        body="Manually copy your local chats to AGI Cloud once. File attachments and memory stay on this device. AGI never syncs automatically, this is always your choice."
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
        body="Export your Cloud data or request account deletion from your account settings. Deleting your Cloud account does not erase data kept only on this device."
        icon={Cloud}
      />
      <SettingsGroup>
        <SettingsRow
          label="Export Cloud data"
          icon={Download}
          value={cloudUnlocked ? undefined : 'Sign in required'}
          onPress={() => router.push('/(app)/settings/cloud-account')}
        />
        <SettingsRow
          label="Delete account"
          icon={Trash2}
          value={cloudUnlocked ? undefined : 'Sign in required'}
          onPress={() => router.push('/(app)/settings/cloud-account')}
          isLast
        />
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
