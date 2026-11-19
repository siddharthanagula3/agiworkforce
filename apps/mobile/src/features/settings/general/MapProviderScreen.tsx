import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import { Check } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { SettingsGroup, SettingsScreenShell } from '@/src/features/settings/Common';
import { useLocalSettingsStore, type MapProvider } from '@/stores/settings/localSettingsStore';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';

export const MAP_PROVIDER_LABEL: Readonly<Record<MapProvider, string>> = {
  apple: 'Apple Maps',
  google: 'Google Maps',
};

const MAP_PROVIDER_CHOICES: readonly MapProvider[] = ['apple', 'google'];

export default function MapProviderScreen() {
  if (Platform.OS !== 'ios') return <Redirect href="/(app)/settings/general" />;
  return <MapProviderPicker />;
}

function MapProviderPicker() {
  const colors = useThemeColors();
  const mapProvider = useLocalSettingsStore((s) => s.mapProvider);
  const setMapProvider = useLocalSettingsStore((s) => s.setMapProvider);

  return (
    <SettingsScreenShell title="Map provider" backHref="/(app)/settings/general">
      <SettingsGroup footnote="Controls which map app opens places from AGI.">
        {MAP_PROVIDER_CHOICES.map((provider, index) => {
          const selected = provider === mapProvider;
          return (
            <Pressable
              key={provider}
              testID={`settings.map-provider.${provider}`}
              onPress={() => setMapProvider(provider)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={MAP_PROVIDER_LABEL[provider]}
              style={{
                minHeight: 52,
                paddingHorizontal: 14,
                paddingVertical: spacing.sm,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                borderBottomWidth: index === MAP_PROVIDER_CHOICES.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>
                {MAP_PROVIDER_LABEL[provider]}
              </Text>
              {selected ? <Check size={18} color={colors.teal} /> : null}
            </Pressable>
          );
        })}
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
