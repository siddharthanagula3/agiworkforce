import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  View,
  type AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, BellOff, Bot, Cloud, RefreshCw } from 'lucide-react-native';
import { MOBILE_REMOTE_SCREEN_LABEL } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors } from '@/src/ui/theme';
import { CloudRunCard } from './components/CloudRunCard';
import { CloudRunDetailSheet } from './components/CloudRunDetailSheet';
import {
  cloudRunTitle,
  groupCloudRunsByRecency,
  isCloudRunSteerable,
  CLOUD_RUN_FILTERS,
} from './runPresentation';
import { useCloudTaskStore } from './store';
import { useCloudRunApprovalSignal } from './useApprovalSignal';

export const CLOUD_TASK_LIST_POLL_INTERVAL_MS = 15_000;

const SCREEN_TITLE = 'Cloud tasks';
const SCREEN_SUBTITLE = 'AGI Cloud';
const SCOPE_NOTE = `Every agent run on your AGI Cloud account, whichever surface started it. Pairing with a nearby desktop stays in ${MOBILE_REMOTE_SCREEN_LABEL}.`;
const BACKGROUND_ALERTS_OFF_NOTE =
  'Background approval alerts are off, so a task that pauses while the app is closed will wait silently.';

function Header({ onBack }: { onBack: () => void }) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        minHeight: 52,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        <ArrowLeft size={20} color={colors.textSecondary} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text variant="subheading" style={{ color: colors.textPrimary }}>
          {SCREEN_TITLE}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{SCREEN_SUBTITLE}</Text>
      </View>
      <View
        style={{
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 5,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: colors.accentSurface,
          borderWidth: 1,
          borderColor: colors.accentBorder,
        }}
      >
        <Cloud size={13} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>Cloud</Text>
      </View>
    </View>
  );
}

function CloudTasksGate({
  signedIn,
  onBack,
  onContinue,
}: {
  signedIn: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const colors = useThemeColors();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <Header onBack={onBack} />
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentSurface,
          }}
        >
          <Bot size={32} color={colors.textPrimary} />
        </View>
        <Text
          style={{
            marginTop: 20,
            color: colors.textPrimary,
            fontSize: 21,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          Tasks run in AGI Cloud
        </Text>
        <Text
          style={{
            marginTop: 9,
            color: colors.textSecondary,
            fontSize: 14,
            lineHeight: 21,
            textAlign: 'center',
          }}
        >
          Your on-device chats stay Local. Switch explicitly to see the durable runs on your Cloud
          account and answer anything blocking them.
        </Text>
        <Button
          title={signedIn ? 'Switch to AGI Cloud' : 'Sign in to AGI Cloud'}
          onPress={onContinue}
          size="lg"
          style={{ marginTop: 24, minWidth: 210 }}
        />
      </View>
    </SafeAreaView>
  );
}

function ScopeNote({ onOpenRemote }: { onOpenRemote: () => void }) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        borderRadius: 16,
        borderCurve: 'continuous',
        padding: 15,
        gap: 8,
        backgroundColor: colors.accentSurface,
        borderWidth: 1,
        borderColor: colors.accentBorder,
      }}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
        {SCOPE_NOTE}
      </Text>
      <Pressable
        onPress={onOpenRemote}
        accessibilityRole="button"
        accessibilityLabel={`Open ${MOBILE_REMOTE_SCREEN_LABEL}`}
        hitSlop={6}
        style={{ minHeight: 32, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700' }}>
          {`Open ${MOBILE_REMOTE_SCREEN_LABEL}`}
        </Text>
      </Pressable>
    </View>
  );
}

function BackgroundAlertsNote({ onOpenSettings }: { onOpenSettings: () => void }) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onOpenSettings}
      accessibilityRole="button"
      accessibilityLabel="Open notification settings"
      style={{
        borderRadius: 14,
        borderCurve: 'continuous',
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.warningSurface,
        borderWidth: 1,
        borderColor: colors.warningBorder,
      }}
    >
      <BellOff size={16} color={colors.agentWarning} />
      <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
        {BACKGROUND_ALERTS_OFF_NOTE}
      </Text>
    </Pressable>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        flex: 1,
        minHeight: 260,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <Bot size={32} color={colors.textMuted} />
      <Text
        variant="subheading"
        style={{ color: colors.textPrimary, textAlign: 'center', marginTop: 16 }}
      >
        {filtered ? 'No tasks match this filter' : 'No Cloud tasks yet'}
      </Text>
      <Text style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 7 }}>
        Start an AGI work or research turn on any surface. Its durable run shows up here.
      </Text>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <RefreshCw size={28} color={colors.agentError} />
      <Text
        variant="subheading"
        style={{ color: colors.textPrimary, textAlign: 'center', marginTop: 16 }}
      >
        Tasks could not be loaded
      </Text>
      <Text
        selectable
        style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 7 }}
      >
        {message}
      </Text>
      <Button title="Try again" variant="outline" onPress={onRetry} style={{ marginTop: 20 }} />
    </View>
  );
}

export function CloudTasksScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);
  const cloudUnlocked = useWaitlistStore((state) => state.cloudUnlocked);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const conversations = useChatStore((state) => state.conversations);
  const backgroundFetchEnabled = useSettingsStore((state) => state.backgroundFetchEnabled);

  const filter = useCloudTaskStore((state) => state.filter);
  const runs = useCloudTaskStore((state) => state.runs);
  const status = useCloudTaskStore((state) => state.status);
  const refreshing = useCloudTaskStore((state) => state.refreshing);
  const loadingMore = useCloudTaskStore((state) => state.loadingMore);
  const nextCursor = useCloudTaskStore((state) => state.nextCursor);
  const error = useCloudTaskStore((state) => state.error);
  const detail = useCloudTaskStore((state) => state.detail);
  const setFilter = useCloudTaskStore((state) => state.setFilter);
  const load = useCloudTaskStore((state) => state.load);
  const loadMore = useCloudTaskStore((state) => state.loadMore);
  const openRun = useCloudTaskStore((state) => state.openRun);
  const closeRun = useCloudTaskStore((state) => state.closeRun);
  const resolveApproval = useCloudTaskStore((state) => state.resolveApproval);
  const stopRun = useCloudTaskStore((state) => state.stopRun);
  const reset = useCloudTaskStore((state) => state.reset);

  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState ?? 'active');
  const isForeground = appState === 'active';
  const canLoad = FEATURES.cloudTasks && appMode === 'cloud' && cloudUnlocked;

  const titles = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.id, conversation.title])),
    [conversations],
  );
  const sections = useMemo(() => groupCloudRunsByRecency(runs), [runs]);
  const hasSteerableRuns = useMemo(() => runs.some(isCloudRunSteerable), [runs]);
  const detailTitle = detail?.run
    ? cloudRunTitle(
        detail.run,
        detail.run.conversationId ? titles.get(detail.run.conversationId) : undefined,
      )
    : SCREEN_TITLE;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => reset, [clerkUserId, reset]);

  useEffect(() => {
    if (!canLoad || !isForeground) return;
    void load('initial');
  }, [canLoad, clerkUserId, isForeground, load]);

  useEffect(() => {
    if (!canLoad || !isForeground || !hasSteerableRuns || detail !== null) return undefined;
    const timer = setInterval(() => void load('background'), CLOUD_TASK_LIST_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [canLoad, detail, hasSteerableRuns, isForeground, load]);

  const handleApprovalSignal = useCallback(() => {
    if (!canLoad) return;
    void load('background');
  }, [canLoad, load]);

  useCloudRunApprovalSignal(handleApprovalSignal);

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

  const handleOpenRemote = useCallback(() => {
    router.push('/(app)/companion' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleOpenNotificationSettings = useCallback(() => {
    router.push('/(app)/settings/notifications' as Parameters<typeof router.push>[0]);
  }, [router]);

  if (!FEATURES.cloudTasks) return <FeatureUnavailable feature="Cloud tasks" />;

  if (appMode !== 'cloud' || !cloudUnlocked) {
    return (
      <CloudTasksGate
        signedIn={cloudUnlocked}
        onBack={handleBack}
        onContinue={handleActivateCloud}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <Header onBack={handleBack} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}
      >
        {CLOUD_RUN_FILTERS.map((item) => {
          const selected = item.key === filter;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              accessibilityRole="button"
              accessibilityLabel={`Filter Cloud tasks: ${item.label}`}
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

      {status === 'loading' && runs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.textPrimary} />
          <Text style={{ color: colors.textMuted }}>Loading Cloud tasks…</Text>
        </View>
      ) : error && runs.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load('initial')} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(run) => run.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 40,
            gap: 10,
            flexGrow: 1,
          }}
          ListHeaderComponent={
            <View style={{ gap: 10, paddingBottom: 12 }}>
              <ScopeNote onOpenRemote={handleOpenRemote} />
              {backgroundFetchEnabled ? null : (
                <BackgroundAlertsNote onOpenSettings={handleOpenNotificationSettings} />
              )}
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                marginTop: 6,
              }}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <CloudRunCard
              run={item}
              title={cloudRunTitle(
                item,
                item.conversationId ? titles.get(item.conversationId) : undefined,
              )}
              onPress={(runId) => void openRun(runId)}
            />
          )}
          ListEmptyComponent={<EmptyState filtered={filter !== CLOUD_RUN_FILTERS[0].key} />}
          ListFooterComponent={
            nextCursor ? (
              <Pressable
                onPress={() => void loadMore()}
                disabled={loadingMore}
                accessibilityRole="button"
                accessibilityLabel="Load more Cloud tasks"
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load('refresh')}
              tintColor={colors.textPrimary}
              progressBackgroundColor={colors.surfaceElevated}
            />
          }
        />
      )}

      <CloudRunDetailSheet
        detail={detail}
        title={detailTitle}
        onClose={closeRun}
        onResolveApproval={(decision) => void resolveApproval(decision)}
        onStop={() => void stopRun()}
      />
    </SafeAreaView>
  );
}
