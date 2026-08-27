import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Globe } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/common';
import {
  CHINESE_HQ_PROVIDER_IDS,
  chineseHqProviderDisplayName,
  readChineseHqConsent,
  setChineseHqProviderConsent,
  type ChineseHqConsentMap,
  type ChineseHqProviderId,
} from '@/services/providerConsent';

export const PROVIDER_CONSENT_TEST_ID_PREFIX = 'settings-provider-consent-';

const SECTION_TITLE = 'China-headquartered providers';
const SECTION_BODY =
  'Routing your conversations through these providers is off until you turn it on. Turning one off again stops their models from serving your next message.';

export function ChineseHqProviderConsentGroup() {
  const colors = useThemeColors();
  const [consent, setConsent] = useState<ChineseHqConsentMap>(readChineseHqConsent);

  const toggle = useCallback((providerId: ChineseHqProviderId, accepted: boolean) => {
    setChineseHqProviderConsent(providerId, accepted);
    setConsent(readChineseHqConsent());
  }, []);

  return (
    <View testID="settings-provider-consent-section" style={{ marginBottom: 18 }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 6 }}
      >
        {SECTION_TITLE}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 10 }}>
        {SECTION_BODY}
      </Text>
      <SettingsGroup>
        {CHINESE_HQ_PROVIDER_IDS.map((providerId, index) => (
          <SettingsSwitchRow
            key={providerId}
            testID={`${PROVIDER_CONSENT_TEST_ID_PREFIX}${providerId}`}
            label={chineseHqProviderDisplayName(providerId)}
            icon={Globe}
            value={consent[providerId]}
            onValueChange={(next) => toggle(providerId, next)}
            isLast={index === CHINESE_HQ_PROVIDER_IDS.length - 1}
          />
        ))}
      </SettingsGroup>
    </View>
  );
}
