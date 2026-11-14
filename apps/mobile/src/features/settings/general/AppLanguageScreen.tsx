import { useState } from 'react';
import { Alert, View } from 'react-native';
import { reloadAppAsync } from 'expo';
import { Check, Languages, Smartphone } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/Common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  DEVICE_LANGUAGE_PREFERENCE,
  SELECTABLE_LANGUAGES,
  getDeviceLanguage,
  setLanguage,
  useLanguagePreferenceStore,
} from '@/src/i18n';
import { languageFor } from '@agiworkforce/i18n';

export default function AppLanguageScreen() {
  const colors = useThemeColors();
  const preference = useLanguagePreferenceStore((s) => s.preference);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const deviceCode = getDeviceLanguage();
  const deviceName = languageFor(deviceCode)?.nativeName ?? deviceCode;

  const select = async (code: string) => {
    if (saving || code === preference) return;
    setSaving(true);
    setFailed(false);
    try {
      const result = await setLanguage(code);
      if (result?.directionChanged) {
        void reloadAppAsync('Apply app language direction').catch(() => {
          Alert.alert(
            'Restart required',
            'Close and reopen the app to apply the new layout direction.',
          );
        });
      }
    } catch (err) {
      console.warn('[AppLanguage] language change failed:', err);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsScreenShell title="App language" backHref="/(app)/settings/general">
      <SettingsInfo
        title="Language of the app"
        body="For menus and messages. Voice language is set in Voice."
        icon={Languages}
      />
      <SettingsGroup>
        <LanguageChoice
          label="Match device"
          description={`${deviceName} on this device`}
          selected={preference === DEVICE_LANGUAGE_PREFERENCE}
          disabled={saving}
          icon={Smartphone}
          onPress={() => void select(DEVICE_LANGUAGE_PREFERENCE)}
        />
        {SELECTABLE_LANGUAGES.map((language, index) => (
          <LanguageChoice
            key={language.code}
            label={language.nativeName}
            description={language.name}
            selected={preference === language.code}
            disabled={saving}
            isLast={index === SELECTABLE_LANGUAGES.length - 1}
            onPress={() => void select(language.code)}
          />
        ))}
      </SettingsGroup>
      {failed ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.agentError, fontSize: typeScale.caption }}
        >
          Could not change the language. Try again.
        </Text>
      ) : null}
    </SettingsScreenShell>
  );
}

function LanguageChoice({
  label,
  description,
  selected,
  disabled,
  icon: Icon,
  onPress,
  isLast,
}: {
  label: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  icon?: typeof Smartphone;
  onPress: () => void;
  isLast?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${label}. ${description}`}
      style={{
        minHeight: 60,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
        opacity: disabled ? 0.65 : 1,
      }}
    >
      {Icon ? <Icon size={19} color={colors.textSecondary} /> : null}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
          {label}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 16 }}>
          {description}
        </Text>
      </View>
      {selected ? <Check size={18} color={colors.teal} /> : null}
    </Pressable>
  );
}
