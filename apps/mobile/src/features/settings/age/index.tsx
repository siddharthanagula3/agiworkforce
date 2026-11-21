import { Cake } from 'lucide-react-native';
import { ACCOUNT_AGE_REQUIREMENT_NOTICE } from '@agiworkforce/types';
import { ageGateStatus, getAgeThreshold } from '@/src/features/auth/services/ageGate';
import { SettingsInfo, SettingsScreenShell } from '@/src/features/settings/Common';
import { AGE_SETTING_LABEL, ageSettingValue } from '@/src/features/settings/ageSettingValue';

export default function AgeSettingsScreen() {
  const value = ageSettingValue(ageGateStatus(), getAgeThreshold());

  return (
    <SettingsScreenShell title={AGE_SETTING_LABEL}>
      <SettingsInfo
        testID="age-setting-summary"
        title={value}
        body={`${ACCOUNT_AGE_REQUIREMENT_NOTICE} AGI keeps only whether you meet the age, not your age. Erasing AGI’s data on this device in Storage clears it.`}
        icon={Cake}
      />
    </SettingsScreenShell>
  );
}
