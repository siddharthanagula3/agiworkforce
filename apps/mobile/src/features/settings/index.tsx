import { useCallback, useMemo } from 'react';
import { Alert, View, ScrollView } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useUser } from '@clerk/expo';
import {
  Archive,
  Baby,
  Bell,
  Brain,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Database,
  Info,
  Link2,
  LogOut,
  MessageCircleWarning,
  Mic,
  Palette,
  Shield,
  Share2,
  SlidersHorizontal,
  Sparkles,
  SunMoon,
  UserRound,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/src/features/auth/store';
import { useModelStore } from '@/src/features/model-picker/store';
import { useTierStore } from '@/src/features/billing/store';
import { canUseBillingPlanCapability, getBillingPlanPricing } from '@agiworkforce/types';
import { getShortDisplayName } from '@/src/features/model-picker/service';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { useThemeColors, cardRadius } from '@/src/ui/theme';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

type RowTone = 'default' | 'cloud' | 'danger';

interface SettingsRow {
  key: string;
  label: string;
  icon: LucideIcon;
  value?: string;
  tag?: string;
  tone?: RowTone;
  onPress: () => void;
}

interface SettingsSection {
  title?: string;
  rows: SettingsRow[];
}

function tagStyle(tag: string, colors: ReturnType<typeof useThemeColors>) {
  if (tag === 'Sign in' || tag === 'Cloud') {
    return {
      color: colors.agentWarning,
      backgroundColor: `${colors.agentWarning}14`,
      borderColor: `${colors.agentWarning}2D`,
    };
  }
  return {
    color: colors.textMuted,
    backgroundColor: colors.surfaceBase,
    borderColor: colors.border,
  };
}

function SectionCard({ section }: { section: SettingsSection }) {
  const colors = useThemeColors();
  return (
    <View style={{ marginBottom: 24 }}>
      {section.title ? (
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 13,
            fontWeight: '600',
            marginBottom: 8,
            paddingHorizontal: 2,
          }}
        >
          {section.title}
        </Text>
      ) : null}
      <View
        style={{
          borderRadius: cardRadius,
          backgroundColor: colors.surfaceElevated,
          overflow: 'hidden',
        }}
      >
        {section.rows.map((row, index) => (
          <SettingsListRow key={row.key} row={row} isLast={index === section.rows.length - 1} />
        ))}
      </View>
    </View>
  );
}

function SettingsListRow({ row, isLast }: { row: SettingsRow; isLast: boolean }) {
  const colors = useThemeColors();
  const Icon = row.icon;
  const tint =
    row.tone === 'danger'
      ? colors.agentError
      : row.tone === 'cloud'
        ? colors.agentWarning
        : colors.textSecondary;
  const badge = row.tag ? tagStyle(row.tag, colors) : null;

  return (
    <Pressable
      onPress={row.onPress}
      accessibilityRole="button"
      accessibilityLabel={[row.label, row.value, row.tag].filter(Boolean).join('. ')}
      style={{
        minHeight: 50,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <Icon size={19} color={tint} strokeWidth={1.8} />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          color: row.tone === 'danger' ? colors.agentError : colors.textPrimary,
          fontSize: 15,
        }}
      >
        {row.label}
      </Text>
      {row.value ? (
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13, maxWidth: 130 }}>
          {row.value}
        </Text>
      ) : null}
      {badge ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: badge.borderColor,
            backgroundColor: badge.backgroundColor,
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 2,
          }}
        >
          <Text style={{ color: badge.color, fontSize: 10, fontWeight: '700' }}>{row.tag}</Text>
        </View>
      ) : null}
      <ChevronRight size={17} color={colors.textMuted} />
    </Pressable>
  );
}

function ProfileHeader({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  const { user: clerkUser } = useUser();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const isCloudMode = appMode === 'cloud';
  const localPersonalization = useLocalSettingsStore((s) => s.personalization);
  const cloudPersonalization = useCloudSettingsStore((s) => s.personalization);
  const personalization = isCloudMode ? cloudPersonalization : localPersonalization;
  const displayName = isCloudMode
    ? personalization.nickname ||
      personalization.fullName ||
      clerkUser?.fullName ||
      clerkUser?.firstName ||
      clerkUser?.username ||
      clerkUser?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
      'AGI Cloud'
    : personalization.nickname || personalization.fullName || 'Local profile';
  const subtitle = isCloudMode
    ? clerkUser?.primaryEmailAddress?.emailAddress ||
      (cloudUnlocked ? 'Cloud access unlocked' : 'Sign in required')
    : personalization.occupation || 'Local mode active';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Edit profile"
      style={{
        minHeight: 72,
        borderRadius: cardRadius,
        backgroundColor: colors.surfaceElevated,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 24,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: colors.surfaceHover,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>
          {initial}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}
        >
          {displayName}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      <UserRound size={20} color={colors.textMuted} />
    </Pressable>
  );
}

function formatTheme(mode: string) {
  return mode === 'system' ? 'System' : mode === 'light' ? 'Light' : 'Dark';
}

function formatAccent(accent: string) {
  return accent.charAt(0).toUpperCase() + accent.slice(1);
}

export default function SettingsTabScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const isCloud = appMode === 'cloud';
  const localThemeMode = useLocalSettingsStore((s) => s.themeMode);
  const cloudThemeMode = useCloudSettingsStore((s) => s.themeMode);
  const themeMode = isCloud ? cloudThemeMode : localThemeMode;
  const localAccentColor = useLocalSettingsStore((s) => s.accentColor);
  const cloudAccentColor = useCloudSettingsStore((s) => s.accentColor);
  const accentColor = isCloud ? cloudAccentColor : localAccentColor;
  const selectedModel = useModelStore((s) => s.selectedModel);
  const subscriptionTier = useTierStore((s) => s.tier);
  const billingTier = useTierStore((s) => s.billingTier);
  const { user: clerkUser } = useUser();
  const signOut = useAuthStore((s) => s.signOut);
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const canManageWorkspace =
    isClerkSignedIn && canUseBillingPlanCapability(subscriptionTier, 'team_admin');

  const push = useCallback(
    (path: string) => () => router.push(path as Parameters<typeof router.push>[0]),
    [router],
  );
  const closeSettings = useCallback(() => {
    router.replace('/(app)/(tabs)/chat' as Parameters<typeof router.replace>[0]);
  }, [router]);

  // Every account-backed Cloud row shares one auth boundary. During Clerk's
  // short pending window taps are ignored; once resolved, signed-out users go
  // to login and signed-in users reach the requested real screen.
  const openCloudRoute = useCallback(
    (path: string) => () => {
      if (!isClerkLoaded) return;
      if (!isClerkSignedIn) {
        router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
        return;
      }
      router.push(path as Parameters<typeof router.push>[0]);
    },
    [isClerkLoaded, isClerkSignedIn, router],
  );

  const handleSignOut = useCallback(() => {
    Alert.alert('Log Out', 'Log out of AGI Cloud on this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }, [signOut]);

  const cloudAccessTag = !isClerkLoaded ? 'Checking' : isClerkSignedIn ? 'Cloud' : 'Sign in';
  const accountValue = !isClerkLoaded ? 'Checking…' : isClerkSignedIn ? undefined : 'Sign in';

  const sections = useMemo<SettingsSection[]>(
    () => [
      {
        title: 'Account',
        rows: [
          {
            key: 'account-email',
            label: 'Email',
            icon: UserRound,
            value:
              clerkUser?.primaryEmailAddress?.emailAddress ??
              (isClerkLoaded ? (isClerkSignedIn ? 'Signed in' : 'Sign in') : 'Checking…'),
            onPress: openCloudRoute('/(app)/settings/cloud-account'),
          },
          {
            key: 'account-security',
            label: 'Account Security',
            icon: Shield,
            tag: cloudAccessTag,
            tone: 'cloud',
            onPress: openCloudRoute('/(app)/settings/account-security'),
          },
          {
            key: 'account-subscription',
            label: 'Subscription',
            icon: CreditCard,
            value: accountValue ?? getBillingPlanPricing(billingTier).label,
            onPress: openCloudRoute('/(app)/settings/cloud-billing'),
          },
          {
            key: 'account-shared-links',
            label: 'Shared Links',
            icon: Share2,
            tag: cloudAccessTag,
            tone: 'cloud',
            onPress: openCloudRoute('/(app)/settings/shared-links'),
          },
          ...(canManageWorkspace
            ? [
                {
                  key: 'workspace-admin',
                  label: 'Workspace administration',
                  icon: UserRound,
                  value: 'Web',
                  onPress: () => void openExternalUrl('https://agiworkforce.com/settings/team'),
                },
              ]
            : []),
        ],
      },
      {
        title: 'Device',
        rows: [
          {
            key: 'appearance',
            label: 'Appearance',
            icon: SunMoon,
            value: formatTheme(themeMode),
            onPress: push('/(app)/settings/appearance'),
          },
          {
            key: 'accent-color',
            label: 'Accent Color',
            icon: Palette,
            value: formatAccent(accentColor),
            onPress: push('/(app)/settings/accent-color'),
          },
          {
            key: 'general',
            label: 'General',
            icon: SlidersHorizontal,
            value: getShortDisplayName(selectedModel, subscriptionTier),
            onPress: push('/(app)/settings/general'),
          },
          {
            key: 'notifications',
            label: 'Notifications',
            icon: Bell,
            onPress: push('/(app)/settings/notifications'),
          },
          ...(FEATURES.connectors
            ? [
                {
                  key: 'device-integrations',
                  label: 'Device Integrations',
                  icon: CalendarDays,
                  onPress: push('/(app)/settings/integrations'),
                },
              ]
            : []),
          {
            key: 'voice',
            label: 'Voice',
            icon: Mic,
            onPress: push('/(app)/settings/voice'),
          },
          {
            key: 'safety-security',
            label: 'Safety & Security',
            icon: Shield,
            onPress: push('/(app)/settings/safety-security'),
          },
          {
            key: 'parental-controls',
            label: 'Parental Controls',
            icon: Baby,
            onPress: push('/(app)/settings/parental-controls'),
          },
        ],
      },
      {
        title: 'Local Mode',
        rows: [
          {
            key: 'personalization',
            label: 'Personalization',
            icon: Sparkles,
            onPress: push('/(app)/settings/personalization?scope=local'),
          },
          {
            key: 'memory',
            label: 'Memory',
            icon: Brain,
            onPress: push('/(app)/settings/memory?scope=local'),
          },
          {
            key: 'capabilities',
            label: 'Capabilities',
            icon: Zap,
            onPress: push('/(app)/settings/capabilities'),
          },
          {
            key: 'data-controls',
            label: 'Data Controls',
            icon: Database,
            onPress: push('/(app)/settings/data-controls'),
          },
        ],
      },
      {
        title: 'Cloud',
        rows: [
          // Account is promoted to the root "Account" section (email + subscription
          // + restore with live values), so the duplicate Cloud → Account row is
          // removed (ponytail: one entry point to the account screen).
          {
            key: 'cloud-personalization',
            label: 'Cloud Personalization',
            icon: Sparkles,
            tag: cloudAccessTag,
            tone: 'cloud',
            onPress: openCloudRoute('/(app)/settings/personalization?scope=cloud'),
          },
          {
            key: 'cloud-memory',
            label: 'Cloud Memory',
            icon: Brain,
            tag: cloudAccessTag,
            tone: 'cloud',
            onPress: openCloudRoute('/(app)/settings/memory?scope=cloud'),
          },
          {
            key: 'reflect',
            label: 'Reflect',
            icon: Sparkles,
            tag: cloudAccessTag,
            tone: 'cloud',
            onPress: openCloudRoute('/(app)/settings/reflect'),
          },
          {
            key: 'archived-chats',
            label: 'Archived Chats',
            icon: Archive,
            tag: cloudAccessTag,
            tone: 'cloud',
            onPress: openCloudRoute('/(app)/settings/archived-chats'),
          },
          {
            key: 'cloud-data-controls',
            label: 'Cloud Data Controls',
            icon: Database,
            tag: cloudAccessTag,
            tone: 'cloud',
            onPress: openCloudRoute('/(app)/settings/data-controls'),
          },
          {
            key: 'privacy',
            label: 'Privacy',
            icon: Shield,
            tag: cloudAccessTag,
            tone: 'cloud',
            onPress: openCloudRoute('/(app)/settings/cloud-privacy'),
          },
          {
            key: 'billing',
            label: 'Billing',
            icon: CreditCard,
            tag: cloudAccessTag,
            tone: 'cloud',
            onPress: openCloudRoute('/(app)/settings/cloud-billing'),
          },
          {
            key: 'usage',
            label: 'Usage',
            icon: Database,
            tag: cloudAccessTag,
            tone: 'cloud',
            onPress: openCloudRoute('/(app)/settings/cloud-usage'),
          },
          {
            key: 'connectors',
            label: 'Connectors',
            icon: Link2,
            tag: cloudAccessTag,
            tone: 'cloud',
            onPress: openCloudRoute('/(app)/settings/cloud-connectors'),
          },
          // Plugins remains unshipped on Mobile, so no dead-end settings row is
          // rendered. Skills now has a supported top-level Cloud catalog in the
          // drawer and is intentionally not duplicated as a settings control.
          ...(clerkUser
            ? [
                {
                  key: 'logout',
                  label: 'Log Out',
                  icon: LogOut,
                  tone: 'danger' as const,
                  onPress: handleSignOut,
                },
              ]
            : []),
        ],
      },
      {
        title: 'Support',
        rows: [
          {
            key: 'report',
            label: 'Report App Issue',
            icon: MessageCircleWarning,
            onPress: () =>
              router.push({
                pathname: '/(app)/feedback',
                params: { returnTo: '/(app)/(tabs)/settings' },
              } as Parameters<typeof router.push>[0]),
          },
          {
            key: 'help',
            label: 'Help Center',
            icon: CircleHelp,
            onPress: () => {
              void openExternalUrl('https://agiworkforce.com/help');
            },
          },
          {
            key: 'about',
            label: 'About',
            icon: Info,
            value: `v${appVersion}`,
            onPress: push('/(app)/about'),
          },
        ],
      },
    ],
    [
      accentColor,
      accountValue,
      appVersion,
      cloudAccessTag,
      canManageWorkspace,
      handleSignOut,
      isClerkLoaded,
      isClerkSignedIn,
      openCloudRoute,
      push,
      router,
      selectedModel,
      subscriptionTier,
      themeMode,
      billingTier,
      clerkUser,
    ],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: Math.max(24, insets.top / 2),
          paddingBottom: 36,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            minHeight: 42,
            marginBottom: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: 28,
              lineHeight: 34,
              fontWeight: '700',
              flex: 1,
            }}
          >
            Settings
          </Text>
          <Pressable
            onPress={closeSettings}
            accessibilityRole="button"
            accessibilityLabel="Close settings"
            hitSlop={10}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.surfaceHover : colors.surfaceElevated,
            })}
          >
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ProfileHeader onPress={push('/(app)/profile')} />

        {sections.map((section, index) => (
          <SectionCard key={section.title ?? `section-${index}`} section={section} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
