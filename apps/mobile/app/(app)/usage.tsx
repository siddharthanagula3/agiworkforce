import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, BarChart3, MessageSquare, Cpu, TrendingUp } from 'lucide-react-native';
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
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({ summary }: { summary: UsageSummary }) {
  return (
    <Card>
      <Text variant="caption" className="mb-3 uppercase tracking-wider">
        {summary.period}
      </Text>
      <View className="flex-row justify-around py-2">
        <SummaryItem
          icon={<BarChart3 size={18} color={colors.teal} />}
          value={formatNumber(summary.totalTokens)}
          label="Total Tokens"
        />
        <SummaryItem
          icon={<TrendingUp size={18} color={colors.agentWarning} />}
          value={formatCost(summary.totalCost)}
          label="Est. Cost"
        />
        <SummaryItem
          icon={<MessageSquare size={18} color={colors.agentActive} />}
          value={summary.conversationCount.toString()}
          label="Conversations"
        />
      </View>
      <Separator className="my-3" />
      <View className="flex-row justify-between">
        <View className="items-center flex-1">
          <Text className="text-xs text-white/40 mb-0.5">Input</Text>
          <Text className="text-sm text-white font-medium">
            {formatNumber(summary.totalInputTokens)}
          </Text>
        </View>
        <View style={{ width: 1, backgroundColor: colors.border }} />
        <View className="items-center flex-1">
          <Text className="text-xs text-white/40 mb-0.5">Output</Text>
          <Text className="text-sm text-white font-medium">
            {formatNumber(summary.totalOutputTokens)}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function SummaryItem({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <View className="items-center gap-1.5">
      {icon}
      <Text className="text-xl font-bold text-white">{value}</Text>
      <Text className="text-[11px] text-white/40">{label}</Text>
    </View>
  );
}

function ModelBreakdownCard({ models }: { models: ModelUsage[] }) {
  if (models.length === 0) return null;

  const maxTokens = Math.max(...models.map((m) => m.totalTokens), 1);

  return (
    <Card>
      <View className="flex-row items-center gap-2 mb-3">
        <Cpu size={14} color={colors.textMuted} />
        <Text variant="caption" className="uppercase tracking-wider">
          By Model
        </Text>
      </View>
      {models.map((model, index) => (
        <View key={model.modelId}>
          {index > 0 && <Separator className="my-3" />}
          <ModelRow model={model} maxTokens={maxTokens} />
        </View>
      ))}
    </Card>
  );
}

function ModelRow({ model, maxTokens }: { model: ModelUsage; maxTokens: number }) {
  const fraction = maxTokens > 0 ? model.totalTokens / maxTokens : 0;

  return (
    <View>
      <View className="flex-row justify-between items-center mb-1.5">
        <Text className="text-sm text-white font-medium flex-1 mr-2" numberOfLines={1}>
          {model.modelName}
        </Text>
        <Text className="text-sm text-white/60">{formatCost(model.estimatedCost)}</Text>
      </View>
      {/* Progress bar */}
      <View className="h-1.5 rounded-full mb-1.5" style={{ backgroundColor: colors.charcoal700 }}>
        <View
          className="h-1.5 rounded-full"
          style={{
            width: `${Math.round(fraction * 100)}%`,
            backgroundColor: colors.teal,
          }}
        />
      </View>
      <View className="flex-row gap-3">
        <Text className="text-[11px] text-white/40">{formatNumber(model.totalTokens)} tokens</Text>
        <Text className="text-[11px] text-white/30">
          in {formatNumber(model.inputTokens)} / out {formatNumber(model.outputTokens)}
        </Text>
      </View>
    </View>
  );
}

function DailyChartCard({ days }: { days: DailyUsage[] }) {
  if (days.length === 0) return null;

  const maxTokens = Math.max(...days.map((d) => d.totalTokens), 1);
  // Chart renders bars up to a fixed height (px converted to flex units)
  const MAX_BAR_HEIGHT = 80;

  return (
    <Card>
      <View className="flex-row items-center gap-2 mb-4">
        <BarChart3 size={14} color={colors.textMuted} />
        <Text variant="caption" className="uppercase tracking-wider">
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
          Usage &amp; Costs
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
            <Animated.View entering={FadeInDown.duration(250)}>
              <SummaryCard summary={summary} />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(250).delay(60)}>
              <DailyChartCard days={summary.dailyUsage} />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(250).delay(120)}>
              <ModelBreakdownCard models={summary.modelBreakdown} />
            </Animated.View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
