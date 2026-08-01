/**
 * Reflect screen.
 *
 * Web has had Settings → Reflect for some time; Mobile had nothing. The recap
 * is entirely server-computed (GET /api/reflect), so this screen is a renderer
 * for the shared wire schema — no mobile-specific statistics logic exists or
 * should exist, or the two surfaces would report different numbers for the
 * same account.
 *
 * Cloud-only: the recap is built from Managed Cloud conversation metadata.
 * Local Mode chats never leave the device and are not part of it.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, AlertCircle, Brain } from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/src/ui/theme';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { CloudAccountRequired, CloudSyncBlockedBanner } from '@/src/features/settings/common';
import {
  REFLECT_RANGES,
  ReflectMemoryRequiredError,
  fetchReflectRecap,
  type ReflectRange,
  type ReflectRecap,
} from '@/src/features/reflect';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; recap: ReflectRecap }
  | { kind: 'memory-off' }
  | { kind: 'error'; message: string };

function formatDate(dateKey: string | null): string {
  if (!dateKey) return '—';
  const date = new Date(`${dateKey}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatHour(hour: number | null): string {
  if (hour === null) return '—';
  return new Date(2026, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });
}

export default function ReflectScreen() {
  const router = useRouter();
  const { colors: c, statusBarStyle } = useTheme();
  const isClerkLoaded = useAuthStore((state) => state.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);

  const [range, setRange] = useState<ReflectRange>('30d');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const recap = await fetchReflectRecap(range, signal);
        if (signal?.aborted) return;
        setState({ kind: 'ready', recap });
      } catch (error) {
        if (signal?.aborted) return;
        if (error instanceof ReflectMemoryRequiredError) {
          setState({ kind: 'memory-off' });
          return;
        }
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Reflect could not load.',
        });
      }
    },
    [range],
  );

  useEffect(() => {
    if (!isClerkSignedIn || appMode !== 'cloud') return;
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void load(controller.signal);
    return () => controller.abort();
  }, [appMode, isClerkSignedIn, load]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(app)/(tabs)/settings' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const header = (
    <View style={{ height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
      <Pressable
        onPress={handleBack}
        hitSlop={8}
        style={({ pressed }) => ({
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? c.surfaceHover : c.transparent,
        })}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <ArrowLeft size={22} color={c.textPrimary} />
      </Pressable>
      <Text
        style={{ flex: 1, color: c.textPrimary, fontSize: 20, fontWeight: '700', marginLeft: 4 }}
      >
        Reflect
      </Text>
    </View>
  );

  if (!isClerkLoaded || !isClerkSignedIn) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
        <StatusBar style={statusBarStyle} />
        {header}
        <View className="flex-1 px-4">
          <CloudAccountRequired
            isLoading={!isClerkLoaded}
            onSignIn={() => router.push('/(auth)/login' as Parameters<typeof router.push>[0])}
          />
        </View>
      </SafeAreaView>
    );
  }

  const recap = state.kind === 'ready' ? state.recap : null;
  const maxDailyCount = Math.max(
    1,
    ...(recap?.dailyActivity.map((day) => day.conversationCount) ?? []),
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
      <StatusBar style={statusBarStyle} />
      {header}

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingTop: 6, paddingBottom: 44 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={c.teal} />
        }
      >
        {appMode !== 'cloud' ? (
          <View style={{ marginBottom: 12 }}>
            <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />
          </View>
        ) : null}

        <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 14 }}>
          Patterns in how you use AGI, without scores or judgment. Your recap is built only when you
          open this screen.
        </Text>

        {/* Range picker */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
          {REFLECT_RANGES.map((option) => {
            const selected = option.value === range;
            return (
              <Pressable
                key={option.value}
                onPress={() => setRange(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show the past ${option.label}`}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 34,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: selected ? c.teal : c.border,
                  backgroundColor: selected ? c.teal : pressed ? c.surfaceHover : c.transparent,
                })}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: selected ? c.accentText : c.textSecondary,
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {state.kind === 'loading' && appMode === 'cloud' && (
          <Text style={{ color: c.textSecondary, fontSize: 13, paddingVertical: 24 }}>
            Building your recap…
          </Text>
        )}

        {state.kind === 'memory-off' && (
          <Card>
            <View className="items-center py-8 gap-3">
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  backgroundColor: c.accentSurface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Brain size={26} color={c.teal} strokeWidth={1.5} />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '600', color: c.textPrimary }}>
                Memory is off
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: c.textSecondary,
                  textAlign: 'center',
                  lineHeight: 18,
                  maxWidth: 300,
                }}
              >
                Reflect builds its recap from the same account memory setting. Turn memory on to see
                your patterns here.
              </Text>
              <Pressable
                onPress={() =>
                  router.push(
                    '/(app)/settings/memory?scope=cloud' as Parameters<typeof router.push>[0],
                  )
                }
                accessibilityRole="button"
                accessibilityLabel="Open memory settings"
              >
                <Text style={{ color: c.teal, fontSize: 13, fontWeight: '600' }}>
                  Open memory settings
                </Text>
              </Pressable>
            </View>
          </Card>
        )}

        {state.kind === 'error' && (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: c.warningBorder,
              backgroundColor: c.warningSurface,
              padding: 14,
            }}
            accessible
            accessibilityLabel={`Reflect could not load. ${state.message}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <AlertCircle size={14} color={c.agentWarning} />
              <Text style={{ color: c.agentWarning, fontSize: 13, fontWeight: '600' }}>
                Reflect could not load
              </Text>
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17 }}>
              {state.message}
            </Text>
            <Pressable
              onPress={() => void load()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading Reflect"
              style={{ marginTop: 10, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: c.teal, fontSize: 13, fontWeight: '600' }}>Retry</Text>
            </Pressable>
          </View>
        )}

        {recap && (
          <>
            <Card>
              <View style={{ padding: 16, gap: 6 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: c.textMuted,
                  }}
                >
                  {recap.period.label}
                </Text>
                <Text style={{ fontSize: 20, fontWeight: '700', color: c.textPrimary }}>
                  {recap.summary.headline}
                </Text>
                <Text style={{ fontSize: 13, lineHeight: 19, color: c.textSecondary }}>
                  {recap.summary.body}
                </Text>
              </View>
            </Card>

            {/* Stats */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {[
                { label: 'Conversations', value: String(recap.stats.totalConversations) },
                { label: 'Active days', value: String(recap.stats.activeDays) },
                { label: 'Most active day', value: formatDate(recap.stats.mostActiveDay) },
                { label: 'Peak start time', value: formatHour(recap.stats.peakHour) },
              ].map((stat) => (
                <View
                  key={stat.label}
                  style={{
                    flexGrow: 1,
                    flexBasis: '46%',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.surfaceElevated,
                    padding: 12,
                  }}
                >
                  <Text style={{ fontSize: 20, fontWeight: '700', color: c.textPrimary }}>
                    {stat.value}
                  </Text>
                  <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                    {stat.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Daily activity — the same trailing 60 active days web charts. */}
            {recap.dailyActivity.length > 0 && (
              <View style={{ marginTop: 18 }}>
                <Text
                  style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary, marginBottom: 8 }}
                >
                  Activity
                </Text>
                <View
                  accessible
                  accessibilityLabel={`Conversation activity across ${recap.dailyActivity.length} active days`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    gap: 2,
                    height: 72,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.surfaceElevated,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                  }}
                >
                  {recap.dailyActivity.slice(-60).map((day) => (
                    <View
                      key={day.date}
                      style={{
                        flex: 1,
                        minHeight: 3,
                        height: `${Math.max(6, (day.conversationCount / maxDailyCount) * 100)}%`,
                        borderRadius: 2,
                        backgroundColor: c.teal,
                      }}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Topics */}
            {recap.topics.length > 0 && (
              <View style={{ marginTop: 18 }}>
                <Text
                  style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary, marginBottom: 8 }}
                >
                  What you worked on
                </Text>
                {recap.topics.map((topic) => (
                  <Card key={topic.id}>
                    <View style={{ padding: 14, gap: 6 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 14,
                            fontWeight: '600',
                            color: c.textPrimary,
                          }}
                        >
                          {topic.label}
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: c.teal }}>
                          {topic.percentage}%
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, lineHeight: 17, color: c.textSecondary }}>
                        {topic.description}
                      </Text>
                      <View
                        style={{
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: c.progressTrack,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            width: `${topic.percentage}%`,
                            height: '100%',
                            backgroundColor: c.teal,
                          }}
                        />
                      </View>
                    </View>
                  </Card>
                ))}
              </View>
            )}

            {/* Insights */}
            {recap.insights.length > 0 && (
              <View style={{ marginTop: 18 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>
                  Expanding your skills
                </Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, marginBottom: 8 }}>
                  Observations and optional next steps — not a performance score.
                </Text>
                {recap.insights.map((insight) => (
                  <Card key={insight.dimension}>
                    <View style={{ padding: 14, gap: 6 }}>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '600',
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          color: c.textMuted,
                        }}
                      >
                        {insight.dimension}
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: c.textPrimary }}>
                        {insight.title}
                      </Text>
                      <Text style={{ fontSize: 12, lineHeight: 17, color: c.textSecondary }}>
                        {insight.observation}
                      </Text>
                      <Text style={{ fontSize: 12, lineHeight: 17, color: c.textPrimary }}>
                        {insight.nextStep}
                      </Text>
                    </View>
                  </Card>
                ))}
              </View>
            )}

            {recap.sampled && (
              <Text style={{ fontSize: 11, lineHeight: 16, color: c.textMuted, marginTop: 14 }}>
                Activity, topic, and behavior patterns use the {recap.sampledConversationCount} most
                recent eligible conversations in this range. The conversation total is exact.
              </Text>
            )}
          </>
        )}

        <Text style={{ fontSize: 11, lineHeight: 16, color: c.textMuted, marginTop: 18 }}>
          Temporary Chats and AGI Work runs are excluded. Reflect returns activity statistics and
          broad topic labels — not message text — and viewing it does not use model quota.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
