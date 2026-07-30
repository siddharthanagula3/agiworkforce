import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import {
  ArrowUpFromLine,
  Cloud,
  Database,
  Download,
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

export default function DataControlsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);

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

  /**
   * PERMITTED-SYNC: the ONLY allowed Local→Cloud data crossing.
   * Requires explicit user confirmation via a two-step alert before any data
   * leaves the device. This is a one-time, manual, additive operation —
   * never automatic, never background.
   */
  const handleSyncToCloud = () => {
    if (!cloudUnlocked) {
      Alert.alert('AGI Cloud required', 'Sign in to AGI Cloud to sync local chats to the cloud.');
      return;
    }

    Alert.alert(
      'Sync Local Chats to AGI Cloud?',
      'This will copy your local conversation titles and message text to AGI Cloud. File attachments and memory facts stay on this device. This action is one-time and manual — AGI never syncs automatically.',
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
        PERMITTED-SYNC: explicit, user-triggered, one-time sync to cloud.
        This is the ONLY allowed Local↔Cloud data crossing per the founder
        hard rule (2026-06-14). Never automatic, never background.
      */}
      <SettingsInfo
        title="Sync to AGI Cloud"
        body="Manually copy your local chats to AGI Cloud once. File attachments and memory stay on this device. AGI never syncs automatically — this is always your choice."
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
