import { Shield } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/Common';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { ExternalLink, FileText, EyeOff } from 'lucide-react-native';
import { View } from 'react-native';
import { ChineseHqProviderConsentGroup } from './ChineseHqProviderConsentGroup';
import { ProductAnalyticsConsentGroup } from './ProductAnalyticsConsentGroup';
import { ProviderTrainingOptOutGroup } from './ProviderTrainingOptOutGroup';
import { UsOnlyRoutingGroup } from './UsOnlyRoutingGroup';

const PRIVACY_ITEMS = [
  {
    key: 'no-training',
    label: 'Model training',
    body: 'AGI doesn’t train its own models on your chats; Free-plan providers may unless you opt out below.',
  },
  {
    key: 'telemetry',
    label: 'Telemetry off by default',
    body: 'Product analytics stay off until you allow them and never include your messages.',
  },
  {
    key: 'retention',
    label: 'Data retention',
    body: 'Deleted and temporary chats are erased for good after 30 days.',
  },
] as const;

const PROCESSING_LOCATIONS = [
  {
    feature: 'Chat in Local Mode',
    where: 'On this device, unless you sync your chats to AGI Cloud.',
  },
  {
    feature: 'Chat in AGI Cloud',
    where: 'AGI Cloud, then the AI provider that serves the model you chose.',
  },
  {
    feature: 'Files you attach in AGI Cloud',
    where: 'Stored by AGI Cloud in Cloudflare R2 and sent with your message to the model provider.',
  },
  {
    feature: 'Memory',
    where: 'On this device in Local Mode. In AGI Cloud it is stored in your account.',
  },
  {
    feature: 'Web search and Deep Research',
    where: 'Your search queries go from AGI Cloud to Perplexity’s search service.',
  },
  {
    feature: 'Image and video generation',
    where: 'Your prompt goes to the provider of the image or video model.',
  },
  {
    feature: 'Dictation',
    where: 'Speech recognition runs on this device.',
  },
  {
    feature: 'Voice mode',
    where:
      'AGI Cloud sets up the call, then your audio streams directly between this device and OpenAI.',
  },
  {
    feature: 'Read aloud, text scanning and translation',
    where: 'On this device.',
  },
] as const;

export default function CloudPrivacyScreen() {
  const colors = useThemeColors();

  return (
    <SettingsScreenShell title="Privacy">
      <SettingsInfo
        title="Cloud privacy controls"
        body="Local chats stay on this device unless you sync them."
        icon={Shield}
      />

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
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.subhead,
                  fontWeight: '600',
                }}
              >
                {item.label}
              </Text>
            </View>
            <Text
              style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 18 }}
            >
              {item.body}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ marginBottom: 18 }}>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.textMuted,
            fontSize: typeScale.caption,
            fontWeight: '700',
            textTransform: 'uppercase',
            marginBottom: 8,
            paddingHorizontal: 2,
          }}
        >
          Where each feature processes your data
        </Text>
        <SettingsGroup>
          {PROCESSING_LOCATIONS.map((entry, index) => (
            <View
              key={entry.feature}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                gap: 3,
                borderBottomWidth: index === PROCESSING_LOCATIONS.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.subhead,
                  fontWeight: '600',
                }}
              >
                {entry.feature}
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.footnote,
                  lineHeight: 18,
                }}
              >
                {entry.where}
              </Text>
            </View>
          ))}
        </SettingsGroup>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: typeScale.caption,
            lineHeight: 17,
            marginTop: 8,
            paddingHorizontal: 2,
          }}
        >
          AGI Cloud runs in the US; every provider is listed at agiworkforce.com/subprocessors.
        </Text>
      </View>

      <ProviderTrainingOptOutGroup />

      <UsOnlyRoutingGroup />

      <ChineseHqProviderConsentGroup />

      <ProductAnalyticsConsentGroup />

      <SettingsGroup>
        <SettingsRow
          label="Privacy Policy"
          icon={FileText}
          onPress={() => void openExternalUrl('https://agiworkforce.com/privacy')}
        />
        <SettingsRow
          label="Data rights requests"
          icon={Shield}
          onPress={() => void openExternalUrl('https://agiworkforce.com/privacy/requests')}
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
