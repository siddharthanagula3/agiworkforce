import { useCallback } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowLeft,
  CreditCard,
  BarChart3,
  MessageSquare,
  Bot,
  Clock,
  ExternalLink,
  LogOut,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { fetchPortalSessionUrl, UpsellCard } from '@/src/features/billing';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatStore } from '@/stores/chatStore';
import { useAgentStore } from '@/stores/agentStore';
import { isAllowedExternalUrl, openExternalUrl } from '@/lib/safeOpenURL';
import { useThemeColors } from '@/src/ui/theme';
import { normalizeBillingPlanTier } from '@agiworkforce/types';
import { FEATURES } from '@/lib/v1FeatureFlags';

interface UsageStats {
  totalConversations: number;
  totalMessages: number;
  totalAgentRuns: number;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
}

/**
 * ProfileScreen -- User profile, subscription status, usage stats.
 */
export default function ProfileScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const conversations = useChatStore((s) => s.conversations);
  const agents = useAgentStore((s) => s.agents);

  // v1 local-only: derive all stats from local store data. No API call needed.
  // totalMessages sums per-conversation messageCount from ConversationSummary.
  // subscriptionPlan / subscriptionStatus remain null until cloud is wired up.
  const totalMessages = conversations.reduce((sum, c) => sum + (c.messageCount ?? 0), 0);
  const stats: UsageStats = {
    totalConversations: conversations.length,
    totalMessages,
    totalAgentRuns: agents.length,
    subscriptionPlan: null,
    subscriptionStatus: null,
  };

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }, [signOut]);

  const handleManageSubscription = useCallback(async () => {
    try {
      const portalUrl = await fetchPortalSessionUrl();
      // HIGH-MOB-02 allowlist: only https://stripe.com / *.stripe.com /
      // agiworkforce.com / *.agiworkforce.com are accepted.
      if (isAllowedExternalUrl(portalUrl)) {
        await WebBrowser.openBrowserAsync(portalUrl);
        return;
      }
    } catch {
      // Fall through to fallback below
    }
    // Fallback: static billing page
    const fallbackOpened = await openExternalUrl('https://agiworkforce.com/settings/billing');
    if (!fallbackOpened) {
      Alert.alert(
        'Error',
        "Couldn't open billing portal. Try again or visit agiworkforce.com/settings/billing",
      );
    }
  }, []);

  const handleUpgradePress = useCallback(async () => {
    // Open Stripe checkout via system browser; portal-session doubles as
    // the upgrade URL for free-plan users when no subscription exists.
    try {
      const portalUrl = await fetchPortalSessionUrl();
      if (isAllowedExternalUrl(portalUrl)) {
        await WebBrowser.openBrowserAsync(portalUrl);
        return;
      }
    } catch {
      // Fall through
    }
    await openExternalUrl('https://agiworkforce.com/pricing');
  }, []);

  if (!FEATURES.auth) return null;

  const email = user?.email ?? 'Not signed in';
  const initial = email[0]?.toUpperCase() ?? 'U';
  const joinDate = user?.created_at ? formatDate(user.created_at) : null;

  // Normalise the plan string from the API into a BillingPlanTier so we can
  // decide whether to show the upsell. normalizeBillingPlanTier falls back to
  // 'free' for null / unrecognised values — correct for new / unsubscribed users.
  const planTier = normalizeBillingPlanTier(stats.subscriptionPlan);
  const showUpsell = planTier === 'free' || planTier === 'byok' || planTier === 'local-only';

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View
        className="flex-row items-center px-3 h-12"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2">
          Profile
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + Name */}
        <Animated.View entering={FadeInDown.duration(250)}>
          <Card>
            <View className="items-center py-4">
              <View className="w-20 h-20 rounded-full bg-teal-500/20 items-center justify-center mb-3">
                <Text className="text-3xl font-bold text-teal-400">{initial}</Text>
              </View>
              <Text className="text-lg font-semibold text-white">{email}</Text>
              {joinDate && (
                <View className="flex-row items-center gap-1 mt-1">
                  <Clock size={12} color={colors.textMuted} />
                  <Text className="text-xs text-white/40">Joined {joinDate}</Text>
                </View>
              )}
            </View>
          </Card>
        </Animated.View>

        {/* Upsell card — only shown for non-cloud-ready plans */}
        {showUpsell && (
          <Animated.View entering={FadeInDown.duration(250).delay(50)}>
            <UpsellCard onUpgradePress={handleUpgradePress} />
          </Animated.View>
        )}

        {/* Subscription */}
        <Animated.View entering={FadeInDown.duration(250).delay(60)}>
          <Card>
            <Text variant="caption" className="mb-3 uppercase tracking-wider">
              Subscription
            </Text>
            <View className="flex-row items-center gap-3 mb-3">
              <CreditCard size={18} color={colors.teal} />
              <View className="flex-1">
                <Text className="text-sm text-white font-medium">
                  {stats.subscriptionPlan ?? 'Free Plan'}
                </Text>
                {stats.subscriptionStatus && (
                  <Text className="text-xs text-white/40 mt-0.5">{stats.subscriptionStatus}</Text>
                )}
              </View>
              <Badge
                label={stats.subscriptionStatus === 'active' ? 'Active' : 'Free'}
                color={stats.subscriptionStatus === 'active' ? 'green' : 'gray'}
              />
            </View>
            <Button
              title="Manage Subscription"
              variant="outline"
              size="sm"
              onPress={handleManageSubscription}
            />
          </Card>
        </Animated.View>

        {/* Usage Stats */}
        <Animated.View entering={FadeInDown.duration(250).delay(120)}>
          <Card>
            <Text variant="caption" className="mb-3 uppercase tracking-wider">
              Usage
            </Text>
            <View className="flex-row justify-around py-2">
              <StatItem
                icon={<MessageSquare size={18} color={colors.agentActive} />}
                value={stats.totalConversations}
                label="Chats"
              />
              <StatItem
                icon={<BarChart3 size={18} color={colors.teal} />}
                value={stats.totalMessages}
                label="Messages"
              />
              <StatItem
                icon={<Bot size={18} color={colors.agentWarning} />}
                value={stats.totalAgentRuns}
                label="Agent Runs"
              />
            </View>
          </Card>
        </Animated.View>

        {/* Account Actions */}
        <Animated.View entering={FadeInDown.duration(250).delay(180)}>
          <Card>
            <Text variant="caption" className="mb-3 uppercase tracking-wider">
              Account
            </Text>
            <Pressable
              onPress={() => {
                void openExternalUrl('https://agiworkforce.com/account');
              }}
              className="flex-row items-center gap-3 py-3 active:bg-white/5 rounded-lg"
              accessibilityLabel="Manage account online"
              accessibilityRole="link"
            >
              <ExternalLink size={18} color={colors.textSecondary} />
              <Text className="text-sm text-white flex-1">Manage Account Online</Text>
            </Pressable>
            <Separator />
            <Pressable
              onPress={handleSignOut}
              className="flex-row items-center gap-3 py-3 active:bg-white/5 rounded-lg"
              accessibilityLabel="Sign out"
              accessibilityRole="button"
            >
              <LogOut size={18} color={colors.agentError} />
              <Text className="text-sm text-red-400">Sign Out</Text>
            </Pressable>
          </Card>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StatItem({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <View className="items-center gap-1.5">
      {icon}
      <Text className="text-xl font-bold text-white">{value}</Text>
      <Text className="text-[11px] text-white/40">{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}
