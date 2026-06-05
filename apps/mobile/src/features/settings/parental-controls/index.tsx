import { Baby, Shield } from 'lucide-react-native';
import { isMinorMode } from '@/src/features/auth/services/ageGate';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { useRouter } from 'expo-router';

export default function ParentalControlsScreen() {
  const router = useRouter();
  const minorMode = isMinorMode();

  return (
    <SettingsScreenShell title="Parental Controls">
      <SettingsInfo
        title={minorMode ? 'Minor-safe mode is active' : 'Adult profile'}
        body={
          minorMode
            ? 'AGI filters clearly unsafe adult-only requests on this device.'
            : 'This device is not currently in minor-safe mode. Age review can be repeated from the age gate.'
        }
        icon={Baby}
      />
      <SettingsGroup>
        <SettingsRow
          label="Review Age Settings"
          icon={Shield}
          isLast
          onPress={() => router.push('/(public)/age-gate' as Parameters<typeof router.push>[0])}
        />
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
