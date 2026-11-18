import {
  CircleHelp,
  Clock,
  ExternalLink,
  EyeOff,
  FileText,
  MessageCircle,
  Shield,
  ShieldCheck,
  Sparkles,
  UserKey,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { cardRadius, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { SettingsGroup, SettingsRow, SettingsScreenShell } from '@/src/features/settings/Common';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { openWebContentPage } from '@/src/platform/webContentPage';
import { CLOUD_CHAT_RETENTION } from './ChatPrivacyScreen';
import { CloudProviderSharingGroup } from './CloudProviderSharingGroup';
import { PrivacyApproachCards } from './PrivacyApproachCards';
import { PrivacyArticleCards } from './PrivacyArticleCards';
import { PrivacyCenterSection } from './PrivacyCenterSection';
import { PrivacyCloudControls } from './PrivacyCloudControls';
import { openOrAlert } from './privacyCenterLinks';

const PRIVACY_ITEMS = [
  {
    key: 'no-training',
    label: 'Model training',
    body: 'AGI doesn’t train its own models on your chats; Free-plan providers may unless you opt out in AGI Cloud.',
    icon: ShieldCheck,
  },
  {
    key: 'telemetry',
    label: 'Telemetry off by default',
    body: 'Product analytics stay off until you allow them and never include your messages.',
    icon: EyeOff,
  },
  {
    key: 'retention',
    label: 'Data retention',
    body: CLOUD_CHAT_RETENTION,
    icon: Clock,
    cloudOnly: true,
  },
] as const;

const LOCAL_PRIVACY_ITEMS = PRIVACY_ITEMS.filter((item) => !('cloudOnly' in item));

export default function CloudPrivacyScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const openPage = (path: string) => () => void openOrAlert(() => openWebContentPage(path));

  return (
    <SettingsScreenShell title="Privacy">
      <View style={{ alignItems: 'center', gap: 10, marginBottom: 24, paddingHorizontal: 8 }}>
        <Shield size={32} color={colors.textSecondary} />
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: typeScale.body,
            lineHeight: 21,
            textAlign: 'center',
          }}
        >
          Clear answers about privacy, and the controls for it.
        </Text>
      </View>

      <PrivacyCenterSection title="Explore your options">
        <SettingsGroup>
          <SettingsRow
            label="Personalization"
            icon={Sparkles}
            onPress={() =>
              router.push('/(app)/settings/personalization' as Parameters<typeof router.push>[0])
            }
          />
          <SettingsRow
            label="Chat privacy"
            icon={MessageCircle}
            onPress={() =>
              router.push('/(app)/settings/chat-privacy' as Parameters<typeof router.push>[0])
            }
          />
          <SettingsRow
            label="Data use & access"
            icon={UserKey}
            onPress={() =>
              router.push('/(app)/settings/data-use' as Parameters<typeof router.push>[0])
            }
            isLast
          />
        </SettingsGroup>
      </PrivacyCenterSection>

      <View
        style={{
          borderRadius: cardRadius,
          backgroundColor: colors.surfaceElevated,
          padding: 14,
          marginBottom: 24,
          gap: 6,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Shield size={18} color={colors.textSecondary} />
          <Text
            accessibilityRole="header"
            style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '700' }}
          >
            Data privacy
          </Text>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 19 }}>
          Local chats stay on this device unless you sync them. Read the{' '}
          <Text
            accessibilityRole="link"
            onPress={openPage('/privacy')}
            style={{
              color: colors.textPrimary,
              fontSize: typeScale.footnote,
              textDecorationLine: 'underline',
            }}
          >
            Privacy Policy
          </Text>{' '}
          for how AGI Cloud handles your data.
        </Text>
      </View>

      <PrivacyApproachCards items={isCloud ? PRIVACY_ITEMS : LOCAL_PRIVACY_ITEMS} />

      <CloudProviderSharingGroup />

      <PrivacyCloudControls />

      <PrivacyArticleCards />

      <PrivacyCenterSection title="Helpful resources">
        <SettingsGroup>
          <SettingsRow label="Privacy Policy" icon={FileText} onPress={openPage('/privacy')} />
          <SettingsRow
            label="Data rights requests"
            icon={Shield}
            onPress={openPage('/privacy/requests')}
          />
          <SettingsRow label="Terms of Service" icon={ExternalLink} onPress={openPage('/terms')} />
          <SettingsRow label="Help Center" icon={CircleHelp} onPress={openPage('/help')} isLast />
        </SettingsGroup>
      </PrivacyCenterSection>
    </SettingsScreenShell>
  );
}
