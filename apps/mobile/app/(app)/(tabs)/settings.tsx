/**
 * Settings Screen — 5 groups, 18 items
 *
 * Organized per the mobile app spec: Account, AI Configuration,
 * Connections, Preferences, and About.
 */
import { useCallback, useRef } from 'react';
import { View, SectionList, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import {
  User,
  CreditCard,
  BarChart3,
  Brain,
  Zap,
  Shield,
  Smartphone,
  Link2,
  Palette,
  Volume2,
  Bell,
  UserCog,
  Vibrate,
  HelpCircle,
  Lock,
  FileText,
  LogOut,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  type LucideIcon,
} from 'lucide-react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore, type ThemeMode } from '@/stores/settingsStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useModelStore } from '@/stores/modelStore';
import { api } from '@/services/api';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { colors } from '@/lib/theme';
import { VoiceSelector } from '@/components/voice/VoiceSelector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettingItem {
  key: string;
  icon: LucideIcon;
  label: string;
  type: 'navigation' | 'toggle' | 'theme' | 'signout' | 'version';
  value?: string;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  destructive?: boolean;
}

interface SettingSection {
  title: string;
  data: SettingItem[];
}

// ---------------------------------------------------------------------------
// Theme mode labels
// ---------------------------------------------------------------------------

const THEME_LABELS: Record<ThemeMode, string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
};

const THEME_ICONS: Record<ThemeMode, LucideIcon> = {
  dark: Moon,
  light: Sun,
  system: Monitor,
};

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

function NavigationRow({
  icon: Icon,
  label,
  value,
  onPress,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      className="flex-row items-center justify-between py-3.5 px-4 active:bg-white/5"
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <View className="flex-row items-center gap-3">
        <Icon size={18} color={destructive ? colors.agentError : colors.textSecondary} />
        <Text
          className="text-[15px]"
          style={{ color: destructive ? colors.agentError : colors.textPrimary }}
        >
          {label}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        {value ? <Text className="text-[13px] text-white/40">{value}</Text> : null}
        {!destructive && <ChevronRight size={16} color={colors.textMuted} />}
      </View>
    </Pressable>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  value,
  onValueChange,
}: {
  icon: LucideIcon;
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between py-3.5 px-4">
      <View className="flex-row items-center gap-3">
        <Icon size={18} color={colors.textSecondary} />
        <Text className="text-[15px] text-white">{label}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function ThemeRow({
  currentMode,
  onSelect,
}: {
  currentMode: ThemeMode;
  onSelect: (mode: ThemeMode) => void;
}) {
  return (
    <View className="py-3.5 px-4">
      <View className="flex-row items-center gap-3 mb-3">
        <Palette size={18} color={colors.textSecondary} />
        <Text className="text-[15px] text-white">Appearance</Text>
      </View>
      <View className="flex-row gap-2">
        {(['dark', 'light', 'system'] as ThemeMode[]).map((mode) => {
          const Icon = THEME_ICONS[mode];
          const selected = currentMode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => onSelect(mode)}
              className="flex-1 items-center gap-1.5 py-2.5 rounded-lg"
              style={{
                backgroundColor: selected ? 'rgba(33,128,141,0.15)' : 'transparent',
                borderWidth: selected ? 1 : 0,
                borderColor: selected ? 'rgba(33,128,141,0.3)' : 'transparent',
              }}
              accessibilityLabel={THEME_LABELS[mode]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Icon size={16} color={selected ? colors.teal : colors.textMuted} />
              <Text
                className="text-xs"
                style={{ color: selected ? colors.teal : colors.textSecondary }}
              >
                {THEME_LABELS[mode]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function VersionRow() {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode?.toString() ??
    '1';
  return (
    <View className="items-center py-4">
      <Text className="text-[11px] text-white/20">
        v{version} Build {buildNumber}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Separator between rows (inside a section)
// ---------------------------------------------------------------------------

function RowSeparator() {
  return <View className="h-px mx-4" style={{ backgroundColor: colors.border }} />;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SettingsTabScreen() {
  const router = useRouter();
  const { signOut } = useAuthStore();
  const connectionStatus = useConnectionStore((s) => s.status);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const voiceSelectorRef = useRef<BottomSheet>(null);
  const { hapticsEnabled, themeMode, setHapticsEnabled, setThemeMode } = useSettingsStore();

  // ---- Handlers ----

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }, [signOut]);

  const handleManageSubscription = useCallback(async () => {
    try {
      const data = await api.post<{ url: string }>('/api/portal');
      // HIGH-MOB-02 fix: validate `data.url` against the allowlist (see
      // lib/safeOpenURL.ts). MITM/compromised backend cannot redirect to
      // intent://, javascript:, or phishing URLs.
      if (data.url && (await openExternalUrl(data.url))) {
        return;
      }
    } catch {
      // Fall back to static URL
    }
    if (!(await openExternalUrl('https://agiworkforce.com/billing'))) {
      Alert.alert(
        'Error',
        'Could not open subscription management. Please visit agiworkforce.com/billing in your browser.',
      );
    }
  }, []);

  const push = useCallback(
    (path: string) => () => {
      router.push(path as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  // ---- Section data ----

  const sections: SettingSection[] = [
    {
      title: 'Account',
      data: [
        {
          key: 'profile',
          icon: User,
          label: 'Profile',
          type: 'navigation',
          onPress: push('/(app)/profile'),
        },
        {
          key: 'subscription',
          icon: CreditCard,
          label: 'Subscription',
          type: 'navigation',
          onPress: handleManageSubscription,
        },
        {
          key: 'usage',
          icon: BarChart3,
          label: 'Usage',
          type: 'navigation',
          onPress: push('/(app)/usage'),
        },
      ],
    },
    {
      title: 'AI Configuration',
      data: [
        {
          key: 'default-model',
          icon: Brain,
          label: 'Default Model',
          type: 'navigation',
          value: selectedModel,
          onPress: () => {
            router.push('/(app)/(tabs)/chat' as Parameters<typeof router.push>[0]);
          },
        },
        {
          key: 'capabilities',
          icon: Zap,
          label: 'Capabilities',
          type: 'navigation',
          onPress: push('/(app)/settings/capabilities'),
        },
        {
          key: 'auto-approve',
          icon: Shield,
          label: 'Auto-Approve',
          type: 'navigation',
          onPress: push('/(app)/settings/auto-approve'),
        },
      ],
    },
    {
      title: 'Connections',
      data: [
        {
          key: 'desktop-pairing',
          icon: Smartphone,
          label: 'Desktop Pairing',
          type: 'navigation',
          value: connectionStatus === 'connected' ? 'Connected' : undefined,
          onPress: push('/(app)/companion'),
        },
        {
          key: 'connectors',
          icon: Link2,
          label: 'Connectors',
          type: 'navigation',
          onPress: push('/(app)/connectors'),
        },
      ],
    },
    {
      title: 'Preferences',
      data: [
        {
          key: 'appearance',
          icon: Palette,
          label: 'Appearance',
          type: 'theme',
        },
        {
          key: 'voice-language',
          icon: Volume2,
          label: 'Voice & Language',
          type: 'navigation',
          onPress: () => voiceSelectorRef.current?.snapToIndex(0),
        },
        {
          key: 'notifications',
          icon: Bell,
          label: 'Notifications',
          type: 'navigation',
          onPress: push('/(app)/settings/notifications'),
        },
        {
          key: 'personalization',
          icon: UserCog,
          label: 'Personalization',
          type: 'navigation',
          onPress: push('/(app)/settings/personalization'),
        },
        {
          key: 'haptic-feedback',
          icon: Vibrate,
          label: 'Haptic Feedback',
          type: 'toggle',
          toggleValue: hapticsEnabled,
          onToggle: setHapticsEnabled,
        },
      ],
    },
    {
      title: 'About',
      data: [
        {
          key: 'help-faq',
          icon: HelpCircle,
          label: 'Help & FAQ',
          type: 'navigation',
          onPress: () => {
            void openExternalUrl('https://agiworkforce.com/help');
          },
        },
        {
          key: 'privacy-policy',
          icon: Lock,
          label: 'Privacy Policy',
          type: 'navigation',
          onPress: () => {
            void openExternalUrl('https://agiworkforce.com/privacy');
          },
        },
        {
          key: 'terms-of-service',
          icon: FileText,
          label: 'Terms of Service',
          type: 'navigation',
          onPress: () => {
            void openExternalUrl('https://agiworkforce.com/terms');
          },
        },
        {
          key: 'sign-out',
          icon: LogOut,
          label: 'Sign Out',
          type: 'signout',
          destructive: true,
          onPress: handleSignOut,
        },
        {
          key: 'version',
          icon: HelpCircle, // unused but required by type
          label: '',
          type: 'version',
        },
      ],
    },
  ];

  // ---- Render ----

  const renderItem = useCallback(
    ({ item, index, section }: { item: SettingItem; index: number; section: SettingSection }) => {
      const isLast = index === section.data.length - 1;
      const showSeparator = !isLast && item.type !== 'version';

      // Version row
      if (item.type === 'version') {
        return <VersionRow />;
      }

      return (
        <>
          {item.type === 'toggle' && item.onToggle ? (
            <ToggleRow
              icon={item.icon}
              label={item.label}
              value={item.toggleValue ?? false}
              onValueChange={item.onToggle}
            />
          ) : item.type === 'theme' ? (
            <ThemeRow currentMode={themeMode} onSelect={setThemeMode} />
          ) : item.type === 'signout' ? (
            <NavigationRow icon={item.icon} label={item.label} onPress={item.onPress} destructive />
          ) : (
            <NavigationRow
              icon={item.icon}
              label={item.label}
              value={item.value}
              onPress={item.onPress}
            />
          )}
          {showSeparator && <RowSeparator />}
        </>
      );
    },
    [themeMode, setThemeMode],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SettingSection }) => (
      <View className="pt-5 pb-1.5 px-4">
        <Text className="text-[11px] text-white/40 uppercase tracking-wider font-semibold">
          {section.title}
        </Text>
      </View>
    ),
    [],
  );

  const renderSectionFooter = useCallback(() => null, []);

  const keyExtractor = useCallback((item: SettingItem) => item.key, []);

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 h-12">
        <Text variant="subheading" className="text-white text-lg font-semibold">
          Settings
        </Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        renderSectionFooter={renderSectionFooter}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        style={{ backgroundColor: colors.surfaceBase }}
      />

      <VoiceSelector ref={voiceSelectorRef} />
    </SafeAreaView>
  );
}
