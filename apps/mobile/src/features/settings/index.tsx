import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View, ScrollView } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useUser } from '@clerk/expo';
import { normalizeDisplayName } from '@agiworkforce/utils/display-name';
import {
  Archive,
  Bell,
  BookOpen,
  Brain,
  Cake,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Code2,
  CreditCard,
  Database,
  HardDrive,
  Images,
  Info,
  Link2,
  LockKeyhole,
  LogOut,
  MessageCircleWarning,
  Mic,
  MonitorSmartphone,
  MoonStar,
  Palette,
  Pencil,
  Shield,
  Share2,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Stethoscope,
  SunMoon,
  UserRound,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useAuthStore } from '@/src/features/auth/store';
import { ageGateStatus, getAgeThreshold } from '@/src/features/auth/services/ageGate';
import type { PostAuthDestination } from '@/src/features/auth/services/postAuthIntent';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { ACCOUNT_PICKER_VIEW } from '@/src/features/accounts/accountNavigation';
import {
  CloudAccountRequired,
  SettingsGroup,
  SettingsRow as AccountSettingsRow,
  SettingsScreenShell,
} from './Common';
import { useTierStore } from '@/src/features/billing/store';
import { planCheckOf } from '@/src/features/billing/planCheck';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { UserAvatar } from '@/src/shared/components/UserAvatar';
import { CLOUD_CODE_SCREEN_TITLE } from '@/src/features/cloud-code/presentation';
import { FEEDBACK_SCREEN_TITLE } from '@/src/features/feedback/presentation';
import {
  EMAIL_SCREEN_TITLE,
  MEDIA_SCREEN_TITLE,
  NOTIFICATIONS_SCREEN_TITLE,
  SECURITY_LOGIN_SCREEN_TITLE,
  SHARED_LINKS_SCREEN_TITLE,
  SUBSCRIPTION_SCREEN_TITLE,
  TIME_AND_FOCUS_SCREEN_TITLE,
} from '@/src/features/settings/screenTitles';
import { DEVICE_INTEGRATIONS_SCREEN_TITLE } from '@/src/features/integrations/presentation';
import { searchSettingsPages } from '@/src/features/search/mobileDestinations';
import { destinationScope } from '@/src/features/shell/destinationScope';
import {
  AGE_SETTING_LABEL,
  AGE_SETTING_ROUTE,
  ageSettingValue,
} from '@/src/features/settings/ageSettingValue';
import { SettingsSearchField, SettingsSearchResults } from '@/src/features/settings/SettingsSearch';
import { settingsSearchEntries } from '@/src/features/settings/settingsSearchEntries';
import { useOpenCloudRoute } from '@/src/features/settings/useOpenCloudRoute';
import { useImageModelChoosable } from '@/src/features/settings/media/useImageModelChoosable';
import { openWebContentPage } from '@/src/platform/webContentPage';
import { openOrAlert } from '@/src/features/settings/cloud-privacy/privacyCenterLinks';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { useTheme, useThemeColors, cardRadius } from '@/src/ui/theme';
import { ROW_LABEL_TEXT_SCALE_LIMIT, typeScale } from '@/src/ui/theme/tokens';
import { useLargeTextRows } from '@/src/shared/hooks/useLargeTextRows';
import { contentColumn } from '@/src/shared/layout/contentColumn';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useAppModeSwitch } from '@/src/features/chat/hooks/useAppModeSwitch';
import { ModeToggle } from '@/src/features/chat/components/ModeToggle';
import {
  confirmMobileDiagnosticsShare,
  shareMobileDiagnostics,
} from '@/src/features/settings/diagnostics';
import { useCloudProfilePhoto } from '@/src/features/settings/cloud-account/useCloudProfilePhoto';
import { useCloudProfileStore } from '@/src/features/settings/cloud-account/cloudProfileStore';
import { useConnectionStore, type ConnectionStatus } from '@/stores/connectionStore';
import {
  activeDeviceAccount,
  deviceAccountErrorMessage,
  planSignOutHandover,
} from '@/src/features/accounts/deviceAccounts';
import { useDeviceAccounts } from '@/src/features/accounts/useDeviceAccounts';
import {
  AccountSwitchOverlay,
  DeviceAccountsCard,
} from '@/src/features/accounts/components/DeviceAccountsCard';

function remoteConnectionLabel(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'reconnecting':
      return 'Reconnecting';
    case 'stale':
      return 'Connection lost';
    case 'session_expired':
      return 'Session expired';
    case 'error':
      return 'Needs attention';
    case 'disconnected':
      return 'Not paired';
  }
}

type RowTone = 'default' | 'cloud' | 'danger';

interface SettingsRow {
  key: string;
  label: string;
  icon: LucideIcon;
  value?: string;
  loading?: boolean;
  hint?: string;
  tag?: string;
  tone?: RowTone;
  route?: string;
  onPress: () => void;
}

interface SettingsSection {
  title?: string;
  scope?: 'cloud';
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
          accessibilityRole="header"
          style={{
            color: colors.textMuted,
            fontSize: typeScale.footnote,
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
  const stacked = useLargeTextRows();
  const labelColor = row.tone === 'danger' ? colors.agentError : colors.textPrimary;

  // A hard 130pt cut most real email addresses off mid-domain. Let the value
  // take the space the label does not need, and cap font scaling so the row
  // still fits at accessibility sizes.
  const value = row.loading ? (
    <LoadingIndicator testID={`settings-row-loading-${row.key}`} />
  ) : row.value ? (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={2}
      style={{
        color: colors.textMuted,
        fontSize: typeScale.footnote,
        flexShrink: 1,
        textAlign: stacked ? 'left' : 'right',
      }}
    >
      {row.value}
    </Text>
  ) : null;
  const tag = badge ? (
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
      <Text
        {...(stacked ? { maxFontSizeMultiplier: ROW_LABEL_TEXT_SCALE_LIMIT } : {})}
        style={{ color: badge.color, fontSize: typeScale.caption, fontWeight: '700' }}
      >
        {row.tag}
      </Text>
    </View>
  ) : null;

  return (
    <Pressable
      onPress={row.onPress}
      accessibilityRole="button"
      accessibilityLabel={[row.label, row.loading ? undefined : row.value, row.tag]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint={row.hint ?? `Opens ${row.label}`}
      accessibilityState={row.loading ? { busy: true } : undefined}
      style={{
        minHeight: 50,
        paddingHorizontal: 14,
        ...(stacked ? { paddingVertical: 8 } : {}),
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <Icon size={19} color={tint} strokeWidth={1.8} />
      {stacked ? (
        <View testID={`settings-row-text-${row.key}`} style={{ flex: 1, minWidth: 0 }}>
          <Text
            testID={`settings-row-label-${row.key}`}
            maxFontSizeMultiplier={ROW_LABEL_TEXT_SCALE_LIMIT}
            style={{ color: labelColor, fontSize: typeScale.body }}
          >
            {row.label}
          </Text>
          {value || tag ? (
            <View
              testID={`settings-row-detail-${row.key}`}
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
                marginTop: 2,
              }}
            >
              {value}
              {tag}
            </View>
          ) : null}
        </View>
      ) : (
        <>
          <Text
            testID={`settings-row-label-${row.key}`}
            numberOfLines={1}
            style={{
              flexGrow: 1,
              flexShrink: 0,
              color: labelColor,
              fontSize: typeScale.body,
            }}
          >
            {row.label}
          </Text>
          {value}
          {tag}
        </>
      )}
      {/* A danger row is terminal, Log Out raises a confirm Alert, it does not
          push a screen. A chevron there advertises navigation that never
          happens, so it is suppressed for the whole tone. */}
      {row.tone === 'danger' || row.loading ? null : (
        <ChevronRight size={17} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const HEADER_SLOT_SIZE = 44;
const PROFILE_AVATAR_SIZE = 88;
const PROFILE_PHOTO_BADGE_SIZE = 30;
const PROFILE_CARD_PADDING_TOP = 20;

function HeaderCircleButton({
  onPress,
  accessibilityLabel,
  icon: Icon,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  icon: LucideIcon;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        width: HEADER_SLOT_SIZE,
        height: HEADER_SLOT_SIZE,
        borderRadius: HEADER_SLOT_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surfaceHover : colors.surfaceElevated,
      })}
    >
      <Icon size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

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
  const { changePhoto: handleEditPhoto, savingPhoto } = useCloudProfilePhoto(clerkUser);
  const cloudProfileName = useCloudProfileStore((state) =>
    state.ownerId === clerkUser?.id ? state.displayName : null,
  );
  const cloudProfileAvatar = useCloudProfileStore((state) =>
    state.ownerId === clerkUser?.id && state.loaded ? state.avatarUrl : clerkUser?.imageUrl,
  );
  const loadCloudProfileName = useCloudProfileStore((state) => state.load);
  useEffect(() => {
    if (isCloudMode && isClerkSignedIn && clerkUser?.id) {
      void loadCloudProfileName(clerkUser.id);
    }
  }, [clerkUser?.id, isClerkSignedIn, isCloudMode, loadCloudProfileName]);
  const providerName =
    clerkUser?.fullName ||
    clerkUser?.firstName ||
    clerkUser?.username ||
    clerkUser?.primaryEmailAddress?.emailAddress?.split('@')[0];
  const displayName = isCloudMode
    ? cloudProfileName ||
      (providerName ? normalizeDisplayName(providerName) : undefined) ||
      'AGI Cloud'
    : personalization.nickname || personalization.fullName || 'Local profile';
  const subtitle = isCloudMode
    ? clerkUser?.primaryEmailAddress?.emailAddress ||
      (cloudUnlocked ? 'Cloud access unlocked' : 'Sign in required')
    : personalization.occupation || 'Local mode active';
  const canEditPhoto = isCloudMode && isClerkSignedIn && Boolean(clerkUser);

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
          uri={isCloudMode ? cloudProfileAvatar : undefined}
          initials={displayName}
          testID="settings-profile-avatar"
        />
        <View style={{ alignItems: 'center', gap: 3 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontSize: typeScale.title3, fontWeight: '700' }}
          >
            {displayName}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
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
  const { view } = useLocalSearchParams<{ view?: string }>();
  const { colors, isDark } = useTheme();
  const pageBackground = isDark ? colors.background : colors.surfaceBase;
  const insets = useSafeAreaInsets();
  const { appMode, cloudUnlocked, switchToLocal, switchToCloud } = useAppModeSwitch();
  const isCloud = appMode === 'cloud';
  const selectMode = useCallback(
    (mode: 'local' | 'cloud') => () => {
      if (mode === appMode) return;
      if (mode === 'cloud') switchToCloud();
      else switchToLocal();
    },
    [appMode, switchToCloud, switchToLocal],
  );
  const localThemeMode = useLocalSettingsStore((s) => s.themeMode);
  const cloudThemeMode = useCloudSettingsStore((s) => s.themeMode);
  const themeMode = isCloud ? cloudThemeMode : localThemeMode;
  const localAccentColor = useLocalSettingsStore((s) => s.accentColor);
  const cloudAccentColor = useCloudSettingsStore((s) => s.accentColor);
  const accentColor = isCloud ? cloudAccentColor : localAccentColor;
  const billingTier = useTierStore((s) => s.billingTier);
  const planCheck = useTierStore(planCheckOf);
  const imageModelChoosable = useImageModelChoosable();
  const billingLoading = planCheck === 'checking';
  const planValue =
    planCheck === 'confirmed' ? getBillingPlanPricing(billingTier).label : 'Not confirmed';
  const remoteStatus = useConnectionStore((s) => s.status);
  const remoteDesktopName = useConnectionStore((s) => s.desktopName);
  const { user: clerkUser } = useUser();
  const signOut = useAuthStore((s) => s.signOut);
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const openCloudRoute = useOpenCloudRoute();
  const hasClerkSession = clerkUser != null;
  const deviceAccounts = useDeviceAccounts();
  const signedInAccount = deviceAccounts.multiSession ? activeDeviceAccount(deviceAccounts) : null;
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const push = useCallback(
    (path: string) => () => router.push(path as Parameters<typeof router.push>[0]),
    [router],
  );
  const pushTo = useCallback((path: string) => ({ route: path, onPress: push(path) }), [push]);
  const cloudTo = useCallback(
    (path: PostAuthDestination) => ({ route: path as string, onPress: openCloudRoute(path) }),
    [openCloudRoute],
  );
  const closeSettings = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate('/(app)/(tabs)/chat' as Parameters<typeof router.navigate>[0]);
    }
  }, [router]);

  const [ageStatus, setAgeStatus] = useState(ageGateStatus);
  useFocusEffect(
    useCallback(() => {
      setAgeStatus(ageGateStatus());
    }, []),
  );
  const ageValue = ageSettingValue(ageStatus, getAgeThreshold());

  const [searchQuery, setSearchQuery] = useState('');
  const isSearching = searchQuery.trim().length > 0;
  const openSearchResult = useCallback(
    (route: string) => {
      if (destinationScope(route) === 'cloud') {
        openCloudRoute(route as PostAuthDestination)();
        return;
      }
      router.push(route as Parameters<typeof router.push>[0]);
    },
    [openCloudRoute, router],
  );

  const handleSignOut = useCallback(() => {
    const handover = planSignOutHandover(deviceAccounts);
    const message = signedInAccount
      ? handover
        ? `Log out of ${signedInAccount.email} on this device? You will continue as ${handover.next.email}.`
        : `Log out of ${signedInAccount.email} on this device?`
      : 'Log out of AGI Cloud on this device?';
    Alert.alert('Log Out', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () =>
          void signOut().catch((error: unknown) => {
            Alert.alert('Log out failed', deviceAccountErrorMessage(error, 'sign-out'));
          }),
      },
    ]);
  }, [deviceAccounts, signOut, signedInAccount]);

  const handleExportDiagnostics = useCallback(() => {
    void confirmMobileDiagnosticsShare()
      .then((confirmed) =>
        confirmed
          ? shareMobileDiagnostics().then((summary) => Alert.alert('Diagnostics exported', summary))
          : undefined,
      )
      .catch(() =>
        Alert.alert(
          'Diagnostics export failed',
          'Could not prepare the diagnostics bundle. Try again.',
        ),
      );
  }, []);

  const cloudAccessTag = !isClerkLoaded ? 'Checking' : isClerkSignedIn ? 'Cloud' : 'Sign in';
  const accountValue = !isClerkLoaded ? 'Checking…' : isClerkSignedIn ? undefined : 'Sign in';

  const sections = useMemo<SettingsSection[]>(
    () => [
      {
        title: 'Account',
        scope: 'cloud',
        rows: [
          {
            key: 'account-email',
            label: EMAIL_SCREEN_TITLE,
            icon: UserRound,
            value:
              clerkUser?.primaryEmailAddress?.emailAddress ??
              (isClerkLoaded ? (isClerkSignedIn ? 'Signed in' : 'Sign in') : 'Checking…'),
            ...cloudTo('/(app)/settings/cloud-account'),
          },
          {
            key: 'account-security',
            label: SECURITY_LOGIN_SCREEN_TITLE,
            icon: Shield,
            value: accountValue,
            ...cloudTo('/(app)/settings/account-security'),
          },
          {
            key: 'account-subscription',
            label: SUBSCRIPTION_SCREEN_TITLE,
            icon: CreditCard,
            value: accountValue ?? planValue,
            loading: accountValue === undefined && billingLoading,
            ...cloudTo('/(app)/settings/cloud-billing'),
          },
          {
            key: 'account-age',
            label: AGE_SETTING_LABEL,
            icon: Cake,
            value: ageValue,
            ...pushTo(AGE_SETTING_ROUTE),
          },
          {
            key: 'account-shared-links',
            label: SHARED_LINKS_SCREEN_TITLE,
            icon: Share2,
            value: accountValue,
            ...cloudTo('/(app)/settings/shared-links'),
          },
          {
            key: 'workspace',
            label: 'Workspace',
            icon: Users,
            value: accountValue,
            ...cloudTo('/(app)/settings/workspace'),
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
            ...pushTo('/(app)/settings/appearance'),
          },
          {
            key: 'accent-color',
            label: 'Accent Color',
            icon: Palette,
            value: formatAccent(accentColor),
            ...pushTo('/(app)/settings/accent-color'),
          },
          {
            key: 'general',
            label: 'General',
            icon: SlidersHorizontal,
            ...pushTo('/(app)/settings/general'),
          },
          {
            key: 'notifications',
            label: NOTIFICATIONS_SCREEN_TITLE,
            icon: Bell,
            ...pushTo('/(app)/settings/notifications'),
          },
          {
            key: 'time-and-focus',
            label: TIME_AND_FOCUS_SCREEN_TITLE,
            icon: MoonStar,
            ...pushTo('/(app)/settings/time-and-focus'),
          },
          ...(FEATURES.connectors
            ? [
                {
                  key: 'device-integrations',
                  label: DEVICE_INTEGRATIONS_SCREEN_TITLE,
                  icon: CalendarDays,
                  ...pushTo('/(app)/settings/integrations'),
                },
              ]
            : []),
          {
            key: 'quick-access',
            label: 'Quick Access',
            icon: Zap,
            ...pushTo('/(app)/widget-setup'),
          },
          {
            key: 'voice',
            label: 'Voice',
            icon: Mic,
            ...pushTo('/(app)/settings/voice'),
          },
          {
            key: 'permissions',
            label: 'Permissions',
            icon: Smartphone,
            ...pushTo('/(app)/settings/permissions'),
          },
          {
            key: 'safety-security',
            label: 'Safety & Security',
            icon: Shield,
            ...pushTo('/(app)/settings/safety-security'),
          },
          {
            key: 'storage',
            label: 'Storage',
            icon: HardDrive,
            route: '/(app)/settings/storage',
            onPress: () =>
              router.push({
                pathname: '/(app)/settings/storage',
                params: { returnTo: '/(app)/settings' },
              } as Parameters<typeof router.push>[0]),
          },
        ],
      },
      ...(FEATURES.companion
        ? [
            {
              title: 'Remote control',
              scope: 'cloud' as const,
              rows: [
                {
                  key: 'remote',
                  label: 'Connections',
                  icon: MonitorSmartphone,
                  value:
                    remoteStatus === 'connected' && remoteDesktopName
                      ? remoteDesktopName
                      : remoteConnectionLabel(remoteStatus),
                  ...pushTo('/(app)/settings/remote-control'),
                },
              ],
            },
          ]
        : []),
      {
        title: 'Assistant',
        rows: [
          {
            key: 'personalization',
            label: 'Personalization',
            icon: Sparkles,
            ...pushTo('/(app)/settings/personalization'),
          },
          {
            key: 'memory',
            label: 'Memory',
            icon: Brain,
            ...pushTo('/(app)/settings/memory'),
          },
          {
            key: 'capabilities',
            label: 'Capabilities',
            icon: Zap,
            ...pushTo('/(app)/settings/capabilities'),
          },
          ...(FEATURES.imageGen && imageModelChoosable
            ? [
                {
                  key: 'media',
                  label: MEDIA_SCREEN_TITLE,
                  icon: Images,
                  ...pushTo('/(app)/settings/media'),
                },
              ]
            : []),
          {
            key: 'code',
            label: CLOUD_CODE_SCREEN_TITLE,
            icon: Code2,
            ...pushTo('/(app)/settings/code'),
          },
          {
            key: 'data-controls',
            label: 'Data Controls',
            icon: Database,
            ...pushTo('/(app)/settings/data-controls'),
          },
          {
            key: 'privacy',
            label: 'Privacy',
            icon: LockKeyhole,
            ...pushTo('/(app)/settings/cloud-privacy'),
          },
        ],
      },
      {
        title: 'Cloud',
        scope: 'cloud',
        rows: [
          ...(FEATURES.skills
            ? [
                {
                  key: 'customize',
                  label: 'Customize',
                  icon: BookOpen,
                  tag: cloudAccessTag,
                  tone: 'cloud' as const,
                  ...pushTo('/(app)/customize'),
                },
              ]
            : []),
          {
            key: 'reflect',
            label: 'Reflect',
            icon: Sparkles,
            tag: cloudAccessTag,
            tone: 'cloud',
            ...cloudTo('/(app)/settings/reflect'),
          },
          {
            key: 'archived-chats',
            label: 'Archived Chats',
            icon: Archive,
            tag: cloudAccessTag,
            tone: 'cloud',
            ...cloudTo('/(app)/settings/archived-chats'),
          },
          {
            key: 'usage',
            label: 'Usage',
            icon: Database,
            tag: cloudAccessTag,
            tone: 'cloud',
            ...cloudTo('/(app)/settings/cloud-usage'),
          },
          {
            key: 'connectors',
            label: 'Connectors',
            icon: Link2,
            tag: cloudAccessTag,
            tone: 'cloud',
            ...cloudTo('/(app)/settings/cloud-connectors'),
          },
        ],
      },
      {
        title: 'Support',
        rows: [
          {
            key: 'report',
            label: FEEDBACK_SCREEN_TITLE,
            icon: MessageCircleWarning,
            route: '/(app)/feedback',
            onPress: () =>
              router.push({
                pathname: '/(app)/feedback',
                params: { returnTo: '/(app)/settings' },
              } as Parameters<typeof router.push>[0]),
          },
          {
            key: 'help',
            label: 'Help Center',
            icon: CircleHelp,
            onPress: () => {
              void openOrAlert(() => openWebContentPage('/help'));
            },
          },
          {
            key: 'diagnostics',
            label: 'Export Diagnostics',
            icon: Stethoscope,
            hint: 'Asks before sharing a diagnostics summary',
            onPress: handleExportDiagnostics,
          },
          {
            key: 'about',
            label: 'About',
            icon: Info,
            value: `v${appVersion}`,
            ...pushTo('/(app)/about'),
          },
        ],
      },
      ...(isClerkSignedIn || hasClerkSession
        ? [
            {
              rows: [
                {
                  key: 'logout',
                  label: 'Log Out',
                  icon: LogOut,
                  tone: 'danger' as const,
                  value: signedInAccount?.email,
                  hint: signedInAccount
                    ? `Signs ${signedInAccount.email} out on this device`
                    : 'Signs you out on this device',
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
      ageValue,
      appVersion,
      cloudAccessTag,
      handleExportDiagnostics,
      handleSignOut,
      hasClerkSession,
      isClerkLoaded,
      isClerkSignedIn,
      imageModelChoosable,
      cloudTo,
      pushTo,
      router,
      remoteStatus,
      remoteDesktopName,
      themeMode,
      billingLoading,
      planValue,
      clerkUser,
      signedInAccount,
    ],
  );
  const visibleSections = useMemo(
    () => sections.filter((section) => isCloud || section.scope !== 'cloud'),
    [isCloud, sections],
  );
  const searchResults = useMemo(
    () =>
      settingsSearchEntries({
        query: searchQuery,
        pages: searchSettingsPages(searchQuery, appMode),
        sections: visibleSections,
        openRoute: openSearchResult,
        cloudValue: accountValue,
      }),
    [accountValue, appMode, openSearchResult, searchQuery, visibleSections],
  );

  if (view === ACCOUNT_PICKER_VIEW) {
    const canListAccounts =
      isClerkSignedIn && deviceAccounts.multiSession && deviceAccounts.accounts.length > 0;
    return (
      <SettingsScreenShell
        title="Switch account"
        backHref="/(app)/(tabs)/chat"
        overlay={<AccountSwitchOverlay />}
      >
        {canListAccounts ? (
          <DeviceAccountsCard accounts={deviceAccounts} />
        ) : !isClerkLoaded || (!isClerkSignedIn && !hasClerkSession) ? (
          <CloudAccountRequired
            isLoading={!isClerkLoaded}
            onSignIn={() => router.push(beginCloudPostAuthIntent())}
          />
        ) : (
          <SettingsGroup footnote="Log out on this phone, then sign in with the account you want to use.">
            <AccountSettingsRow
              label="Log Out"
              icon={LogOut}
              onPress={handleSignOut}
              isLast
              destructive
            />
          </SettingsGroup>
        )}
      </SettingsScreenShell>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: pageBackground }}>
      {/* The header sits outside the ScrollView so the close control stays
          pinned; inside it, X scrolled away for most of this ~30-row list,
          leaving no visible way out. */}
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
          <HeaderCircleButton
            onPress={closeSettings}
            accessibilityLabel="Close settings"
            icon={X}
          />
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: typeScale.headline,
              fontWeight: '600',
              textAlign: 'center',
            }}
          >
            Settings
          </Text>
          <HeaderCircleButton
            onPress={push('/(app)/about')}
            accessibilityLabel="About AGI"
            icon={Info}
          />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          ...contentColumn('reading'),
          paddingHorizontal: 16,
          paddingBottom: 36,
        }}
      >
        <SettingsSearchField value={searchQuery} onChange={setSearchQuery} />

        {isSearching ? (
          <SettingsSearchResults query={searchQuery} results={searchResults} />
        ) : (
          <>
            <View style={{ marginBottom: 16 }}>
              <ModeToggle
                mode={appMode}
                cloudUnlocked={cloudUnlocked}
                onTapLocal={selectMode('local')}
                onTapCloud={selectMode('cloud')}
              />
            </View>

            <ProfileHeader onPress={push('/(app)/profile')} />
            {isCloud ? <DeviceAccountsCard accounts={deviceAccounts} /> : null}

            {visibleSections.map((section, index) => (
              <SectionCard key={section.title ?? `section-${index}`} section={section} />
            ))}
          </>
        )}
      </ScrollView>
      <AccountSwitchOverlay />
    </SafeAreaView>
  );
}
