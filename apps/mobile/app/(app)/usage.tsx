/**
 * Usage Screen
 *
 * Shows session/monthly progress bars, API spend, and links
 * to subscription management and purchase restoration.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  BarChart3,
  CreditCard,
  RotateCcw,
  ChevronRight,
  Cpu,
  MessageSquare,
  TrendingUp,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { colors } from '@/lib/theme';
import {
  fetchUsageSummary,
  type UsageSummary,
  type ModelUsage,
  type DailyUsage,
} from '@/services/usage';
import { api } from '@/services/api';
import { openExternalUrl } from '@/lib/safeOpenURL';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** Calculate countdown string from a reset timestamp */
function formatCountdown(resetAt: string | null): string {
  if (!resetAt) return '';
  const now = Date.now();
  const target = new Date(resetAt).getTime();
  const diffMs = target - now;
  if (diffMs <= 0) return 'Resetting...';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `Resets in ${hours}h ${minutes}m`;
  return `Resets in ${minutes}m`;
}

/** Format a reset date for monthly display */
function formatResetDate(resetAt: string | null): string {
  if (!resetAt) return '';
  try {
    const date = new Date(resetAt);
    return `Resets ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  } catch {
    return '';
  }
}

/** Return the 3-letter weekday abbreviation for an ISO date string */
function dayLabel(isoDate: string): string {
  try {
    const date = new Date(isoDate + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  } catch {
    return '---';
  }
}

// ---------------------------------------------------------------------------
// Progress Bar
// ---------------------------------------------------------------------------

function ProgressBar({ percentage, label }: { percentage: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, percentage));
  return (
    <View className="gap-2">
      <View
        className="h-2.5 rounded-full overflow-hidden"
        style={{ backgroundColor: colors.charcoal700 }}
      >
        <View
          className="h-full rounded-full"
          style={{
            width: `${clamped}%`,
            backgroundColor: clamped > 80 ? colors.agentWarning : colors.teal,
          }}
        />
      </View>
      <Text className="text-[13px] text-white/60">{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Usage cards
// ---------------------------------------------------------------------------

function SessionUsageCard({ summary }: { summary: UsageSummary }) {
  const SESSION_TOKEN_LIMIT = 100_000;
  const sessionPercent =
    summary.totalTokens > 0
      ? Math.min(100, Math.round((summary.totalTokens / SESSION_TOKEN_LIMIT) * 100))
      : 0;

  return (
    <Card>
      <Text className="text-[13px] text-white/50 uppercase tracking-wider font-semibold mb-3">
        Current Session
      </Text>
      <ProgressBar
        percentage={sessionPercent}
        label={`${formatNumber(summary.totalTokens)} / ${formatNumber(SESSION_TOKEN_LIMIT)} tokens`}
      />
      <Text className="text-[11px] text-white/30 mt-1">Resets periodically</Text>
    </Card>
  );
}

function MonthlyUsageCard({ summary }: { summary: UsageSummary }) {
  // Monthly usage — derive percentage from conversation count or token budget
  const monthlyBudget = 50; // $50 default budget
  const monthlyPercent = Math.min(100, Math.round((summary.totalCost / monthlyBudget) * 100));

  // Reset date — first of next month
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthlyResetAt = nextMonth.toISOString();

  return (
    <Card>
      <Text className="text-[13px] text-white/50 uppercase tracking-wider font-semibold mb-3">
        Monthly Limits
      </Text>
      <ProgressBar percentage={monthlyPercent} label={`${monthlyPercent}% used`} />
      <Text className="text-[11px] text-white/30 mt-1">{formatResetDate(monthlyResetAt)}</Text>
    </Card>
  );
}

function ApiSpendCard({ summary }: { summary: UsageSummary }) {
  const budget = 50;
  return (
    <Card>
      <Text className="text-[13px] text-white/50 uppercase tracking-wider font-semibold mb-2">
        API Spend
      </Text>
      <Text className="text-2xl font-bold text-white">
        {formatCost(summary.totalCost)}{' '}
        <Text className="text-base text-white/30 font-normal">/ {formatCost(budget)}</Text>
      </Text>
    </Card>
  );
}

function StatsRow({ summary }: { summary: UsageSummary }) {
  return (
    <Card>
      <View className="flex-row justify-around">
        <View className="items-center gap-1">
          <BarChart3 size={16} color={colors.teal} />
          <Text className="text-lg font-bold text-white">{formatNumber(summary.totalTokens)}</Text>
          <Text className="text-[11px] text-white/40">Tokens</Text>
        </View>
        <View className="items-center gap-1">
          <MessageSquare size={16} color={colors.agentActive} />
          <Text className="text-lg font-bold text-white">{summary.conversationCount}</Text>
          <Text className="text-[11px] text-white/40">Conversations</Text>
        </View>
        <View className="items-center gap-1">
          <TrendingUp size={16} color={colors.agentWarning} />
          <Text className="text-lg font-bold text-white">{formatCost(summary.totalCost)}</Text>
          <Text className="text-[11px] text-white/40">Total Cost</Text>
        </View>
      </View>
    </Card>
  );
}

function ModelBreakdownCard({ models }: { models: ModelUsage[] }) {
  if (models.length === 0) return null;

  const maxTokens = Math.max(...models.map((m) => m.totalTokens), 1);

  return (
    <Card>
      <View className="flex-row items-center gap-2 mb-3">
        <Cpu size={14} color={colors.textMuted} />
        <Text className="text-[13px] text-white/50 uppercase tracking-wider font-semibold">
          By Model
        </Text>
      </View>
      {models.map((model, index) => {
        const fraction = maxTokens > 0 ? model.totalTokens / maxTokens : 0;
        return (
          <View key={model.modelId}>
            {index > 0 && <Separator className="my-3" />}
            <View>
              <View className="flex-row justify-between items-center mb-1.5">
                <Text className="text-sm text-white font-medium flex-1 mr-2" numberOfLines={1}>
                  {model.modelName}
                </Text>
                <Text className="text-sm text-white/60">{formatCost(model.estimatedCost)}</Text>
              </View>
              <View
                className="h-1.5 rounded-full mb-1.5"
                style={{ backgroundColor: colors.charcoal700 }}
              >
                <View
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${Math.round(fraction * 100)}%`,
                    backgroundColor: colors.teal,
                  }}
                />
              </View>
              <View className="flex-row gap-3">
                <Text className="text-[11px] text-white/40">
                  {formatNumber(model.totalTokens)} tokens
                </Text>
                <Text className="text-[11px] text-white/30">
                  in {formatNumber(model.inputTokens)} / out {formatNumber(model.outputTokens)}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function DailyChartCard({ days }: { days: DailyUsage[] }) {
  if (days.length === 0) return null;

  const maxTokens = Math.max(...days.map((d) => d.totalTokens), 1);
  const MAX_BAR_HEIGHT = 80;

  return (
    <Card>
      <View className="flex-row items-center gap-2 mb-4">
        <BarChart3 size={14} color={colors.textMuted} />
        <Text className="text-[13px] text-white/50 uppercase tracking-wider font-semibold">
          Last 7 Days
        </Text>
      </View>
      <View
        className="flex-row items-end justify-between"
        style={{ height: MAX_BAR_HEIGHT + 32 }}
        accessibilityLabel="Daily token usage chart for the last 7 days"
        accessibilityRole="image"
      >
        {days.map((day) => {
          const barHeight = Math.max(4, Math.round((day.totalTokens / maxTokens) * MAX_BAR_HEIGHT));
          const isToday = day.date === new Date().toISOString().slice(0, 10);
          return (
            <View key={day.date} className="items-center gap-1.5" style={{ flex: 1 }}>
              <Text className="text-[10px] text-white/40">
                {day.totalTokens > 0 ? formatNumber(day.totalTokens) : ''}
              </Text>
              <View
                className="rounded-t-sm w-full mx-0.5"
                style={{
                  height: barHeight,
                  backgroundColor: isToday ? colors.teal : colors.charcoal700,
                  maxWidth: 32,
                }}
              />
              <Text
                className="text-[10px]"
                style={{ color: isToday ? colors.teal : colors.textMuted }}
              >
                {dayLabel(day.date)}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Action rows
// ---------------------------------------------------------------------------

function ActionRow({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof CreditCard;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between py-3.5 px-4 active:bg-white/5"
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <View className="flex-row items-center gap-3">
        <Icon size={18} color={colors.textSecondary} />
        <Text className="text-[15px] text-white">{label}</Text>
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function ErrorCard() {
  return (
    <Card>
      <View className="items-center py-6 gap-2">
        <BarChart3 size={32} color={colors.textMuted} />
        <Text className="text-sm text-white/60 text-center">Usage data unavailable</Text>
        <Text className="text-xs text-white/30 text-center">
          Pull down to retry, or check your connection.
        </Text>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function UsageScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setHasError(false);
    try {
      const data = await fetchUsageSummary();
      setSummary(data);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleRefresh = useCallback(() => {
    void load(true);
  }, [load]);

  const handleManageSubscription = useCallback(async () => {
    try {
      const data = await api.post<{ url: string }>('/api/portal');
      // HIGH-MOB-02 fix: validate `data.url` against the allowlist (see
      // lib/safeOpenURL.ts).
      if (data.url && (await openExternalUrl(data.url))) {
        return;
      }
    } catch {
      // Fall back to static URL
    }
    if (!(await openExternalUrl('https://agiworkforce.com/billing'))) {
      Alert.alert(
        'Error',
        'Could not open subscription management. Please visit agiworkforce.com/billing.',
      );
    }
  }, []);

  const handleRestorePurchases = useCallback(() => {
    Alert.alert(
      'Restore Purchases',
      'Purchase restoration will be available when the app launches on the App Store.',
      [{ text: 'OK' }],
    );
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center px-3 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2">
          Usage
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.teal}
          />
        }
      >
        {isLoading && !isRefreshing ? (
          <Animated.View entering={FadeInDown.duration(200)}>
            <Card>
              <View className="items-center py-8">
                <Text className="text-sm text-white/40">Loading usage data...</Text>
              </View>
            </Card>
          </Animated.View>
        ) : hasError || !summary ? (
          <Animated.View entering={FadeInDown.duration(200)}>
            <ErrorCard />
          </Animated.View>
        ) : (
          <>
            {/* Progress bars */}
            <Animated.View entering={FadeInDown.duration(250)}>
              <SessionUsageCard summary={summary} />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(250).delay(40)}>
              <MonthlyUsageCard summary={summary} />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(250).delay(80)}>
              <ApiSpendCard summary={summary} />
            </Animated.View>

            {/* Stats */}
            <Animated.View entering={FadeInDown.duration(250).delay(120)}>
              <StatsRow summary={summary} />
            </Animated.View>

            {/* Daily chart */}
            <Animated.View entering={FadeInDown.duration(250).delay(160)}>
              <DailyChartCard days={summary.dailyUsage} />
            </Animated.View>

            {/* Model breakdown */}
            <Animated.View entering={FadeInDown.duration(250).delay(200)}>
              <ModelBreakdownCard models={summary.modelBreakdown} />
            </Animated.View>
          </>
        )}

        {/* Actions */}
        <Separator />
        <Card className="p-0 overflow-hidden">
          <ActionRow
            icon={CreditCard}
            label="Manage Subscription"
            onPress={handleManageSubscription}
          />
          <View className="h-px mx-4" style={{ backgroundColor: colors.border }} />
          <ActionRow icon={RotateCcw} label="Restore Purchases" onPress={handleRestorePurchases} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
