import { Pressable, View } from 'react-native';
import { Check, Palette } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import type { AccentColor } from '@/stores/settingsStore';
import { getAccentSwatch, useTheme } from '@/src/ui/theme';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';

const ACCENTS: Array<{ value: AccentColor; label: string }> = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'violet', label: 'Violet' },
  { value: 'rose', label: 'Rose' },
  { value: 'amber', label: 'Amber' },
];

export default function AccentColorScreen() {
  const { colors, isDark } = useTheme();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';

  const localAccentColor = useLocalSettingsStore((s) => s.accentColor);
  const localSetAccentColor = useLocalSettingsStore((s) => s.setAccentColor);
  const cloudAccentColor = useCloudSettingsStore((s) => s.accentColor);
  const cloudSetAccentColor = useCloudSettingsStore((s) => s.setAccentColor);

  const accentColor = isCloud ? cloudAccentColor : localAccentColor;
  const setAccentColor = isCloud ? cloudSetAccentColor : localSetAccentColor;

  return (
    <SettingsScreenShell title="Accent Color">
      <SettingsInfo
        title="Accent"
        body="Accent color affects selected controls and highlights. Neutral keeps the AGI default."
        icon={Palette}
      />
      <SettingsGroup>
        {ACCENTS.map((accent, index) => {
          const selected = accentColor === accent.value;
          return (
            <Pressable
              key={accent.value}
              onPress={() => setAccentColor(accent.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Set accent color to ${accent.label}`}
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
                  backgroundColor: getAccentSwatch(accent.value, isDark),
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
