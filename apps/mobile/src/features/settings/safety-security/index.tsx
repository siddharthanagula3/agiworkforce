import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Fingerprint, Shield, Smartphone } from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
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

  const confirmDeviceLock = async (): Promise<boolean> => {
    const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();
    if (enrolledLevel === LocalAuthentication.SecurityLevel.NONE) {
      Alert.alert(
        'Set up a device lock first',
        'Turn on Face ID, Touch ID, or a device passcode in system settings before enabling AGI app lock.',
      );
      return false;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Turn On AGI App Lock',
      fallbackLabel: 'Use Passcode',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      Alert.alert('App lock was not turned on', 'AGI could not confirm your device lock.');
      return false;
    }

    return true;
  };

  const handleBiometric = async (next: boolean) => {
    setSaving(true);
    try {
      if (next) {
        const confirmed = await confirmDeviceLock();
        if (!confirmed) return;
      }
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
          accessibilityLabel={`App Lock. ${biometricEnabled ? 'On' : 'Off'}`}
          accessibilityHint="Require Face ID, Touch ID, or passcode to open AGI"
        >
          <Fingerprint size={19} color={colors.textSecondary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>App Lock</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 }}>
              Require Face ID, Touch ID, or passcode to open AGI.
            </Text>
          </View>
          <Switch value={biometricEnabled} onValueChange={handleBiometric} disabled={saving} />
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
