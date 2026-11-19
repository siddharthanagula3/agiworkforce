import { useMemo } from 'react';
import { Platform, View } from 'react-native';
import {
  BarChart3,
  Box,
  Globe,
  HardDrive,
  Languages,
  Map as MapIcon,
  MessageSquareDashed,
  Smartphone,
  SpellCheck,
  Vibrate,
} from 'lucide-react-native';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLocalSettingsStore, type LinkBrowser } from '@/stores/settings/localSettingsStore';
import { useActionMenu } from '@/src/shared/hooks/useActionMenu';
import { ActionMenuSheet } from '@/src/features/conversation-actions/RenameConversationModal';
import { MAP_PROVIDER_LABEL } from '@/src/features/settings/general/MapProviderScreen';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/Common';
import { useModelStore } from '@/src/features/model-picker/store';
import { useTierStore } from '@/src/features/billing/store';
import { getShortDisplayName } from '@/src/features/model-picker/service';
import {
  EffortSlider,
  effortStepsFor,
  resolveEffortStep,
  setDefaultEffort,
  useDefaultEffort,
} from '@/src/features/model-picker/components/EffortSlider';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { getModelReasoning } from '@agiworkforce/types';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { languageFor } from '@agiworkforce/i18n';
import { DEVICE_LANGUAGE_PREFERENCE, useLanguagePreferenceStore } from '@/src/i18n';
import { FEATURES } from '@/lib/v1FeatureFlags';

const LINK_BROWSER_LABEL: Readonly<Record<LinkBrowser, string>> = {
  system: 'Default browser',
  'in-app': 'In-app browser',
};

const LINK_BROWSER_CHOICES: readonly LinkBrowser[] = ['system', 'in-app'];

export default function GeneralSettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation(['settings']);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);
  const setTemporaryChat = useSettingsStore((s) => s.setTemporaryChat);
  const autoCorrectEnabled = useLocalSettingsStore((s) => s.autoCorrectEnabled);
  const setAutoCorrectEnabled = useLocalSettingsStore((s) => s.setAutoCorrectEnabled);
  const linkBrowser = useLocalSettingsStore((s) => s.linkBrowser);
  const setLinkBrowser = useLocalSettingsStore((s) => s.setLinkBrowser);
  const mapProvider = useLocalSettingsStore((s) => s.mapProvider);
  const browserMenu = useActionMenu();
  const chooseLinkBrowser = () =>
    browserMenu.open(
      'Browser',
      LINK_BROWSER_CHOICES.map((browser) => ({
        key: `browser-${browser}`,
        label: LINK_BROWSER_LABEL[browser],
        selected: browser === linkBrowser,
        run: () => setLinkBrowser(browser),
      })),
    );
  const selectedModel = useModelStore((s) => s.selectedModel);
  const subscriptionTier = useTierStore((s) => s.tier);
  const colors = useThemeColors();
  const languagePreference = useLanguagePreferenceStore((s) => s.preference);
  const languageValue =
    languagePreference === DEVICE_LANGUAGE_PREFERENCE
      ? 'Match device'
      : (languageFor(languagePreference)?.nativeName ?? 'Match device');
  const defaultEffort = useDefaultEffort();
  const defaultModelReasoning = useMemo(() => getModelReasoning(selectedModel), [selectedModel]);
  const defaultEffortSteps = useMemo(
    () => effortStepsFor(defaultModelReasoning),
    [defaultModelReasoning],
  );

  return (
    <SettingsScreenShell
      title={t('settings:general')}
      overlay={
        FEATURES.linkBrowser ? (
          <ActionMenuSheet menu={browserMenu.menu} dismissLabel="Dismiss browser choices" />
        ) : null
      }
    >
      <SettingsInfo
        title="Local defaults"
        body="These apply to this device only, not AGI Cloud."
        icon={Smartphone}
      />
      <SettingsGroup>
        {FEATURES.appLanguage ? (
          <SettingsRow
            label="App language"
            icon={Languages}
            value={languageValue}
            onPress={() =>
              router.push('/(app)/settings/app-language' as Parameters<typeof router.push>[0])
            }
          />
        ) : null}
        {FEATURES.linkBrowser ? (
          <SettingsRow
            label="Browser"
            icon={Globe}
            value={LINK_BROWSER_LABEL[linkBrowser]}
            onPress={chooseLinkBrowser}
          />
        ) : null}
        {Platform.OS === 'ios' ? (
          <SettingsRow
            label="Map provider"
            icon={MapIcon}
            value={MAP_PROVIDER_LABEL[mapProvider]}
            onPress={() =>
              router.push('/(app)/settings/map-provider' as Parameters<typeof router.push>[0])
            }
          />
        ) : null}
        <SettingsSwitchRow
          label={t('settings:autoCorrectSpelling')}
          icon={SpellCheck}
          value={autoCorrectEnabled}
          onValueChange={setAutoCorrectEnabled}
          testID="settings.general.auto-correct"
        />
        <SettingsSwitchRow
          label="Haptic Feedback"
          icon={Vibrate}
          value={hapticsEnabled}
          onValueChange={setHapticsEnabled}
        />
        <SettingsSwitchRow
          label="Temporary Chat"
          icon={MessageSquareDashed}
          value={isTemporaryChat}
          onValueChange={setTemporaryChat}
          isLast
        />
      </SettingsGroup>
      {defaultEffortSteps.length > 0 ? (
        <SettingsGroup>
          <View testID="settings.general.default-effort" style={{ padding: 14, gap: 10 }}>
            <Text
              accessibilityRole="header"
              style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
            >
              {t('settings:defaultEffort')}
            </Text>
            <EffortSlider
              testID="settings.general.default-effort.slider"
              steps={defaultEffortSteps}
              value={resolveEffortStep(defaultEffortSteps, defaultEffort, defaultModelReasoning)}
              onChange={setDefaultEffort}
            />
          </View>
        </SettingsGroup>
      ) : null}
      <SettingsGroup>
        {/* The active model belongs to the row that changes it. The Settings
            root used to carry this value on "General", a screen that does not
            own the model at all. */}
        <SettingsRow
          label="Models"
          icon={Box}
          value={getShortDisplayName(selectedModel, subscriptionTier)}
          onPress={() => router.push('/(app)/models' as Parameters<typeof router.push>[0])}
        />
        <SettingsRow
          label="Performance"
          icon={BarChart3}
          onPress={() =>
            router.push('/(app)/settings/performance' as Parameters<typeof router.push>[0])
          }
        />
        <SettingsRow
          label={t('settings:storage')}
          icon={HardDrive}
          isLast
          onPress={() =>
            router.push({
              pathname: '/(app)/settings/storage',
              params: { returnTo: '/(app)/settings/general' },
            } as Parameters<typeof router.push>[0])
          }
        />
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
