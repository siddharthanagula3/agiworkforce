import { useEffect, useMemo, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { reloadAppAsync } from 'expo';
import { Check, Languages, Search, Smartphone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/text';
import { SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';
import {
  DEVICE_LANGUAGE_PREFERENCE,
  SUPPORTED_LANGUAGES,
  getDeviceLanguage,
  readStoredLanguagePreference,
  setLanguage,
} from '@/src/i18n';

export default function AppLanguageScreen() {
  const colors = useThemeColors();
  const { t } = useTranslation(['settings', 'common']);
  const [query, setQuery] = useState('');
  const [preference, setPreference] = useState<string>(DEVICE_LANGUAGE_PREFERENCE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void readStoredLanguagePreference().then((stored) => {
      if (active) setPreference(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const filteredLanguages = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return SUPPORTED_LANGUAGES;
    return SUPPORTED_LANGUAGES.filter((language) =>
      [language.name, language.nativeName, language.code].some((value) =>
        value.toLocaleLowerCase().includes(normalized),
      ),
    );
  }, [query]);

  const selectLanguage = async (code: string) => {
    if (saving || code === preference) return;
    setPreference(code);
    setSaving(true);
    let directionChanged = false;
    try {
      const result = await setLanguage(code);
      directionChanged = result?.directionChanged ?? false;
    } finally {
      setSaving(false);
    }
    if (directionChanged) {
      void reloadAppAsync('Apply app language direction').catch(() => {
        Alert.alert(
          'Restart required',
          'Close and reopen AGI Workforce to apply the new layout direction.',
        );
      });
    }
  };

  const deviceCode = getDeviceLanguage();
  const deviceName =
    SUPPORTED_LANGUAGES.find((language) => language.code === deviceCode)?.nativeName ?? deviceCode;

  return (
    <SettingsScreenShell title={t('settings:language')} backHref="/(app)/settings/general">
      <SettingsInfo
        title={t('settings:languageDescription')}
        body="Choose one language for this app on this device. Voice recognition language is managed separately in Voice settings."
        icon={Languages}
      />

      <View
        style={{
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
          paddingHorizontal: 13,
          marginBottom: 16,
        }}
      >
        <Search size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`${t('common:search')} languages`}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search app languages"
          style={{ flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 10 }}
        />
      </View>

      <View
        style={{
          borderRadius: 16,
          backgroundColor: colors.surfaceElevated,
          overflow: 'hidden',
        }}
      >
        {!query.trim() ? (
          <LanguageChoice
            label="Match device"
            description={`${deviceName} on this device`}
            selected={preference === DEVICE_LANGUAGE_PREFERENCE}
            disabled={saving}
            icon={<Smartphone size={20} color={colors.textSecondary} />}
            onPress={() => void selectLanguage(DEVICE_LANGUAGE_PREFERENCE)}
          />
        ) : null}

        {filteredLanguages.map((language, index) => (
          <LanguageChoice
            key={language.code}
            label={language.nativeName}
            description={
              language.name === language.nativeName
                ? language.code.toUpperCase()
                : `${language.name} · ${language.code.toUpperCase()}`
            }
            selected={preference === language.code}
            disabled={saving}
            icon={<Text style={{ fontSize: 21 }}>{language.flag}</Text>}
            isLast={index === filteredLanguages.length - 1}
            onPress={() => void selectLanguage(language.code)}
          />
        ))}

        {filteredLanguages.length === 0 ? (
          <View style={{ paddingHorizontal: 16, paddingVertical: 24 }}>
            <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
              No languages match “{query.trim()}”.
            </Text>
          </View>
        ) : null}
      </View>
    </SettingsScreenShell>
  );
}

function LanguageChoice({
  label,
  description,
  selected,
  disabled,
  icon,
  onPress,
  isLast,
}: {
  label: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  icon: React.ReactNode;
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
      style={({ pressed }) => ({
        minHeight: 66,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.surfaceOverlay : colors.surfaceElevated,
        opacity: disabled ? 0.65 : 1,
      })}
    >
      <View style={{ width: 28, alignItems: 'center' }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{description}</Text>
      </View>
      {selected ? <Check size={19} color={colors.teal} /> : null}
    </Pressable>
  );
}
