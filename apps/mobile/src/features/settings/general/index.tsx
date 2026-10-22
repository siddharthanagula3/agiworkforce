import { useMemo } from 'react';
import { View } from 'react-native';
import {
  BarChart3,
  Box,
  HardDrive,
  MessageSquareDashed,
  Smartphone,
  SpellCheck,
  Vibrate,
} from 'lucide-react-native';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
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
import {
  EffortSlider,
  effortStepsFor,
  resolveEffortStep,
  setDefaultEffort,
  useDefaultEffort,
} from '@/src/features/model-picker/components/EffortSlider';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { getModelReasoning } from '@agiworkforce/types';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import '@/src/i18n';

export default function GeneralSettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation(['settings']);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);
  const setTemporaryChat = useSettingsStore((s) => s.setTemporaryChat);
  const autoCorrectEnabled = useLocalSettingsStore((s) => s.autoCorrectEnabled);
  const setAutoCorrectEnabled = useLocalSettingsStore((s) => s.setAutoCorrectEnabled);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const subscriptionTier = useTierStore((s) => s.tier);
  const colors = useThemeColors();
  const defaultEffort = useDefaultEffort();
  const defaultModelReasoning = useMemo(() => getModelReasoning(selectedModel), [selectedModel]);
  const defaultEffortSteps = useMemo(
    () => effortStepsFor(defaultModelReasoning),
    [defaultModelReasoning],
  );

  return (
    <SettingsScreenShell title={t('settings:general')}>
      <SettingsInfo
        title="Local defaults"
        body="These controls affect this device only. AGI Cloud settings are managed separately."
        icon={Smartphone}
      />
      <SettingsGroup>
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
