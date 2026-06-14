import { useState } from 'react';
import { Alert } from 'react-native';
import { Fingerprint, Shield, Smartphone } from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useBiometricFlag } from '@/lib/biometricFlagStore';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/common';
import { useRouter } from 'expo-router';

export default function SafetySecurityScreen() {
  const router = useRouter();
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
        body="Local chats stay on this device unless you choose AGI Cloud."
        icon={Shield}
      />
      <SettingsGroup>
        <SettingsSwitchRow
          label="App Lock"
          description="Require Face ID, Touch ID, or passcode to open AGI."
          icon={Fingerprint}
          value={biometricEnabled}
          onValueChange={handleBiometric}
          disabled={saving}
        />
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
