import { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  ArrowLeft,
  CreditCard,
  BarChart3,
  LogOut,
  ExternalLink,
  ChevronRight,
  User,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/src/features/auth/store';
import { useTierStore } from '@/src/features/billing/store';
import { useChatStore } from '@/stores/chatStore';
import { fetchPortalSessionUrl } from '@/src/features/billing';
import { isAllowedExternalUrl, openExternalUrl } from '@/lib/safeOpenURL';
import { useThemeColors } from '@/src/ui/theme';

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  byok: 'BYOK',
  'local-only': 'Local',
  hobby: 'Hobby',
  pro: 'Pro',
  pro_plus: 'Pro+',
  max: 'Max',
  enterprise: 'Enterprise',
};

export default function AccountScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const tier = useTierStore((s) => s.tier);
  const conversations = useChatStore((s) => s.conversations);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/chat' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }, [signOut]);

  const handleManageSubscription = useCallback(async () => {
    setIsLoadingPortal(true);
    try {
      const portalUrl = await fetchPortalSessionUrl();
      if (isAllowedExternalUrl(portalUrl)) {
        await WebBrowser.openBrowserAsync(portalUrl);
        return;
      }
    } catch {
      // fall through
    } finally {
      setIsLoadingPortal(false);
    }
    await openExternalUrl('https://agiworkforce.com/settings/billing');
  }, []);

  if (!FEATURES.auth) return null;

  const email = user?.email ?? 'Not signed in';
  const displayName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || email.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase();
  const joinDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  const tierLabel = TIER_LABELS[tier] ?? tier;

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <View
        className="flex-row items-center px-3 h-12"
        style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
      >
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={c.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2" style={{ color: c.textPrimary }}>
          Account
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + identity */}
        <Card>
          <View className="items-center py-3 gap-3">
            <View
              className="w-20 h-20 rounded-full items-center justify-center"
              style={{ backgroundColor: `${c.teal}22` }}
            >
              <Text className="text-3xl font-bold" style={{ color: c.teal }}>
                {initial}
              </Text>
            </View>
            <View className="items-center gap-1">
              <Text className="text-[17px] font-semibold" style={{ color: c.textPrimary }}>
                {displayName}
              </Text>
              <Text className="text-sm" style={{ color: c.textSecondary }}>
                {email}
              </Text>
              {joinDate && (
                <Text className="text-xs mt-0.5" style={{ color: c.textMuted }}>
                  Member since {joinDate}
                </Text>
              )}
            </View>
          </View>
        </Card>

        {/* Subscription */}
        <Card>
          <Text
            className="text-[11px] uppercase tracking-wider font-semibold mb-3"
            style={{ color: c.textMuted }}
          >
            Subscription
          </Text>
          <View className="flex-row items-center gap-3 mb-4">
            <CreditCard size={18} color={c.teal} />
            <Text className="text-[15px] flex-1" style={{ color: c.textPrimary }}>
              {tierLabel} Plan
            </Text>
            <Badge label={tierLabel} color="teal" />
          </View>
          <Pressable
            onPress={handleManageSubscription}
            disabled={isLoadingPortal}
            className="flex-row items-center justify-between py-3 active:bg-white/5 rounded-lg -mx-1 px-1"
            accessibilityLabel="Manage subscription"
            accessibilityRole="button"
          >
            <Text className="text-[14px]" style={{ color: c.textPrimary }}>
              Manage Subscription
            </Text>
            <ExternalLink size={14} color={c.textMuted} />
          </Pressable>
          <Separator />
          <Pressable
            onPress={() => router.push('/(app)/usage' as Parameters<typeof router.push>[0])}
            className="flex-row items-center justify-between py-3 active:bg-white/5 rounded-lg -mx-1 px-1"
            accessibilityLabel="View usage"
            accessibilityRole="button"
          >
            <View className="flex-row items-center gap-3">
              <BarChart3 size={16} color={c.textSecondary} />
              <Text className="text-[14px]" style={{ color: c.textPrimary }}>
                Usage
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <Text className="text-xs" style={{ color: c.textMuted }}>
                {conversations.length} chats
              </Text>
              <ChevronRight size={14} color={c.textMuted} />
            </View>
          </Pressable>
        </Card>

        {/* Account management */}
        <Card>
          <Text
            className="text-[11px] uppercase tracking-wider font-semibold mb-3"
            style={{ color: c.textMuted }}
          >
            Account
          </Text>
          <Pressable
            onPress={() => openExternalUrl('https://agiworkforce.com/account')}
            className="flex-row items-center justify-between py-3 active:bg-white/5 rounded-lg -mx-1 px-1"
            accessibilityLabel="Manage account online"
            accessibilityRole="link"
          >
            <View className="flex-row items-center gap-3">
              <User size={16} color={c.textSecondary} />
              <Text className="text-[14px]" style={{ color: c.textPrimary }}>
                Manage Account Online
              </Text>
            </View>
            <ExternalLink size={14} color={c.textMuted} />
          </Pressable>
          <Separator />
          <Pressable
            onPress={handleSignOut}
            className="flex-row items-center gap-3 py-3 active:bg-white/5 rounded-lg -mx-1 px-1"
            accessibilityLabel="Sign out"
            accessibilityRole="button"
          >
            <LogOut size={16} color={c.agentError} />
            <Text className="text-[14px]" style={{ color: c.agentError }}>
              Sign Out
            </Text>
          </Pressable>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
