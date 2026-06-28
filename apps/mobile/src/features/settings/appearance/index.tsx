import { Pressable, View } from 'react-native';
import { Check, Monitor, Moon, Sun } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import type { ThemeMode } from '@/stores/settingsStore';
import { useThemeColors } from '@/src/ui/theme';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';

const OPTIONS: Array<{ mode: ThemeMode; label: string; description: string; icon: typeof Sun }> = [
  { mode: 'system', label: 'System', description: 'Match this device.', icon: Monitor },
  { mode: 'light', label: 'Light', description: 'Bright neutral interface.', icon: Sun },
  { mode: 'dark', label: 'Dark', description: 'Dark neutral interface.', icon: Moon },
];

export default function AppearanceScreen() {
  const colors = useThemeColors();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';

  const localThemeMode = useLocalSettingsStore((s) => s.themeMode);
  const localSetThemeMode = useLocalSettingsStore((s) => s.setThemeMode);
  const cloudThemeMode = useCloudSettingsStore((s) => s.themeMode);
  const cloudSetThemeMode = useCloudSettingsStore((s) => s.setThemeMode);

  const themeMode = isCloud ? cloudThemeMode : localThemeMode;
  const setThemeMode = isCloud ? cloudSetThemeMode : localSetThemeMode;

  return (
    <SettingsScreenShell title="Appearance">
      <SettingsInfo
        title="Theme"
        body="AGI follows your system appearance by default. Light and dark modes use the same neutral mobile palette."
        icon={Monitor}
      />
      <SettingsGroup>
        {OPTIONS.map(({ mode, label, description, icon: Icon }, index) => {
          const selected = themeMode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => setThemeMode(mode)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Set appearance to ${label}`}
              style={{
                minHeight: 60,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderBottomWidth: index === OPTIONS.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <Icon size={19} color={selected ? colors.teal : colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>
                  {label}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  {description}
                </Text>
              </View>
              {selected ? <Check size={18} color={colors.teal} /> : null}
            </Pressable>
          );
        })}
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
