import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import type { AgentTaskState } from '@agiworkforce/types/protocol';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cloud,
  PauseCircle,
  RefreshCw,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { createMobileCloudAgentRunClient } from '@/services/streaming';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/src/features/auth/store';
import { getManagedDisplayName } from '@/src/features/model-picker/service';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

const ACTIVE_STATES: AgentTaskState[] = [
  'queued',
  'running',
  'paused',
  'awaiting_input',
  'ready_for_review',
];

const FILTERS = [
  { key: 'active', label: 'Active', states: ACTIVE_STATES },
  { key: 'needs-input', label: 'Needs input', states: ['awaiting_input'] },
  { key: 'ready-review', label: 'Ready for review', states: ['ready_for_review'] },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  states: readonly AgentTaskState[];
}>;

type TaskFilter = (typeof FILTERS)[number]['key'];

export const TASK_POLL_INTERVAL_MS = 15_000;

function statePresentation(state: AgentTaskState, colors: ColorScheme) {
  switch (state) {
    case 'awaiting_input':
      return { label: 'Awaiting input', color: colors.agentWarning, Icon: Clock3 };
    case 'ready_for_review':
      return { label: 'Ready for review', color: colors.agentSuccess, Icon: CheckCircle2 };
    case 'paused':
      return { label: 'Paused', color: colors.textMuted, Icon: PauseCircle };
    case 'queued':
      return { label: 'Queued', color: colors.textSecondary, Icon: Clock3 };
    default:
      return { label: 'Working', color: colors.agentActive, Icon: Bot };
  }
}

function fallbackTitle(run: CloudAgentRun): string {
  if (run.workMode === 'research') return 'Research task';
  if (run.workMode === 'agiwork') return 'AGI work task';
  return 'Cloud task';
}

function mergeRuns(current: CloudAgentRun[], incoming: CloudAgentRun[]): CloudAgentRun[] {
  const merged = new Map(current.map((run) => [run.id, run]));
  for (const run of incoming) merged.set(run.id, run);
  return [...merged.values()];
}

export default function TasksScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);
  const cloudUnlocked = useWaitlistStore((state) => state.cloudUnlocked);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const conversations = useChatStore((state) => state.conversations);
  const [filter, setFilter] = useState<TaskFilter>('active');
  const [runs, setRuns] = useState<CloudAgentRun[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState ?? 'active');
  const [resolvingRunId, setResolvingRunId] = useState<string | null>(null);
  const isCloudMode = appMode === 'cloud';
  const isForeground = appState === 'active';

  const selectedStates = useMemo(
    () => [...(FILTERS.find((item) => item.key === filter)?.states ?? ACTIVE_STATES)],
    [filter],
  );
  const titles = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.id, conversation.title])),
    [conversations],
  );

  const fetchRuns = useCallback(
    async (
      options: {
        append?: boolean;
        cursor?: string;
        signal?: AbortSignal;
      } = {},
    ) => {
      const account = captureCloudAccountEpoch();
      if (!account) return;
      const page = await createMobileCloudAgentRunClient().listRuns({
        states: selectedStates,
        limit: 25,
        ...(options.cursor ? { cursor: options.cursor } : {}),
        signal: options.signal,
      });
      if (options.signal?.aborted || !isCloudAccountEpochCurrent(account)) return;
      setRuns((current) => (options.append ? mergeRuns(current, page.runs) : page.runs));
      setNextCursor(page.nextCursor);
      setError(null);
    },
    [selectedStates],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setRuns([]);
    setNextCursor(null);
    setLoading(false);
    setLoadingMore(false);
    setRefreshing(false);
    setError(null);
  }, [clerkUserId]);

  useEffect(() => {
    if (!FEATURES.cloudTasks || !isCloudMode || !cloudUnlocked || !isForeground) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setRuns([]);
    setNextCursor(null);
    setError(null);
    void fetchRuns({ signal: controller.signal })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Cloud tasks could not be loaded');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [clerkUserId, cloudUnlocked, fetchRuns, isCloudMode, isForeground]);

  useEffect(() => {
    if (!FEATURES.cloudTasks || !isCloudMode || !cloudUnlocked || !isForeground) return undefined;

    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const poll = async () => {
      try {
        await fetchRuns({ signal: controller.signal });
      } catch {
        // Background refresh is best-effort. Keep the last durable list and
        // reserve visible errors for user-initiated loads/refreshes.
      } finally {
        if (!disposed) timeout = setTimeout(poll, TASK_POLL_INTERVAL_MS);
      }
    };

    timeout = setTimeout(poll, TASK_POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      controller.abort();
      if (timeout) clearTimeout(timeout);
    };
  }, [clerkUserId, cloudUnlocked, fetchRuns, isCloudMode, isForeground]);

  /**
   * Answer a run's outstanding approval from the phone.
   *
   * The point of a durable run is that the device that started it does not have
   * to be the device that unblocks it. One decision covers every pending call
   * because the server only accepts a complete decision set.
   */
  const handleResolveApproval = useCallback(
    async (run: CloudAgentRun, decision: 'approved' | 'rejected') => {
      const pending = run.pendingApproval;
      if (!pending) return;
      const account = captureCloudAccountEpoch();
      if (!account) return;
      setResolvingRunId(run.id);
      try {
        await createMobileCloudAgentRunClient().resumeRun(
          run.id,
          pending.toolCalls.map((call) => ({ toolCallId: call.toolCallId, decision })),
        );
      } catch (cause) {
        if (!isCloudAccountEpochCurrent(account)) return;
        setError(
          cause instanceof Error && cause.name === 'ManagedCloudAgentRunAlreadyResumingError'
            ? 'Another device already answered this approval'
            : cause instanceof Error && cause.name === 'ManagedCloudAgentRunApprovalExpiredError'
              ? 'This approval expired and the task cannot continue from it'
              : 'Your decision could not be sent',
        );
      } finally {
        if (isCloudAccountEpochCurrent(account)) setResolvingRunId(null);
        // Whether it worked or raced, the list is now stale.
        await fetchRuns().catch(() => undefined);
      }
    },
    [fetchRuns],
  );

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleActivateCloud = useCallback(() => {
    if (!cloudUnlocked) {
      router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
      return;
    }
    setAppMode('cloud');
  }, [cloudUnlocked, router, setAppMode]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchRuns();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cloud tasks could not be loaded');
    } finally {
      setRefreshing(false);
    }
  }, [fetchRuns]);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchRuns()
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Cloud tasks could not be loaded');
      })
      .finally(() => setLoading(false));
  }, [fetchRuns]);

  const handleLoadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    void fetchRuns({ append: true, cursor: nextCursor })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'More Cloud tasks could not be loaded');
      })
      .finally(() => setLoadingMore(false));
  }, [fetchRuns, loadingMore, nextCursor]);

  if (!FEATURES.cloudTasks) return <FeatureUnavailable feature="Cloud tasks" />;

  if (!isCloudMode || !cloudUnlocked) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Header onBack={handleBack} colors={colors} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.accentSurface,
            }}
          >
            <Cloud size={28} color={colors.textPrimary} />
          </View>
          <Text
            variant="heading"
            style={{ color: colors.textPrimary, marginTop: 20, textAlign: 'center' }}
          >
            Tasks run in AGI Cloud
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              marginTop: 8,
              textAlign: 'center',
              lineHeight: 21,
            }}
          >
            Your on-device chats stay Local. Switch explicitly to view only your durable Cloud agent
            runs.
          </Text>
          <Pressable
            onPress={handleActivateCloud}
            accessibilityRole="button"
            accessibilityLabel={cloudUnlocked ? 'Switch to AGI Cloud' : 'Sign in to AGI Cloud'}
            style={{
              minHeight: 52,
              minWidth: 220,
              marginTop: 24,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.textPrimary,
            }}
          >
            <Text style={{ color: colors.accentText, fontWeight: '700' }}>
              {cloudUnlocked ? 'Switch to AGI Cloud' : 'Sign in to AGI Cloud'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Header onBack={handleBack} colors={colors} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}
      >
        {FILTERS.map((item) => {
          const selected = item.key === filter;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              accessibilityRole="button"
              accessibilityLabel={`Filter tasks: ${item.label}`}
              accessibilityState={{ selected }}
              style={{
                height: 36,
                borderRadius: 18,
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? colors.textPrimary : colors.surfaceElevated,
                borderWidth: 1,
                borderColor: selected ? colors.textPrimary : colors.border,
              }}
            >
              <Text
                style={{
                  color: selected ? colors.accentText : colors.textSecondary,
                  fontSize: 13,
                  fontWeight: '600',
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading && runs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.textPrimary} />
          <Text style={{ color: colors.textMuted, marginTop: 12 }}>Loading Cloud tasks…</Text>
        </View>
      ) : error && runs.length === 0 ? (
        <ErrorState onRetry={handleRetry} colors={colors} />
      ) : runs.length === 0 ? (
        <EmptyState filter={filter} colors={colors} />
      ) : (
        <FlatList
          data={runs}
          keyExtractor={(run) => run.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 10 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.textPrimary}
            />
          }
          renderItem={({ item }) => {
            const title =
              (item.conversationId ? titles.get(item.conversationId) : undefined) ||
              fallbackTitle(item);
            return (
              <TaskCard
                run={item}
                title={title}
                colors={colors}
                onPress={
                  item.conversationId
                    ? () =>
                        router.push({
                          pathname: '/(app)/chat/[id]' as const,
                          params: { id: item.conversationId! },
                        })
                    : undefined
                }
                onResolveApproval={(decision) => void handleResolveApproval(item, decision)}
                resolving={resolvingRunId === item.id}
              />
            );
          }}
          ListFooterComponent={
            error ? (
              <Pressable
                onPress={() => void handleRefresh()}
                accessibilityRole="button"
                accessibilityLabel="Retry refreshing tasks"
                style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: colors.agentError }}>Could not refresh. Try again.</Text>
              </Pressable>
            ) : nextCursor ? (
              <Pressable
                onPress={handleLoadMore}
                disabled={loadingMore}
                accessibilityRole="button"
                accessibilityLabel="Load more tasks"
                style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                {loadingMore ? (
                  <ActivityIndicator color={colors.textPrimary} />
                ) : (
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Load more</Text>
                )}
              </Pressable>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function Header({ onBack, colors }: { onBack: () => void; colors: ColorScheme }) {
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 }}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        <ArrowLeft size={20} color={colors.textSecondary} />
      </Pressable>
      <View style={{ flex: 1, marginLeft: 4 }}>
        <Text variant="subheading" style={{ color: colors.textPrimary }}>
          Tasks
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>AGI Cloud</Text>
      </View>
    </View>
  );
}

function TaskCard({
  run,
  title,
  colors,
  onPress,
  onResolveApproval,
  resolving,
}: {
  run: CloudAgentRun;
  title: string;
  colors: ColorScheme;
  onPress?: () => void;
  onResolveApproval?: (decision: 'approved' | 'rejected') => void;
  resolving?: boolean;
}) {
  const presentation = statePresentation(run.state, colors);
  const Icon = presentation.Icon;
  const pendingApproval = run.state === 'awaiting_input' ? run.pendingApproval : undefined;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `Open task: ${title}` : undefined}
      style={{
        minHeight: 92,
        borderRadius: 16,
        padding: 16,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.neutralSurface,
          }}
        >
          <Icon size={18} color={presentation.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ color: colors.textPrimary, fontWeight: '600' }}>
            {title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
            <View
              style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: presentation.color }}
            />
            <Text style={{ color: presentation.color, fontSize: 12, fontWeight: '600' }}>
              {presentation.label}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              · {getManagedDisplayName(run.model)}
            </Text>
          </View>
        </View>
        {onPress ? <ChevronRight size={18} color={colors.textMuted} /> : null}
      </View>

      {pendingApproval && onResolveApproval ? (
        <View
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 13 }}>
            Waiting for your approval
          </Text>
          {pendingApproval.toolCalls.map((call) => (
            <View key={call.toolCallId} style={{ marginTop: 8 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 13 }} numberOfLines={1}>
                {call.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={2}>
                {call.argsPreview}
              </Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Pressable
              onPress={() => onResolveApproval('approved')}
              disabled={resolving}
              accessibilityRole="button"
              accessibilityLabel={`Approve task: ${title}`}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: resolving ? 0.5 : 1,
                backgroundColor: colors.textPrimary,
              }}
            >
              <Text style={{ color: colors.accentText, fontWeight: '700' }}>Approve</Text>
            </Pressable>
            <Pressable
              onPress={() => onResolveApproval('rejected')}
              disabled={resolving}
              accessibilityRole="button"
              accessibilityLabel={`Deny task: ${title}`}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: resolving ? 0.5 : 1,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Deny</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

function EmptyState({ filter, colors }: { filter: TaskFilter; colors: ColorScheme }) {
  const filtered = filter !== 'active';
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Bot size={32} color={colors.textMuted} />
      <Text
        variant="subheading"
        style={{ color: colors.textPrimary, textAlign: 'center', marginTop: 16 }}
      >
        {filtered ? 'No tasks match this filter' : 'No active Cloud tasks'}
      </Text>
      <Text style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 7 }}>
        Start an AGI work or research turn. Its durable state will appear here across devices.
      </Text>
    </View>
  );
}

function ErrorState({ onRetry, colors }: { onRetry: () => void; colors: ColorScheme }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <RefreshCw size={28} color={colors.agentError} />
      <Text
        variant="subheading"
        style={{ color: colors.textPrimary, textAlign: 'center', marginTop: 16 }}
      >
        Tasks could not be loaded
      </Text>
      <Text style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 7 }}>
        Your runs are still safe in AGI Cloud. Check your connection and try again.
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading tasks"
        style={{
          minHeight: 48,
          marginTop: 20,
          paddingHorizontal: 22,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.textPrimary,
        }}
      >
        <Text style={{ color: colors.accentText, fontWeight: '700' }}>Try again</Text>
      </Pressable>
    </View>
  );
}
