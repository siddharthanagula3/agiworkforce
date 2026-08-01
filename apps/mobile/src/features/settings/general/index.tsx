import {
  BarChart3,
  Box,
  HardDrive,
  Languages,
  MessageSquareDashed,
  Smartphone,
  Vibrate,
} from 'lucide-react-native';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/common';
import { useModelStore } from '@/src/features/model-picker/store';
import { useTierStore } from '@/src/features/billing/store';
import { getShortDisplayName } from '@/src/features/model-picker/service';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { languageFor } from '@agiworkforce/i18n';
import '@/src/i18n';

export default function GeneralSettingsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation(['settings']);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);
  const setTemporaryChat = useSettingsStore((s) => s.setTemporaryChat);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const subscriptionTier = useTierStore((s) => s.tier);
  const activeLanguage =
    languageFor((i18n.resolvedLanguage ?? i18n.language).split('-')[0])?.nativeName ?? 'English';

  return (
    <SettingsScreenShell title={t('settings:general')}>
      <SettingsInfo
        title="Local defaults"
        body="These controls affect this device only. AGI Cloud settings are managed separately."
        icon={Smartphone}
      />
      <SettingsGroup>
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
      <SettingsGroup>
        <SettingsRow
          label={t('settings:language')}
          icon={Languages}
          value={activeLanguage}
          onPress={() =>
            router.push('/(app)/settings/app-language' as Parameters<typeof router.push>[0])
          }
        />
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
