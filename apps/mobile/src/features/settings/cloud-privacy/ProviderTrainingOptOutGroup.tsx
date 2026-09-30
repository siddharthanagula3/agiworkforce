import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { EyeOff } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { fetchPreferenceNamespace, patchPreferenceNamespace } from '@/services/preferences';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const PRIVACY_NAMESPACE = 'privacy';
const OPT_OUT_KEY = 'keepOutOfProviderTraining';
const LABEL = 'Only use models that do not train on your chats';

export function ProviderTrainingOptOutGroup() {
  const colors = useThemeColors();
  const [optedOut, setOptedOut] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace(PRIVACY_NAMESPACE)
      .then((settings) => {
        if (!cancelled) {
          setOptedOut((settings as Record<string, unknown>)[OPT_OUT_KEY] === true);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Your model training setting could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (value: boolean) => {
    const previous = optedOut;
    setOptedOut(value);
    setSaving(true);
    setError(null);
    try {
      await patchPreferenceNamespace(PRIVACY_NAMESPACE, { [OPT_OUT_KEY]: value });
    } catch {
      setOptedOut(previous);
      setError('The setting was not saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
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
        Model training
      </Text>
      <SettingsGroup>
        <SettingsSwitchRow
          label={LABEL}
          icon={EyeOff}
          value={optedOut === true}
          onValueChange={(value) => void save(value)}
          disabled={optedOut === null || saving}
          isLast
        />
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
        Your requests go only to models whose providers do not train on what you send. On the Free
        plan this replaces the free models, whose providers’ terms may allow training.
      </Text>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{
            color: colors.agentError,
            fontSize: typeScale.caption,
            lineHeight: 17,
            marginTop: 4,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
