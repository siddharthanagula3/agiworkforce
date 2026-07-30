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
            ? 'AGI filters clearly unsafe adult-only requests before Local or Cloud processing on this device.'
            : 'Minor-safe filtering is not required by the age setting currently stored on this device.'
        }
        icon={Baby}
      />
      <SettingsInfo
        title="Device age settings only"
        body="This release does not link parent and teen accounts or provide remote usage, quiet-hour, model, or content controls. Reviewing age changes only this device."
        icon={Shield}
      />
      <SettingsGroup>
        <SettingsRow
          label="Review Device Age Settings"
          icon={Shield}
          isLast
          onPress={() =>
            router.push({
              pathname: '/(public)/age-gate',
              params: { returnTo: '/(app)/settings/parental-controls' },
            } as Parameters<typeof router.push>[0])
          }
        />
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
