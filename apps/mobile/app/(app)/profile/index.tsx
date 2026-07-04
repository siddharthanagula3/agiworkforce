import type React from 'react';
import { useCallback, useMemo } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  BarChart3,
  Brain,
  ChevronRight,
  CreditCard,
  Database,
  ExternalLink,
  LogOut,
  MessageSquare,
  Shield,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { useUser } from '@clerk/expo';
import { Text } from '@/components/ui/text';
import { fetchPortalSessionUrl } from '@/src/features/billing';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatStore } from '@/stores/chatStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  executionModeForConversation,
  isHistoryVisibleConversation,
} from '@/src/features/chat/utils/conversationMode';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { isAllowedExternalUrl, openExternalUrl } from '@/lib/safeOpenURL';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';

interface ProfileRowProps {
  icon: LucideIcon;
  isLast?: boolean;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  value?: string;
}

export default function ProfileScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  // isClerkSignedIn is the real v1 auth signal; `user` from useAuthStore is
  // always null in v1 (initialize() sets it to null and nothing else writes it).
  const { isClerkSignedIn, signOut } = useAuthStore();
  // Clerk user exposes the actual email for the cloud profile header.
  const { user: clerkUser } = useUser();
  const localConversations = useChatStore((s) => s.conversations);
  const cloudConversations = useChatCloudMessageStore((s) => s.conversations);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const isCloudMode = appMode === 'cloud';
  const localPersonalization = useLocalSettingsStore((s) => s.personalization);
  const cloudPersonalization = useCloudSettingsStore((s) => s.personalization);
  const personalization = isCloudMode ? cloudPersonalization : localPersonalization;
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);

  // In cloud mode, cloudConversations is authoritative (cloud store only holds
  // cloud conversations). In local mode, filter by executionMode.
  const modeConversations = useMemo(
    () =>
      (isCloudMode
        ? cloudConversations
        : localConversations.filter(
            (conversation) => executionModeForConversation(conversation) === appMode,
          )
      ).filter(isHistoryVisibleConversation),
    [appMode, isCloudMode, localConversations, cloudConversations],
  );
  const totalMessages = modeConversations.reduce((sum, conversation) => {
    return sum + (conversation.messageCount ?? 0);
  }, 0);

  const cloudEmail = clerkUser?.primaryEmailAddress?.emailAddress;
  const displayName = isCloudMode
    ? 'AGI Cloud'
    : personalization.nickname || personalization.fullName || 'Local profile';
  const subtitle = isCloudMode
    ? cloudEmail || (cloudUnlocked ? 'Cloud access unlocked' : 'Sign in required')
    : personalization.occupation || 'Private on this device';
  const initial = displayName.charAt(0).toUpperCase();
  // Gate cloud account section on the real Clerk signal, not on useAuthStore.user
  // which is permanently null in v1.
  const hasCloudAccount = FEATURES.auth && isClerkSignedIn;

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/settings' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const push = useCallback(
    (path: string) => () => router.push(path as Parameters<typeof router.push>[0]),
    [router],
  );

  const handleManageSubscription = useCallback(async () => {
    try {
      const portalUrl = await fetchPortalSessionUrl();
      if (isAllowedExternalUrl(portalUrl)) {
        await openExternalUrl(portalUrl);
        return;
      }
    } catch {
      // Fall back to the public billing page below.
    }

    const opened = await openExternalUrl('https://agiworkforce.com/settings/billing');
    if (!opened) {
      Alert.alert(
        'Billing unavailable',
        'Open agiworkforce.com/settings/billing in your browser to manage billing.',
      );
    }
  }, []);

  const handleSignOut = useCallback(() => {
    Alert.alert('Log Out', 'Log out of AGI Cloud on this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: signOut },
    ]);
  }, [signOut]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <View
        style={{
          height: 50,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
        }}
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
        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>Profile</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 36,
          gap: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            borderRadius: 18,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 18,
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: colors.surfaceHover,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: '700' }}>
              {initial}
            </Text>
          </View>
          <View style={{ alignItems: 'center', gap: 3 }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700' }}
            >
              {displayName}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 14 }}>
              {subtitle}
            </Text>
          </View>
          <View
            style={{
              alignSelf: 'stretch',
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 14,
              flexDirection: 'row',
              justifyContent: 'space-around',
            }}
          >
            <ProfileStat
              icon={MessageSquare}
              label="Chats"
              value={modeConversations.length}
              color={colors.textSecondary}
            />
            <ProfileStat
              icon={BarChart3}
              label="Messages"
              value={totalMessages}
              color={colors.textSecondary}
            />
          </View>
        </View>

        {!isCloudMode ? (
          <View>
            <SectionTitle title="Local settings" />
            <ProfileGroup>
              <ProfileRow
                icon={Sparkles}
                label="Personalization"
                onPress={push('/(app)/settings/personalization')}
              />
              <ProfileRow icon={Brain} label="Memory" onPress={push('/(app)/settings/memory')} />
              <ProfileRow
                icon={Shield}
                label="Safety & Security"
                onPress={push('/(app)/settings/safety-security')}
              />
              <ProfileRow
                icon={Database}
                isLast
                label="Data Controls"
                onPress={push('/(app)/settings/data-controls')}
              />
            </ProfileGroup>
          </View>
        ) : null}

        {isCloudMode && hasCloudAccount ? (
          <View>
            <SectionTitle title="AGI Cloud" />
            <ProfileGroup>
              <ProfileRow
                icon={CreditCard}
                label="Subscription"
                onPress={handleManageSubscription}
                value="Manage"
              />
              <ProfileRow
                icon={ExternalLink}
                label="Account"
                onPress={() => {
                  void openExternalUrl('https://agiworkforce.com/account');
                }}
                value="Web"
              />
              <ProfileRow
                icon={LogOut}
                isLast
                label="Log Out"
                onPress={handleSignOut}
                tone="danger"
              />
            </ProfileGroup>
          </View>
        ) : null}

        {!isCloudMode ? (
          <View
            style={{
              borderRadius: 16,
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
              flexDirection: 'row',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            <UserRound size={19} color={colors.textSecondary} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>
                Local profile
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                Your local profile, chats, and memory stay separate from AGI Cloud.
              </Text>
            </View>
          </View>
        ) : null}

        {isCloudMode && !hasCloudAccount ? (
          <View
            style={{
              borderRadius: 16,
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
              flexDirection: 'row',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            <UserRound size={19} color={colors.textSecondary} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>
                AGI Cloud profile
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                Cloud profile, chats, memory, and account settings stay separate from Local Mode.
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title }: { title: string }) {
  const colors = useThemeColors();
  return (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 8,
        paddingHorizontal: 2,
      }}
    >
      {title}
    </Text>
  );
}

function ProfileGroup({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        borderRadius: 14,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function ProfileRow({
  icon: Icon,
  isLast,
  label,
  onPress,
  tone = 'default',
  value,
}: ProfileRowProps) {
  const colors = useThemeColors();
  const tint = tone === 'danger' ? colors.agentError : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[label, value].filter(Boolean).join('. ')}
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
      <Icon size={19} color={tint} />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          color: tone === 'danger' ? colors.agentError : colors.textPrimary,
          fontSize: 15,
        }}
      >
        {label}
      </Text>
      {value ? (
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13, maxWidth: 110 }}>
          {value}
        </Text>
      ) : null}
      <ChevronRight size={17} color={colors.textMuted} />
    </Pressable>
  );
}

function ProfileStat({
  color,
  icon: Icon,
  label,
  value,
}: {
  color: string;
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ alignItems: 'center', gap: 5, minWidth: 86 }}>
      <Icon size={18} color={color} />
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: 22,
          fontWeight: '700',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
