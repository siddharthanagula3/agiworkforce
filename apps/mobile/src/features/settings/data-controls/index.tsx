import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
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
            setSyncing(true);
            syncLocalConversationsToCloud()
              .then((result) => {
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
    (action: BulkChatAction) => {
      setBulkAction(action);
      const request = action === 'archive' ? archiveAllConversations() : deleteAllConversations();
      request
        .then(async (affectedCount) => {
          await loadConversations();
          const noun = affectedCount === 1 ? 'chat' : 'chats';
          Alert.alert(
            action === 'archive' ? 'Chats archived' : 'Chats deleted',
            action === 'archive'
              ? `${affectedCount} ${noun} moved to Archived chats.`
              : `${affectedCount} ${noun} deleted.`,
          );
        })
        .catch(() => {
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
                  onPress: () => runBulkChatAction('archive'),
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
    Alert.alert(
      'Delete all chats?',
      'Every chat in AGI Cloud, including archived ones, and all of their messages will be permanently deleted. This cannot be undone.',
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
                  onPress: () => runBulkChatAction('delete'),
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
        title="Model training is always off"
        body="AGI does not use customer prompts, responses, or files to train AGI-owned models. This is a product policy, not an optional setting."
        icon={ShieldCheck}
      />
      <SettingsInfo
        title="Local data"
        body="Export runs on this device and includes chats, memory, settings, and installed model details."
        icon={Database}
      />
      <SettingsGroup>
        <Pressable
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
          <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 15 }}>
            {exporting ? 'Exporting…' : 'Export Local Data'}
          </Text>
        </Pressable>
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

      {/*
        Chat history acts on AGI Cloud conversations only. The server already
        validates all three bulk actions
        (apps/web/app/api/chat/conversations/bulk/route.ts); Mobile previously
        posted only `delete_archived`, so archive-all and delete-all were
        unreachable here despite working on web.
      */}
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
        <Pressable
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
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
              {bulkAction === 'archive' ? 'Archiving…' : 'Archive all chats'}
            </Text>
            {!cloudUnlocked ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                Requires AGI Cloud sign-in
              </Text>
            ) : null}
          </View>
        </Pressable>
        <Pressable
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
                fontSize: 15,
              }}
            >
              {bulkAction === 'delete' ? 'Deleting…' : 'Delete all chats'}
            </Text>
            {!cloudUnlocked ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                Requires AGI Cloud sign-in
              </Text>
            ) : null}
          </View>
        </Pressable>
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
        <Pressable
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
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
              {syncing ? 'Syncing...' : 'Sync Local Chats to Cloud'}
            </Text>
            {!cloudUnlocked ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                Requires AGI Cloud sign-in
              </Text>
            ) : null}
          </View>
        </Pressable>
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
