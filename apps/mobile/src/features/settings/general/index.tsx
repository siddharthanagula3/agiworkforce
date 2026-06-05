import { View } from 'react-native';
import { BarChart3, Box, MessageSquareDashed, Smartphone, Vibrate } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors } from '@/src/ui/theme';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { useRouter } from 'expo-router';

function ToggleRow({
  label,
  value,
  onValueChange,
  isLast,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  isLast?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        minHeight: 52,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
      accessibilityLabel={`${label}. ${value ? 'On' : 'Off'}`}
    >
      <Vibrate size={19} color={colors.textSecondary} />
      <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 15 }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

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
        body="These controls affect this device. Cloud sync remains invite-gated."
        icon={Smartphone}
      />
      <SettingsGroup>
        <ToggleRow
          label="Haptic Feedback"
          value={hapticsEnabled}
          onValueChange={setHapticsEnabled}
        />
        <ToggleRow
          label="Temporary Chat"
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
          icon={MessageSquareDashed}
          isLast
          onPress={() =>
            router.push('/(app)/settings/storage' as Parameters<typeof router.push>[0])
          }
        />
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
