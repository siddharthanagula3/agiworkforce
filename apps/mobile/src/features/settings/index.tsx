import { useCallback, useMemo, useState } from 'react';
import { Alert, View, ScrollView } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { useUser } from '@clerk/expo';
import { normalizeDisplayName } from '@agiworkforce/utils/display-name';
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
  Pencil,
  Shield,
  Share2,
  SlidersHorizontal,
  Sparkles,
  SunMoon,
  UserRound,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/src/features/auth/store';
import { useTierStore } from '@/src/features/billing/store';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { UserAvatar } from '@/src/shared/components/UserAvatar';
import { openInAppBrowser } from '@/lib/safeOpenURL';
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
      {/* A hard 130pt cut most real email addresses off mid-domain. Let the value
          take the space the label does not need, and cap font scaling so the row
          still fits at accessibility sizes. */}
      {row.value ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={{ color: colors.textMuted, fontSize: 13, flexShrink: 1, textAlign: 'right' }}
        >
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
      {/* A danger row is terminal — Log Out raises a confirm Alert, it does not
          push a screen. A chevron there advertises navigation that never
          happens, so it is suppressed for the whole tone. */}
      {row.tone === 'danger' ? null : <ChevronRight size={17} color={colors.textMuted} />}
    </Pressable>
  );
}

const PROFILE_AVATAR_SIZE = 88;
const PROFILE_PHOTO_BADGE_SIZE = 30;
const PROFILE_CARD_PADDING_TOP = 20;

function ProfileHeader({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  const { user: clerkUser } = useUser();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const isCloudMode = appMode === 'cloud';
  const localPersonalization = useLocalSettingsStore((s) => s.personalization);
  const cloudPersonalization = useCloudSettingsStore((s) => s.personalization);
  const personalization = isCloudMode ? cloudPersonalization : localPersonalization;
  const [savingPhoto, setSavingPhoto] = useState(false);
  const providerName =
    clerkUser?.fullName ||
    clerkUser?.firstName ||
    clerkUser?.username ||
    clerkUser?.primaryEmailAddress?.emailAddress?.split('@')[0];
  const displayName = isCloudMode
    ? personalization.nickname ||
      personalization.fullName ||
      (providerName ? normalizeDisplayName(providerName) : undefined) ||
      'AGI Cloud'
    : personalization.nickname || personalization.fullName || 'Local profile';
  const subtitle = isCloudMode
    ? clerkUser?.primaryEmailAddress?.emailAddress ||
      (cloudUnlocked ? 'Cloud access unlocked' : 'Sign in required')
    : personalization.occupation || 'Local mode active';
  const canEditPhoto = isCloudMode && isClerkSignedIn && Boolean(clerkUser);

  const handleEditPhoto = useCallback(async () => {
    if (!clerkUser || savingPhoto) return;
    setSavingPhoto(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.85,
        base64: true,
        exif: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.base64) {
        Alert.alert('Photo unavailable', 'That image could not be read. Pick another photo.');
        return;
      }
      await clerkUser.setProfileImage({
        file: `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`,
      });
    } catch {
      Alert.alert(
        'Could not update photo',
        'Your profile photo was not changed. Check your connection and try again.',
      );
    } finally {
      setSavingPhoto(false);
    }
  }, [clerkUser, savingPhoto]);

  return (
    <View style={{ marginBottom: 24 }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Edit profile"
        style={{
          borderRadius: cardRadius,
          backgroundColor: colors.surfaceElevated,
          paddingTop: PROFILE_CARD_PADDING_TOP,
          paddingBottom: 20,
          paddingHorizontal: 14,
          alignItems: 'center',
          gap: 12,
        }}
      >
        <UserAvatar
          size={PROFILE_AVATAR_SIZE}
          uri={clerkUser?.imageUrl}
          initials={displayName}
          testID="settings-profile-avatar"
        />
        <View style={{ alignItems: 'center', gap: 3 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700' }}
          >
            {displayName}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13 }}>
            {subtitle}
          </Text>
        </View>
      </Pressable>

      {/* The badge is an overlay sibling, not a child of the card Pressable:
          nesting one Pressable inside another is unreliable on Android, and the
          two targets mean different things (card opens Profile, badge changes
          the photo). `box-none` lets every other tap fall through to the card. */}
      {canEditPhoto ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: PROFILE_CARD_PADDING_TOP,
            left: 0,
            right: 0,
            height: PROFILE_AVATAR_SIZE,
            alignItems: 'center',
          }}
        >
          <View
            pointerEvents="box-none"
            style={{ width: PROFILE_AVATAR_SIZE, height: PROFILE_AVATAR_SIZE }}
          >
            <Pressable
              testID="settings-profile-photo-badge"
              onPress={() => void handleEditPhoto()}
              disabled={savingPhoto}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              accessibilityState={{ disabled: savingPhoto, busy: savingPhoto }}
              hitSlop={8}
              style={({ pressed }) => ({
                position: 'absolute',
                right: 0,
                bottom: 0,
                width: PROFILE_PHOTO_BADGE_SIZE,
                height: PROFILE_PHOTO_BADGE_SIZE,
                borderRadius: PROFILE_PHOTO_BADGE_SIZE / 2,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: colors.surfaceElevated,
                backgroundColor: pressed ? colors.surfaceHover : colors.surfaceOverlay,
                opacity: savingPhoto ? 0.6 : 1,
              })}
            >
              <Pencil size={14} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
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
  const billingTier = useTierStore((s) => s.billingTier);
  const { user: clerkUser } = useUser();
  const signOut = useAuthStore((s) => s.signOut);
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const push = useCallback(
    (path: string) => () => router.push(path as Parameters<typeof router.push>[0]),
    [router],
  );
  const closeSettings = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate('/(app)/(tabs)/chat' as Parameters<typeof router.navigate>[0]);
    }
  }, [router]);

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
          {
            key: 'workspace',
            label: 'Workspace',
            icon: Users,
            tag: cloudAccessTag,
            tone: 'cloud',
            onPress: openCloudRoute('/(app)/settings/workspace'),
          },
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
              void openInAppBrowser('https://agiworkforce.com/help');
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
      ...(isClerkSignedIn
        ? [
            {
              rows: [
                {
                  key: 'logout',
                  label: 'Log Out',
                  icon: LogOut,
                  tone: 'danger' as const,
                  onPress: handleSignOut,
                },
              ],
            },
          ]
        : []),
    ],
    [
      accentColor,
      accountValue,
      appVersion,
      cloudAccessTag,
      handleSignOut,
      isClerkLoaded,
      isClerkSignedIn,
      openCloudRoute,
      push,
      router,
      themeMode,
      billingTier,
      clerkUser,
    ],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      {/* The header sits outside the ScrollView so the close control stays
          pinned; inside it, X scrolled away for most of this ~30-row list and
          the tab bar is hidden on this route, leaving no visible way out. */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: Math.max(24, insets.top / 2),
          paddingBottom: 16,
        }}
      >
        <View
          style={{
            minHeight: 42,
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
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 36,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHeader onPress={push('/(app)/profile')} />

        {sections.map((section, index) => (
          <SectionCard key={section.title ?? `section-${index}`} section={section} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
