import { Pressable, View } from 'react-native';
import { Check, Palette } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useSettingsStore, type AccentColor } from '@/stores/settingsStore';
import { useThemeColors } from '@/src/ui/theme';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';

const ACCENTS: Array<{ value: AccentColor; label: string; swatch: string }> = [
  { value: 'neutral', label: 'Neutral', swatch: '#111111' },
  { value: 'green', label: 'Green', swatch: '#10a37f' },
  { value: 'blue', label: 'Blue', swatch: '#2563eb' },
  { value: 'violet', label: 'Violet', swatch: '#7c3aed' },
  { value: 'rose', label: 'Rose', swatch: '#e11d48' },
  { value: 'amber', label: 'Amber', swatch: '#d97706' },
];

export default function AccentColorScreen() {
  const colors = useThemeColors();
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);

  return (
    <SettingsScreenShell title="Accent Color">
      <SettingsInfo
        title="Accent"
        body="Accent color affects selected controls and highlights. Neutral keeps the ChatGPT-style default."
        icon={Palette}
      />
      <SettingsGroup>
        {ACCENTS.map((accent, index) => {
          const selected = accentColor === accent.value;
          return (
            <Pressable
              key={accent.value}
              onPress={() => setAccentColor(accent.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={accent.label}
              style={{
                minHeight: 54,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderBottomWidth: index === ACCENTS.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: accent.swatch,
                  borderWidth: accent.value === 'neutral' ? 1 : 0,
                  borderColor: colors.border,
                }}
              />
              <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 15 }}>
                {accent.label}
              </Text>
              {selected ? <Check size={18} color={colors.teal} /> : null}
            </Pressable>
          );
        })}
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
