import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, ArrowUpDown, Check, Code2, Plus, RefreshCw, Search } from 'lucide-react-native';
import type { CloudCodeSession } from '@agiworkforce/types';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { BottomSearchBar } from '@/src/shared/components/BottomSearchBar';
import {
  FLOATING_PRIMARY_ACTION_LIST_PADDING,
  FloatingPrimaryAction,
} from '@/src/shared/components/FloatingPrimaryAction';
import { useTheme, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { CloudCodeGate } from './components/CloudCodeGate';
import { CodeDevicesSection, CodeListSectionHeading } from './components/CodeDevicesSection';
import { CodeSessionListRow } from './components/CodeSessionListRow';
import { useComputerCodeSessions } from './components/useComputerCodeSessions';
import { codeSessionHref } from '@/src/features/companion/components/CodeSessionsCard';
import { NewCloudCodeSessionSheet } from './components/NewCloudCodeSessionSheet';
import { useCloudCodeAccess } from './useCloudCodeAccess';
import { useCloudCodeSessions } from './useCloudCodeSessions';
import {
  CLOUD_CODE_DEFAULT_SESSION_SORT,
  CLOUD_CODE_DEFAULT_SESSION_VIEW,
  CLOUD_CODE_SCREEN_TITLE,
  CLOUD_CODE_SESSION_SORTS,
  CLOUD_CODE_SESSION_SORT_LABELS,
  CLOUD_CODE_SESSION_VIEWS,
  CLOUD_CODE_SESSION_VIEW_LABELS,
  cloudCodeViewStatusFilter,
  visibleCodeListEntries,
  type CodeListEntry,
  type CloudCodeSessionSort,
  type CloudCodeSessionView,
} from './presentation';

function Header({
  onBack,
  sort,
  sortOpen,
  onToggleSort,
}: {
  onBack: () => void;
  sort: CloudCodeSessionSort;
  sortOpen: boolean;
  onToggleSort: () => void;
}) {
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
      <PressableBox
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <ArrowLeft size={20} color={colors.textSecondary} />
      </PressableBox>
      <Text
        variant="subheading"
        accessibilityRole="header"
        style={{ flex: 1, color: colors.textPrimary }}
      >
        {CLOUD_CODE_SCREEN_TITLE}
      </Text>
      <PressableBox
        onPress={onToggleSort}
        accessibilityRole="button"
        accessibilityLabel={`Sort sessions: ${CLOUD_CODE_SESSION_SORT_LABELS[sort]}`}
        accessibilityState={{ expanded: sortOpen }}
        hitSlop={8}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <ArrowUpDown size={20} color={sortOpen ? colors.textPrimary : colors.textSecondary} />
      </PressableBox>
    </View>
  );
}

function SortOptions({
  value,
  onChange,
}: {
  value: CloudCodeSessionSort;
  onChange: (value: CloudCodeSessionSort) => void;
}) {
  const colors = useThemeColors();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Sort sessions"
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
        overflow: 'hidden',
      }}
    >
      {CLOUD_CODE_SESSION_SORTS.map((key, index) => {
        const selected = key === value;
        return (
          <PressableBox
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="radio"
            accessibilityLabel={CLOUD_CODE_SESSION_SORT_LABELS[key]}
            accessibilityState={{ checked: selected }}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>
              {CLOUD_CODE_SESSION_SORT_LABELS[key]}
            </Text>
            {selected ? <Check size={18} color={colors.textPrimary} /> : null}
          </PressableBox>
        );
      })}
    </View>
  );
}

function EmptyState({ searching, filtered }: { searching: boolean; filtered: boolean }) {
  const colors = useThemeColors();
  const narrowed = searching || filtered;
  const Icon = searching ? Search : Code2;

  return (
    <View style={{ minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Icon size={32} color={colors.textMuted} />
      <Text
        variant="subheading"
        style={{ color: colors.textPrimary, textAlign: 'center', marginTop: 16 }}
      >
        {searching
          ? 'No sessions match your search'
          : filtered
            ? 'No sessions match this filter'
            : 'No sessions yet'}
      </Text>
      <Text style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 7 }}>
        {narrowed
          ? 'Try a different title, repository or branch.'
          : 'Start one with New session, on the web or in the desktop app.'}
      </Text>
    </View>
  );
}

const CLOUD_LIST_FAILED = 'Cloud sessions could not be loaded';

function computerWaitingLine(computerName: string | null): string {
  return `Asking ${computerName ?? 'your computer'} for its sessions`;
}

function CloudListFailedLine({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();

  return (
    <PressableBox
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel={`${message} Try again`}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}
    >
      <Text
        accessibilityRole="alert"
        style={{ color: colors.agentError, fontSize: typeScale.footnote, lineHeight: 19 }}
      >
        {`${message} `}
        <Text
          style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '700' }}
        >
          Try again
        </Text>
      </Text>
    </PressableBox>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();

  return (
    <View style={{ minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <RefreshCw size={28} color={colors.agentError} />
      <Text
        variant="subheading"
        style={{ color: colors.textPrimary, textAlign: 'center', marginTop: 16 }}
      >
        {CLOUD_LIST_FAILED}
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

function SessionList({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const pageBackground = isDark ? colors.background : colors.surfaceBase;
  const [view, setView] = useState<CloudCodeSessionView>(CLOUD_CODE_DEFAULT_SESSION_VIEW);
  const [sort, setSort] = useState<CloudCodeSessionSort>(CLOUD_CODE_DEFAULT_SESSION_SORT);
  const [sortOpen, setSortOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { status, sessions, availability, runtimes, error, refreshing, load } =
    useCloudCodeSessions(cloudCodeViewStatusFilter(view));
  const computer = useComputerCodeSessions();
  const visibleSessions = useMemo(
    () => visibleCodeListEntries(sessions, computer.sessions, { view, sort, query }),
    [sessions, computer.sessions, view, sort, query],
  );
  const searching = query.trim().length > 0;
  const loadRef = useRef(load);
  loadRef.current = load;
  const refreshComputerRef = useRef(computer.refresh);
  refreshComputerRef.current = computer.refresh;
  const focusedOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      void loadRef.current('background');
      refreshComputerRef.current();
    }, []),
  );

  const handleOpen = useCallback(
    (entry: CodeListEntry) => {
      if (entry.kind === 'computer') {
        router.push(
          codeSessionHref(entry.session.rootId, entry.session.threadId) as Parameters<
            typeof router.push
          >[0],
        );
        return;
      }
      router.push({
        pathname: '/(app)/cloud-code/[sessionId]',
        params: { sessionId: entry.session.id },
      } as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const [newSessionOpen, setNewSessionOpen] = useState(false);

  const handleCreated = useCallback(
    (session: CloudCodeSession, goal: string) => {
      setNewSessionOpen(false);
      void load('background');
      router.push({
        pathname: '/(app)/cloud-code/[sessionId]',
        params: { sessionId: session.id, goal },
      } as Parameters<typeof router.push>[0]);
    },
    [load, router],
  );

  const handleCreatedInBackground = useCallback(() => {
    void load('background');
  }, [load]);

  const handleStartedOnComputer = useCallback(
    (rootId: string, threadId: string) => {
      setNewSessionOpen(false);
      router.push(codeSessionHref(rootId, threadId) as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const refreshComputer = computer.refresh;
  const handleRefresh = useCallback(() => {
    void load('refresh');
    refreshComputer();
  }, [load, refreshComputer]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: pageBackground }}>
      <Header
        onBack={onBack}
        sort={sort}
        sortOpen={sortOpen}
        onToggleSort={() => setSortOpen((open) => !open)}
      />
      {sortOpen ? (
        <SortOptions
          value={sort}
          onChange={(next) => {
            setSort(next);
            setSortOpen(false);
          }}
        />
      ) : null}
      <NewCloudCodeSessionSheet
        visible={newSessionOpen}
        availability={availability}
        runtimes={runtimes}
        onClose={() => setNewSessionOpen(false)}
        onCreated={handleCreated}
        onCreatedInBackground={handleCreatedInBackground}
        onStartedOnComputer={handleStartedOnComputer}
      />

      <FlatList
        data={visibleSessions}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(entry) => entry.id}
        renderItem={({ item }) => (
          <CodeSessionListRow
            entry={item}
            computerName={computer.computerName}
            computerConnected={computer.connected}
            onOpen={handleOpen}
          />
        )}
        contentContainerStyle={{
          paddingHorizontal: 4,
          paddingBottom: FLOATING_PRIMARY_ACTION_LIST_PADDING,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View style={{ paddingTop: 4, paddingBottom: 8, gap: 8 }}>
            <CodeDevicesSection />
            <CodeListSectionHeading>Sessions</CodeListSectionHeading>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingBottom: 4 }}
            >
              {CLOUD_CODE_SESSION_VIEWS.map((key) => {
                const selected = key === view;
                return (
                  <PressableBox
                    key={key}
                    onPress={() => setView(key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter sessions: ${CLOUD_CODE_SESSION_VIEW_LABELS[key]}`}
                    accessibilityState={{ selected }}
                    hitSlop={4}
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
                        fontSize: typeScale.footnote,
                        fontWeight: '600',
                      }}
                    >
                      {CLOUD_CODE_SESSION_VIEW_LABELS[key]}
                    </Text>
                  </PressableBox>
                );
              })}
            </ScrollView>
            {error && status !== 'error' ? (
              <Text
                accessibilityRole="alert"
                style={{
                  color: colors.agentError,
                  fontSize: typeScale.footnote,
                  lineHeight: 19,
                  paddingHorizontal: 12,
                }}
              >
                {error}
              </Text>
            ) : null}
            {status === 'error' && visibleSessions.length > 0 ? (
              <CloudListFailedLine
                message={error ?? CLOUD_LIST_FAILED}
                onRetry={() => void load('initial')}
              />
            ) : null}
            {computer.waiting ? (
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: typeScale.footnote,
                  lineHeight: 19,
                  paddingHorizontal: 12,
                }}
              >
                {computerWaitingLine(computer.computerName)}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          status === 'loading' ? (
            <View
              style={{ minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: 12 }}
            >
              <LoadingIndicator />
              <Text style={{ color: colors.textMuted }}>Loading cloud sessions</Text>
            </View>
          ) : status === 'error' ? (
            <ErrorState message={error ?? CLOUD_LIST_FAILED} onRetry={() => void load('initial')} />
          ) : (
            <EmptyState searching={searching} filtered={view !== CLOUD_CODE_DEFAULT_SESSION_VIEW} />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textPrimary}
            progressBackgroundColor={colors.surfaceElevated}
          />
        }
      />

      <FloatingPrimaryAction
        testID="cloud-code-new-session"
        label="New session"
        icon={Plus}
        accessibilityLabel="New cloud session"
        tone="ink"
        onPress={() => setNewSessionOpen(true)}
      />

      <BottomSearchBar
        testID="cloud-code-search"
        value={query}
        onChangeText={setQuery}
        placeholder="Search sessions"
        accessibilityLabel="Search sessions"
        clearAccessibilityLabel="Clear session search"
      />
    </SafeAreaView>
  );
}

export function CloudCodeSessionsScreen() {
  const router = useRouter();
  const access = useCloudCodeAccess();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  if (!access.ready) {
    return (
      <CloudCodeGate signedIn={access.signedIn} onBack={handleBack} onContinue={access.activate} />
    );
  }

  return <SessionList key={access.accountKey} onBack={handleBack} />;
}
