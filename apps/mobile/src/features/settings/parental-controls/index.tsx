import { Baby, Lock, Shield } from 'lucide-react-native';
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
        body="Age settings apply only to this device; parent accounts can’t be linked."
        icon={Shield}
      />
      {minorMode ? (
        <SettingsInfo
          testID="parental-controls-minor-lock"
          title="Minor-safe mode cannot be turned off here"
          body="An adult can lift it only by reinstalling AGI, which erases its data."
          icon={Lock}
        />
      ) : (
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
      )}
    </SettingsScreenShell>
  );
}
