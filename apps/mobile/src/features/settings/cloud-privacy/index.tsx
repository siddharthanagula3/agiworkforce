import { Shield } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { ExternalLink, FileText, EyeOff } from 'lucide-react-native';
import { View } from 'react-native';
import { ChineseHqProviderConsentGroup } from './ChineseHqProviderConsentGroup';

const PRIVACY_ITEMS = [
  {
    key: 'no-training',
    label: 'AGI model training: Always off',
    body: 'AGI does not use customer prompts, responses, or files to train AGI-owned models. There is no training opt-in because this data path does not exist.',
  },
  {
    key: 'telemetry',
    label: 'Telemetry off by default',
    body: 'Analytics are disabled by default. No third-party analytics or crash-reporting SDK (such as Sentry or PostHog) is bundled in the app; any diagnostics stay on your device.',
  },
  {
    key: 'retention',
    label: 'Data retention',
    body: 'Cloud conversations are permanently deleted within 24 hours of an account deletion request. You can export or delete your data at any time.',
  },
] as const;

export default function CloudPrivacyScreen() {
  const colors = useThemeColors();

  return (
    <SettingsScreenShell title="Privacy">
      <SettingsInfo
        title="Cloud privacy controls"
        body="Local conversations never leave your device unless you trigger a manual sync. Cloud sessions are governed by the AGI privacy policy."
        icon={Shield}
      />

      {/* Privacy guarantees */}
      <View style={{ marginBottom: 18, gap: 10 }}>
        {PRIVACY_ITEMS.map((item) => (
          <View
            key={item.key}
            style={{
              borderRadius: 12,
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <EyeOff size={15} color={colors.textSecondary} />
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                {item.label}
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              {item.body}
            </Text>
          </View>
        ))}
      </View>

      <ChineseHqProviderConsentGroup />

      {/* External links */}
      <SettingsGroup>
        <SettingsRow
          label="Privacy Policy"
          icon={FileText}
          onPress={() => void openExternalUrl('https://agiworkforce.com/privacy')}
        />
        <SettingsRow
          label="Terms of Service"
          icon={ExternalLink}
          onPress={() => void openExternalUrl('https://agiworkforce.com/terms')}
          isLast
        />
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
