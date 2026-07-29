import {
  BarChart3,
  Box,
  HardDrive,
  MessageSquareDashed,
  Smartphone,
  Vibrate,
} from 'lucide-react-native';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/common';
import { useRouter } from 'expo-router';

export default function GeneralSettingsScreen() {
  const router = useRouter();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);
  const setTemporaryChat = useSettingsStore((s) => s.setTemporaryChat);

  return (
    <SettingsScreenShell title="General">
      <SettingsInfo
        title="Local defaults"
        body="These controls affect this device only. AGI Cloud settings are managed separately."
        icon={Smartphone}
      />
      <SettingsGroup>
        <SettingsSwitchRow
          label="Haptic Feedback"
          icon={Vibrate}
          value={hapticsEnabled}
          onValueChange={setHapticsEnabled}
        />
        <SettingsSwitchRow
          label="Temporary Chat"
          icon={MessageSquareDashed}
          value={isTemporaryChat}
          onValueChange={setTemporaryChat}
          isLast
        />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow
          label="Models"
          icon={Box}
          onPress={() => router.push('/(app)/models' as Parameters<typeof router.push>[0])}
        />
        <SettingsRow
          label="Performance"
          icon={BarChart3}
          onPress={() =>
            router.push('/(app)/settings/performance' as Parameters<typeof router.push>[0])
          }
        />
        <SettingsRow
          label="Storage"
          icon={HardDrive}
          isLast
          onPress={() =>
            router.push({
              pathname: '/(app)/settings/storage',
              params: { returnTo: '/(app)/settings/general' },
            } as Parameters<typeof router.push>[0])
          }
        />
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
