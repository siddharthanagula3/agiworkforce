import { useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { Database, Download, Link2, Trash2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { exportAllUserData } from '@/services/dsarExport';
import { useThemeColors } from '@/src/ui/theme';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { useRouter } from 'expo-router';

export default function DataControlsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAllUserData();
    } catch {
      Alert.alert('Export failed', 'AGI could not create the local data export.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <SettingsScreenShell title="Data Controls">
      <SettingsInfo
        title="Local data"
        body="Device-side export runs locally and includes chats, memory, settings, and installed model metadata."
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
            {exporting ? 'Exporting...' : 'Export Local Data'}
          </Text>
        </Pressable>
        <SettingsRow
          label="Shared Links"
          icon={Link2}
          onPress={() =>
            router.push('/(app)/settings/shared-links' as Parameters<typeof router.push>[0])
          }
        />
        <SettingsRow
          label="Storage"
          icon={Trash2}
          isLast
          onPress={() =>
            router.push('/(app)/settings/storage' as Parameters<typeof router.push>[0])
          }
        />
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
