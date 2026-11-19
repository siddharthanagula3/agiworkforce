import { Download, Shield } from 'lucide-react-native';
import { Platform, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useAuthStore } from '@/src/features/auth/store';
import { SettingsGroup, SettingsRow, SettingsScreenShell } from '@/src/features/settings/Common';
import { useLocalDataExport } from '@/src/features/settings/data-controls/useLocalDataExport';
import { useOpenCloudRoute } from '@/src/features/settings/useOpenCloudRoute';
import { openWebContentPage } from '@/src/platform/webContentPage';
import { PRIVACY_CENTER_ROUTE } from './ChatPrivacyScreen';
import { PrivacyCenterSection } from './PrivacyCenterSection';
import { openOrAlert } from './privacyCenterLinks';

interface ProcessingLocation {
  feature: string;
  where: string;
  iosOnly?: boolean;
}

const PROCESSING_LOCATIONS: readonly ProcessingLocation[] = [
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
    feature: 'Calendar in AGI Cloud chats',
    where:
      'When a chat reads your calendar, the events it reads, with their titles, times, places and notes, go to AGI Cloud and the model provider.',
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
    feature: 'Ask from Siri',
    where:
      'Siri passes your question to AGI Cloud, then the AI provider of the model that answers. The answer is saved as a chat.',
    iosOnly: true,
  },
  {
    feature: 'Read aloud',
    where:
      'In AGI Cloud, the answer’s text goes from AGI Cloud to OpenAI’s speech service. In Local Mode, this device’s voice reads it.',
  },
  {
    feature: 'Text scanning and translation',
    where: 'On this device.',
  },
];

export default function DataUseScreen() {
  const colors = useThemeColors();
  const openCloudRoute = useOpenCloudRoute();
  const { exporting, handleExport } = useLocalDataExport();
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const locations = PROCESSING_LOCATIONS.filter((entry) => !entry.iosOnly || Platform.OS === 'ios');

  return (
    <SettingsScreenShell title="Data use & access" backHref={PRIVACY_CENTER_ROUTE}>
      <PrivacyCenterSection title="Your data">
        <SettingsGroup>
          <PressableBox
            onPress={handleExport}
            disabled={exporting}
            accessibilityRole="button"
            accessibilityLabel={exporting ? 'Exporting local data' : 'Export local data'}
            accessibilityState={{ disabled: exporting, busy: exporting }}
            testID="data-use-export-local"
            style={{
              minHeight: 52,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              opacity: exporting ? 0.6 : 1,
            }}
          >
            <Download size={19} color={colors.textSecondary} />
            <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>
              {exporting ? 'Exporting…' : 'Export local data'}
            </Text>
          </PressableBox>
          <SettingsRow
            label="Export Cloud data"
            icon={Download}
            value={isClerkLoaded && !isClerkSignedIn ? 'Sign in' : undefined}
            onPress={openCloudRoute('/(app)/settings/cloud-account')}
          />
          <SettingsRow
            label="Submit a privacy request"
            icon={Shield}
            onPress={() => void openOrAlert(() => openWebContentPage('/privacy/requests'))}
            isLast
          />
        </SettingsGroup>
      </PrivacyCenterSection>

      <PrivacyCenterSection title="Where each feature processes your data">
        <SettingsGroup>
          {locations.map((entry, index) => (
            <View
              key={entry.feature}
              accessible
              accessibilityLabel={`${entry.feature}. ${entry.where}`}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                gap: 3,
                borderBottomWidth: index === locations.length - 1 ? 0 : 1,
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
      </PrivacyCenterSection>
    </SettingsScreenShell>
  );
}
