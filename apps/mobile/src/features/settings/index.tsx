/**
 * Settings Screen — v3 layout
 *
 * Sections: Mode / Keys / Local AI / Connections / Voice / Preferences / Privacy / About
 * Voice section shows on-device default banner + locked "Never train" toggle.
 */
import { useCallback, useRef } from 'react';
import { View, SectionList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import {
  BarChart3,
  Brain,
  Zap,
  Shield,
  Link2,
  Palette,
  Volume2,
  Bell,
  UserCog,
  Vibrate,
  HelpCircle,
  Lock,
  FileText,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  Mic,
  HardDrive,
  Globe,
  Key,
  type LucideIcon,
} from 'lucide-react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore, type ThemeMode } from '@/stores/settingsStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { getDisplayName } from '@/src/features/model-picker/service';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { useThemeColors } from '@/src/ui/theme';
import { VoiceSelector } from '@/src/features/voice/components/VoiceSelector';
import { FEATURES } from '@/lib/v1FeatureFlags';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingItemType =
  | 'navigation'
  | 'toggle'
  | 'theme'
  | 'version'
  | 'status'
  | 'voice-header'
  | 'cloud-whisper-waitlist';

type BadgeTone = 'active' | 'waitlist' | 'locked' | 'neutral';

interface SettingItem {
  key: string;
  icon: LucideIcon;
  label: string;
  type: SettingItemType;
  description?: string;
  value?: string;
  badge?: string;
  badgeTone?: BadgeTone;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
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
  description,
  value,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  value?: string;
  onPress?: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      className="flex-row items-center justify-between py-3.5 px-4 active:bg-white/5"
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <View className="flex-row items-center gap-3 flex-1 mr-3">
        <Icon size={18} color={c.textSecondary} />
        <View className="flex-1">
          <Text className="text-[15px]" style={{ color: c.textPrimary }} numberOfLines={1}>
            {label}
          </Text>
          {description ? (
            <Text
              className="text-[11px] mt-0.5"
              style={{ color: c.textMuted, lineHeight: 15 }}
              numberOfLines={2}
            >
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="flex-row items-center gap-1.5">
        {value ? (
          <Text className="text-[13px]" style={{ color: c.textMuted }} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        <ChevronRight size={16} color={c.textMuted} />
      </View>
    </Pressable>
  );
}

function badgeColors(tone: BadgeTone, c: ReturnType<typeof useThemeColors>) {
  switch (tone) {
    case 'active':
      return {
        text: c.teal,
        background: `${c.teal}18`,
        border: `${c.teal}30`,
      };
    case 'waitlist':
      return {
        text: c.agentWarning,
        background: `${c.agentWarning}14`,
        border: `${c.agentWarning}2E`,
      };
    case 'locked':
      return {
        text: c.textMuted,
        background: c.surfaceBase,
        border: c.border,
      };
    case 'neutral':
      return {
        text: c.textSecondary,
        background: c.surfaceBase,
        border: c.border,
      };
  }
}

function StatusRow({
  icon: Icon,
  label,
  description,
  badge,
  badgeTone = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  badge?: string;
  badgeTone?: BadgeTone;
}) {
  const c = useThemeColors();
  const badgeStyle = badgeColors(badgeTone, c);

  return (
    <View
      className="flex-row items-center justify-between py-3.5 px-4"
      accessible
      accessibilityRole="text"
      accessibilityLabel={[label, description, badge].filter(Boolean).join('. ')}
      accessibilityState={{ disabled: badgeTone === 'locked' || badgeTone === 'waitlist' }}
    >
      <View className="flex-row items-start gap-3 flex-1 mr-3">
        <Icon size={18} color={badgeTone === 'active' ? c.teal : c.textSecondary} />
        <View className="flex-1">
          <Text className="text-[15px]" style={{ color: c.textPrimary }} numberOfLines={1}>
            {label}
          </Text>
          {description ? (
            <Text
              className="text-[11px] mt-0.5"
              style={{ color: c.textMuted, lineHeight: 15 }}
              numberOfLines={2}
            >
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      {badge ? (
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
            backgroundColor: badgeStyle.background,
            borderWidth: 1,
            borderColor: badgeStyle.border,
          }}
        >
          <Text style={{ fontSize: 10, color: badgeStyle.text, fontWeight: '600' }}>{badge}</Text>
        </View>
      ) : null}
    </View>
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
  const c = useThemeColors();
  return (
    <View
      className="flex-row items-center justify-between py-3.5 px-4"
      accessible
      accessibilityLabel={`${label}, ${value ? 'on' : 'off'}`}
    >
      <View className="flex-row items-center gap-3">
        <Icon size={18} color={c.textSecondary} />
        <Text className="text-[15px]" style={{ color: c.textPrimary }}>
          {label}
        </Text>
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
  const c = useThemeColors();
  return (
    <View className="py-3.5 px-4">
      <View className="flex-row items-center gap-3 mb-3">
        <Palette size={18} color={c.textSecondary} />
        <Text className="text-[15px]" style={{ color: c.textPrimary }}>
          Appearance
        </Text>
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
              <Icon size={16} color={selected ? c.teal : c.textMuted} />
              <Text className="text-xs" style={{ color: selected ? c.teal : c.textSecondary }}>
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
  const c = useThemeColors();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode?.toString() ??
    '1';
  return (
    <View className="items-center py-4">
      <Text className="text-[11px]" style={{ color: c.textMuted }}>
        v{version} Build {buildNumber}
      </Text>
    </View>
  );
}

function VoiceHeaderRow() {
  const c = useThemeColors();
  return (
    <View style={{ marginHorizontal: 16, marginVertical: 8 }}>
      {/* On-device default banner */}
      <View
        style={{
          backgroundColor: `${c.teal}18`,
          borderWidth: 1,
          borderColor: `${c.teal}33`,
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Mic size={14} color={c.teal} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: c.teal }}>
            On-device by default
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: c.textSecondary, lineHeight: 17 }}>
          Voice transcription runs locally on your device. Audio is never sent to training servers.
        </Text>
      </View>

      {/* Locked "Never train" toggle */}
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        accessibilityLabel="Never use voice for training — always on"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Lock size={16} color={c.textSecondary} />
          <View>
            <Text style={{ fontSize: 14, color: c.textPrimary }}>Never use for training</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>Locked — cannot be disabled</Text>
          </View>
        </View>
        <View
          style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            backgroundColor: c.teal,
            justifyContent: 'center',
            alignItems: 'flex-end',
            paddingHorizontal: 3,
            opacity: 0.7,
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: true, disabled: true }}
        >
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' }} />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Cloud Whisper waitlist row — greyed-out, non-interactive
// ---------------------------------------------------------------------------

function CloudWhisperWaitlistRow() {
  const c = useThemeColors();
  const badgeStyle = badgeColors('waitlist', c);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        opacity: 0.45,
      }}
      accessible
      accessibilityLabel="Cloud Whisper — opens after waitlist, not yet available"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Mic size={16} color={c.textSecondary} />
        <View>
          <Text style={{ fontSize: 14, color: c.textPrimary }}>Cloud Whisper</Text>
          <Text style={{ fontSize: 11, color: c.textMuted }}>Opens after waitlist</Text>
        </View>
      </View>
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
          backgroundColor: badgeStyle.background,
          borderWidth: 1,
          borderColor: badgeStyle.border,
        }}
      >
        <Text style={{ fontSize: 10, color: badgeStyle.text, fontWeight: '600' }}>WAITLIST</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Separator between rows (inside a section)
// ---------------------------------------------------------------------------

function RowSeparator() {
  const c = useThemeColors();
  return <View className="h-px ml-[46px] mr-4" style={{ backgroundColor: c.border }} />;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SettingsTabScreen() {
  const router = useRouter();
  const selectedModel = useModelStore((s) => s.selectedModel);
  const voiceSelectorRef = useRef<BottomSheet>(null);
  const { hapticsEnabled, themeMode, setHapticsEnabled, setThemeMode } = useSettingsStore();
  const c = useThemeColors();

  // ---- Handlers ----

  const push = useCallback(
    (path: string) => () => {
      router.push(path as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  // ---- Section data ----

  const sections: SettingSection[] = [
    {
      title: 'Mode',
      data: [
        {
          key: 'local-mode',
          icon: Lock,
          label: 'Local Mode',
          type: 'status',
          description: 'Active. No account or cloud required.',
          badge: 'Active',
          badgeTone: 'active',
        },
        {
          key: 'local-llms',
          icon: Brain,
          label: 'Local LLMs',
          type: 'navigation',
          value: getDisplayName(selectedModel),
          description: 'Runs on-device and works offline.',
          onPress: push('/(app)/models'),
        },
        {
          key: 'cloud-managed',
          icon: Globe,
          label: 'Cloud Managed',
          type: 'status',
          description: 'Waitlist only until billing, quota, and provider-cost controls ship.',
          badge: 'Waitlist',
          badgeTone: 'waitlist',
        },
      ],
    },
    {
      title: 'Keys',
      data: [
        {
          key: 'mobile-byok',
          icon: Key,
          label: 'Mobile BYOK',
          type: 'status',
          description: 'Disabled until secure device key storage ships.',
          badge: 'Locked',
          badgeTone: 'locked',
        },
      ],
    },
    {
      title: 'Local AI',
      data: [
        {
          key: 'capabilities',
          icon: Zap,
          label: 'Capabilities',
          type: 'navigation',
          description: 'Local tools are active. Cloud tools are locked or waitlisted.',
          onPress: push('/(app)/settings/capabilities'),
        },
        {
          key: 'memory',
          icon: Brain,
          label: 'Memory',
          type: 'navigation',
          description: 'Local memory facts and import/export controls.',
          onPress: push('/(app)/settings/memory'),
        },
        {
          key: 'storage',
          icon: HardDrive,
          label: 'Storage',
          type: 'navigation',
          description: 'Downloaded models, local cache, and device data export.',
          onPress: push('/(app)/settings/storage'),
        },
        {
          key: 'performance',
          icon: BarChart3,
          label: 'Performance',
          type: 'navigation',
          description: 'Benchmark the active local model on this device.',
          onPress: push('/(app)/settings/performance'),
        },
        {
          key: 'auto-approve',
          icon: Shield,
          label: 'Auto-Approve',
          type: 'navigation',
          description: 'Approval defaults for local tools.',
          onPress: push('/(app)/settings/auto-approve'),
        },
      ],
    },
    {
      title: 'Connections',
      data: [
        ...(FEATURES.companion
          ? [
              {
                key: 'desktop-pairing',
                icon: Monitor,
                label: 'Desktop Pairing',
                type: 'navigation' as const,
                description: 'Pair a desktop companion for local handoff.',
                onPress: push('/(app)/companion'),
              },
            ]
          : []),
        {
          key: 'connectors',
          icon: Link2,
          label: 'Connectors',
          type: 'status',
          description: 'Cloud OAuth connectors open with Cloud Managed.',
          badge: 'Waitlist',
          badgeTone: 'waitlist',
        },
      ],
    },
    {
      title: 'Voice',
      data: [
        {
          key: 'voice-header',
          icon: Mic,
          label: '',
          type: 'voice-header',
        },
        {
          key: 'voice-language',
          icon: Volume2,
          label: 'Voice & Language',
          type: 'navigation',
          onPress: () => voiceSelectorRef.current?.snapToIndex(0),
        },
        {
          key: 'cloud-whisper',
          icon: Mic,
          label: '',
          type: 'cloud-whisper-waitlist',
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
          key: 'notifications',
          icon: Bell,
          label: 'Notifications',
          type: 'navigation',
          description: 'Local reminders and device notifications.',
          onPress: push('/(app)/settings/notifications'),
        },
        {
          key: 'personalization',
          icon: UserCog,
          label: 'Personalization',
          type: 'navigation',
          description: 'Greeting, tone, and response style preferences.',
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
      title: 'Privacy',
      data: [
        {
          key: 'privacy-policy',
          icon: Lock,
          label: 'Privacy Policy',
          type: 'navigation',
          description: 'Local-first privacy terms for Mobile v1.',
          onPress: () => {
            void openExternalUrl('https://agiworkforce.com/privacy');
          },
        },
        {
          key: 'terms-of-service',
          icon: FileText,
          label: 'Terms of Service',
          type: 'navigation',
          description: 'Product terms and acceptable use.',
          onPress: () => {
            void openExternalUrl('https://agiworkforce.com/terms');
          },
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
          key: 'version',
          icon: HelpCircle,
          label: '',
          type: 'version',
        },
      ],
    },
  ];

  // ---- Render ----

  const renderItem = useCallback(
    ({ item, index, section }: { item: SettingItem; index: number; section: SettingSection }) => {
      const isFirst = index === 0;
      const isLast = index === section.data.length - 1;
      const showSeparator =
        !isLast &&
        item.type !== 'version' &&
        item.type !== 'voice-header' &&
        item.type !== 'cloud-whisper-waitlist';

      const topRadius = isFirst ? 12 : 0;
      const bottomRadius = isLast ? 12 : 0;

      const cardStyle = {
        marginHorizontal: 16,
        backgroundColor: c.surfaceElevated,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopWidth: isFirst ? 1 : 0,
        borderBottomWidth: isLast ? 1 : 0,
        borderColor: c.border,
        borderTopLeftRadius: topRadius,
        borderTopRightRadius: topRadius,
        borderBottomLeftRadius: bottomRadius,
        borderBottomRightRadius: bottomRadius,
        overflow: 'hidden' as const,
      };

      if (item.type === 'version') {
        return (
          <View style={cardStyle}>
            <VersionRow />
          </View>
        );
      }
      if (item.type === 'status') {
        return (
          <View style={cardStyle}>
            <StatusRow
              icon={item.icon}
              label={item.label}
              description={item.description}
              badge={item.badge}
              badgeTone={item.badgeTone}
            />
            {showSeparator && <RowSeparator />}
          </View>
        );
      }
      if (item.type === 'voice-header') {
        return (
          <View style={cardStyle}>
            <VoiceHeaderRow />
          </View>
        );
      }
      if (item.type === 'cloud-whisper-waitlist') {
        return (
          <View style={cardStyle}>
            <CloudWhisperWaitlistRow />
          </View>
        );
      }

      return (
        <View style={cardStyle}>
          {item.type === 'toggle' && item.onToggle ? (
            <ToggleRow
              icon={item.icon}
              label={item.label}
              value={item.toggleValue ?? false}
              onValueChange={item.onToggle}
            />
          ) : item.type === 'theme' ? (
            <ThemeRow currentMode={themeMode} onSelect={setThemeMode} />
          ) : (
            <NavigationRow
              icon={item.icon}
              label={item.label}
              description={item.description}
              value={item.value}
              onPress={item.onPress}
            />
          )}
          {showSeparator && <RowSeparator />}
        </View>
      );
    },
    [themeMode, setThemeMode, c],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SettingSection }) => (
      <View className="pt-6 pb-1.5 px-4">
        <Text
          className="text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: c.textMuted }}
        >
          {section.title}
        </Text>
      </View>
    ),
    [c],
  );

  const renderSectionFooter = useCallback(() => <View style={{ height: 4 }} />, []);

  const keyExtractor = useCallback((item: SettingItem) => item.key, []);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 h-12">
        <Text
          variant="subheading"
          className="text-lg font-semibold"
          style={{ color: c.textPrimary }}
        >
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
        style={{ backgroundColor: c.surfaceBase }}
      />

      <VoiceSelector ref={voiceSelectorRef} />
    </SafeAreaView>
  );
}
