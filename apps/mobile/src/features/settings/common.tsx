import { useCallback } from 'react';
import type React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ChevronRight, CloudOff, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useTheme, useThemeColors, cardRadius } from '@/src/ui/theme';

export function SettingsScreenShell({
  title,
  children,
  backHref = '/(app)/(tabs)/settings',
}: {
  title: string;
  children: React.ReactNode;
  backHref?: string;
}) {
  const router = useRouter();
  const { colors, statusBarStyle } = useTheme();
  const goBack = useCallback(() => {
    router.navigate(backHref as Parameters<typeof router.navigate>[0]);
  }, [backHref, router]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <StatusBar style={statusBarStyle} />
      <View
        style={{ height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}
      >
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft size={21} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>{title}</Text>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function SettingsGroup({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        borderRadius: cardRadius,
        backgroundColor: colors.surfaceElevated,
        overflow: 'hidden',
        marginBottom: 24,
      }}
    >
      {children}
    </View>
  );
}

export function SettingsInfo({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: string;
  icon?: LucideIcon;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        borderRadius: cardRadius,
        backgroundColor: colors.surfaceElevated,
        padding: 14,
        marginBottom: 24,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        {Icon ? <Icon size={18} color={colors.textSecondary} /> : null}
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>{title}</Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{body}</Text>
    </View>
  );
}

/**
 * Shown on Cloud-only settings screens (Billing, Usage, etc.) when the
 * chat's Local/Cloud egress toggle is set to Local. `guardedFetch`
 * (lib/egressGuard.ts) blocks EVERY our-cloud API call — including this
 * screen's own data fetch — before any network I/O while that toggle is
 * Local, by design (a zero-leak privacy guarantee for chat content). But
 * these settings screens are reached only while already signed in and have
 * nothing to do with chat privacy, so silently showing stale/cached data
 * with no explanation reads as "stuck loading" or "wrong plan" rather than
 * "blocked by an unrelated toggle" — this banner makes that visible and
 * actionable instead of silent.
 */
export function CloudSyncBlockedBanner({ onSwitchToCloud }: { onSwitchToCloud: () => void }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        borderRadius: cardRadius,
        backgroundColor: colors.dangerSurface,
        borderWidth: 1,
        borderColor: colors.dangerBorder,
        padding: 14,
        marginBottom: 24,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <CloudOff size={18} color={colors.agentError} />
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
          Chat is set to Local Mode
        </Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
        This can&apos;t sync with your real plan and usage while chat is in Local Mode. Switch to
        AGI Cloud to see up-to-date info.
      </Text>
      <Pressable
        onPress={onSwitchToCloud}
        accessibilityRole="button"
        accessibilityLabel="Switch to AGI Cloud"
        style={({ pressed }) => ({
          alignSelf: 'flex-start',
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 10,
          backgroundColor: colors.teal,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text style={{ color: colors.white, fontSize: 13, fontWeight: '600' }}>
          Switch to AGI Cloud
        </Text>
      </Pressable>
    </View>
  );
}

export function SettingsRow({
  label,
  icon: Icon,
  value,
  onPress,
  isLast,
}: {
  label: string;
  icon: LucideIcon;
  value?: string;
  onPress?: () => void;
  isLast?: boolean;
}) {
  const colors = useThemeColors();
  const content = (
    <View
      style={{
        minHeight: 52,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <Icon size={19} color={colors.textSecondary} />
      <Text numberOfLines={1} style={{ flex: 1, color: colors.textPrimary, fontSize: 15 }}>
        {label}
      </Text>
      {value ? (
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13, maxWidth: 140 }}>
          {value}
        </Text>
      ) : null}
      {onPress ? <ChevronRight size={17} color={colors.textMuted} /> : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}. ${value}` : label}
    >
      {content}
    </Pressable>
  );
}

export function SettingsSwitchRow({
  label,
  description,
  icon: Icon,
  iconColor,
  value,
  onValueChange,
  disabled,
  isLast,
}: {
  label: string;
  description?: string;
  icon: LucideIcon;
  iconColor?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  isLast?: boolean;
}) {
  const colors = useThemeColors();
  const resolvedIconColor = iconColor ?? colors.textSecondary;

  return (
    <View
      style={{
        minHeight: description ? 76 : 56,
        paddingHorizontal: 14,
        paddingVertical: description ? 12 : 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
        opacity: disabled ? 0.7 : 1,
      }}
      accessibilityLabel={`${label}. ${value ? 'On' : 'Off'}`}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.neutralSurface,
        }}
      >
        <Icon size={18} color={resolvedIconColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}
        >
          {label}
        </Text>
        {description ? (
          <Text
            numberOfLines={2}
            style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }}
          >
            {description}
          </Text>
        ) : null}
      </View>
      <View style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          accessibilityLabel={`${label}. ${value ? 'On' : 'Off'}`}
          accessibilityHint={description}
        />
      </View>
    </View>
  );
}
