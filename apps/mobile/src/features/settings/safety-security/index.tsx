import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Fingerprint, Shield, Smartphone } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useBiometricFlag } from '@/lib/biometricFlagStore';
import { useThemeColors } from '@/src/ui/theme';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { useRouter } from 'expo-router';

export default function SafetySecurityScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const biometricEnabled = useBiometricFlag((s) => s.enabled);
  const setBiometricEnabled = useBiometricFlag((s) => s.setEnabled);
  const [saving, setSaving] = useState(false);

  const handleBiometric = async (next: boolean) => {
    setSaving(true);
    try {
      await setBiometricEnabled(next);
    } catch {
      Alert.alert('Could not update lock', 'Secure storage is unavailable on this device.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsScreenShell title="Safety & Security">
      <SettingsInfo
        title="Device boundary"
        body="Local chats stay on this device unless you explicitly open an invite-gated Cloud flow."
        icon={Shield}
      />
      <SettingsGroup>
        <View
          style={{
            minHeight: 56,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            opacity: saving ? 0.7 : 1,
          }}
          accessibilityLabel={`Biometric Lock. ${biometricEnabled ? 'On' : 'Off'}`}
        >
          <Fingerprint size={19} color={colors.textSecondary} />
          <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 15 }}>Biometric Lock</Text>
          <Switch value={biometricEnabled} onValueChange={handleBiometric} />
        </View>
        <SettingsRow
          label="Permissions"
          icon={Smartphone}
          isLast
          onPress={() =>
            router.push('/(app)/settings/permissions' as Parameters<typeof router.push>[0])
          }
        />
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
