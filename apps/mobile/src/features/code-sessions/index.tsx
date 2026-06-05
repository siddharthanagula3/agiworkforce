import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  TextInput,
  View,
} from 'react-native';
import { DrawerActions } from '@react-navigation/native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  Code2,
  GitBranch,
  Menu,
  Monitor,
  MoreHorizontal,
  Plus,
  SendHorizontal,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { copyToClipboard } from '@/lib/clipboard';
import { useThemeColors } from '@/src/ui/theme';
import { CODE_SESSIONS, getCodeSessionById } from './data';
import { CodeSessionMoreMenu } from './components/CodeSessionMoreMenu';
import { EnvironmentOptionsSheet } from './components/EnvironmentOptionsSheet';
import { ModeSelectSheet } from './components/ModeSelectSheet';
import type { CodeSession, CodeSessionMode } from './types';

interface CodeSessionsScreenProps {
  archivedOnly?: boolean;
}

export function CodeSessionsScreen({ archivedOnly = false }: CodeSessionsScreenProps) {
  const c = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openDrawer = useOpenDrawer();
  const [environmentSheetVisible, setEnvironmentSheetVisible] = useState(false);

  const idleSessions = useMemo(
    () => CODE_SESSIONS.filter((session) => session.status !== 'archived'),
    [],
  );
  const archivedSessions = useMemo(
    () => CODE_SESSIONS.filter((session) => session.status === 'archived'),
    [],
  );
  const hasAnySessions = idleSessions.length > 0 || archivedSessions.length > 0;

  const openSession = useCallback(
    (id: string) => {
      router.push(`/(app)/code/${id}` as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const openDesktop = useCallback(() => {
    router.push('/(app)/companion' as Parameters<typeof router.push>[0]);
  }, [router]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      <View className="h-16 justify-center px-4">
        <Pressable
          testID="code-open-drawer"
          onPress={openDrawer}
          className="absolute left-4 w-12 h-12 rounded-full items-center justify-center border active:opacity-80"
          style={{ backgroundColor: c.surfaceElevated, borderColor: c.border }}
          accessibilityLabel="Open navigation drawer"
          accessibilityRole="button"
        >
          <Menu size={25} color={c.textSecondary} />
        </Pressable>
        <Text className="text-center text-[20px] font-semibold" style={{ color: c.textPrimary }}>
          Code
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 34, paddingBottom: 120 }}
        showsVerticalScrollIndicator={archivedOnly}
      >
        {hasAnySessions ? (
          <>
            {!archivedOnly ? (
              <CodeSessionSection title="Idle" sessions={idleSessions} onPress={openSession} />
            ) : null}
            <CodeSessionSection
              title="Archived"
              sessions={archivedSessions}
              onPress={openSession}
            />
          </>
        ) : (
          <CodeSessionsEmptyState />
        )}
      </ScrollView>

      <Pressable
        testID="code-new-session"
        onPress={() => setEnvironmentSheetVisible(true)}
        className="absolute right-6 w-16 h-16 rounded-full items-center justify-center active:opacity-85"
        style={{
          bottom: insets.bottom + 24,
          backgroundColor: c.textPrimary,
        }}
        accessibilityLabel="Start code session"
        accessibilityRole="button"
      >
        <Plus size={34} color={c.black} />
      </Pressable>

      <EnvironmentOptionsSheet
        visible={environmentSheetVisible}
        onClose={() => setEnvironmentSheetVisible(false)}
        onOpenDesktop={openDesktop}
      />
    </SafeAreaView>
  );
}

export function ArchivedCodeSessionsScreen() {
  return <CodeSessionsScreen archivedOnly />;
}

function CodeSessionSection({
  title,
  sessions,
  onPress,
}: {
  title: string;
  sessions: CodeSession[];
  onPress: (id: string) => void;
}) {
  const c = useThemeColors();

  if (sessions.length === 0) return null;

  return (
    <View className="mb-9">
      <Text className="text-[19px] mb-5" style={{ color: c.textMuted }}>
        {title}
      </Text>
      {sessions.map((session) => (
        <CodeSessionRow key={session.id} session={session} onPress={onPress} />
      ))}
    </View>
  );
}

function CodeSessionRow({
  session,
  onPress,
}: {
  session: CodeSession;
  onPress: (id: string) => void;
}) {
  const c = useThemeColors();
  const Icon = session.environment === 'desktop' ? Monitor : Cloud;
  const statusLabel =
    session.status === 'disconnected' || session.status === 'archived'
      ? 'Disconnected'
      : session.lastActivityLabel;
  const subtitle =
    session.status === 'disconnected' || session.status === 'archived'
      ? `${statusLabel} - ${session.repo}`
      : session.repo;

  return (
    <Pressable
      testID={`code-session-row-${session.id}`}
      onPress={() => onPress(session.id)}
      className="flex-row items-center gap-3 py-3 active:opacity-75"
      accessibilityRole="button"
      accessibilityLabel={`Open code session ${session.title}`}
    >
      <View className="flex-1">
        <Text
          className="text-[22px] leading-[27px]"
          style={{ color: c.textPrimary }}
          numberOfLines={1}
        >
          {session.title}
        </Text>
        <View className="flex-row items-center gap-2 mt-1">
          <Icon size={20} color={c.textMuted} />
          <Text
            className="text-[18px] leading-[22px] flex-1"
            style={{ color: c.textMuted }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>
      </View>
      <ChevronRight size={28} color={c.textMuted} />
    </Pressable>
  );
}

export function CodeSessionDetailScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const sessionId = Array.isArray(params.id) ? params.id[0] : params.id;
  const session = getCodeSessionById(sessionId);
  const insets = useSafeAreaInsets();
  const [selectedMode, setSelectedMode] = useState<CodeSessionMode>(session?.mode ?? 'code');
  const [modeSheetVisible, setModeSheetVisible] = useState(false);
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);
  const [environmentSheetVisible, setEnvironmentSheetVisible] = useState(false);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/code' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const openDesktop = useCallback(() => {
    router.push('/(app)/companion' as Parameters<typeof router.push>[0]);
  }, [router]);

  const copyBranch = useCallback(async () => {
    if (!session) return;
    await copyToClipboard(session.branch);
    setMoreMenuVisible(false);
  }, [session]);

  const shareSession = useCallback(async () => {
    if (!session) return;
    setMoreMenuVisible(false);
    await Share.share({
      title: session.title,
      message: `${session.title}\n${session.repo}\n${session.branch}`,
    });
  }, [session]);

  const renameSession = useCallback(() => {
    setMoreMenuVisible(false);
    Alert.alert(
      'Rename on Desktop',
      'Mobile can preview this session. Rename it from AGI Desktop.',
    );
  }, []);

  const archiveSession = useCallback(() => {
    setMoreMenuVisible(false);
    router.push('/(app)/code/archived' as Parameters<typeof router.push>[0]);
  }, [router]);

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
        <View className="h-[74px] justify-center px-4">
          <Pressable
            onPress={goBack}
            className="absolute left-4 w-12 h-12 rounded-full items-center justify-center border active:opacity-80"
            style={{ backgroundColor: c.surfaceElevated, borderColor: c.border }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={31} color={c.textPrimary} />
          </Pressable>
        </View>
        <View testID="code-session-not-found" className="flex-1 items-center justify-center px-8">
          <View
            className="w-16 h-16 rounded-full items-center justify-center mb-5"
            style={{ backgroundColor: c.surfaceElevated }}
          >
            <GitBranch size={28} color={c.textSecondary} />
          </View>
          <Text
            className="text-[18px] font-semibold text-center mb-2"
            style={{ color: c.textPrimary }}
          >
            Session unavailable
          </Text>
          <Text className="text-[14px] text-center leading-[20px]" style={{ color: c.textMuted }}>
            This code session could not be found. It may have been removed or is no longer
            accessible.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      <View className="h-[74px] justify-center px-4">
        <Pressable
          onPress={goBack}
          className="absolute left-4 w-12 h-12 rounded-full items-center justify-center border active:opacity-80"
          style={{ backgroundColor: c.surfaceElevated, borderColor: c.border }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ChevronLeft size={31} color={c.textPrimary} />
        </Pressable>

        <View className="px-16">
          <Text
            className="text-center text-[19px] leading-[23px] font-semibold"
            style={{ color: c.textPrimary }}
            numberOfLines={1}
          >
            {session.title}
          </Text>
          <Text
            className="text-center text-[15px] leading-[19px]"
            style={{ color: c.textMuted }}
            numberOfLines={1}
          >
            {shortRepo(session.repo)} - {session.lastActivityLabel}
          </Text>
        </View>

        <Pressable
          testID="code-more-button"
          onPress={() => setMoreMenuVisible(true)}
          className="absolute right-4 w-12 h-12 rounded-full items-center justify-center border active:opacity-80"
          style={{ backgroundColor: c.surfaceElevated, borderColor: c.border }}
          accessibilityLabel="More code session actions"
          accessibilityRole="button"
        >
          <MoreHorizontal size={26} color={c.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {session.transcript.length > 0 ? (
          <View className="gap-5 pt-12">
            {session.transcript.map((line, index) => (
              <TranscriptBlock key={`${session.id}-${index}`} line={line} index={index} />
            ))}
          </View>
        ) : (
          <View className="min-h-[420px]" />
        )}
      </ScrollView>

      <View
        className="mx-4 rounded-[26px] border p-2"
        style={{
          marginBottom: insets.bottom + 8,
          backgroundColor: c.surfaceElevated,
          borderColor: c.border,
        }}
      >
        <View
          className="h-14 rounded-[22px] flex-row items-center px-5 gap-3"
          style={{ backgroundColor: c.black }}
        >
          <ActivityIndicator size="small" color={c.textMuted} />
          <Text className="text-[16px]" style={{ color: c.textSecondary }}>
            Connecting
          </Text>
        </View>

        <TextInput
          placeholder="Add feedback..."
          placeholderTextColor={c.textMuted}
          multiline
          className="min-h-[74px] px-3 pt-5 text-[22px]"
          style={{ color: c.textPrimary }}
          accessibilityLabel="Code session feedback"
        />

        <View className="flex-row items-center justify-between px-3 pb-2">
          <Pressable
            testID="code-mode-button"
            onPress={() => setModeSheetVisible(true)}
            className="flex-row items-center gap-2 py-2 pr-3 active:opacity-80"
            accessibilityLabel="Select code mode"
            accessibilityRole="button"
          >
            <Code2 size={27} color={c.textPrimary} />
            <Text className="text-[17px] font-semibold" style={{ color: c.textPrimary }}>
              {modeLabel(selectedMode)}
            </Text>
          </Pressable>

          <View className="flex-row items-center gap-5">
            <Pressable
              onPress={() => setEnvironmentSheetVisible(true)}
              className="w-10 h-10 items-center justify-center rounded-full active:opacity-80"
              accessibilityLabel="Open environment options"
              accessibilityRole="button"
            >
              <Plus size={34} color={c.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() => setEnvironmentSheetVisible(true)}
              className="w-12 h-12 items-center justify-center rounded-full active:opacity-80"
              style={{ backgroundColor: c.terraCotta }}
              accessibilityLabel="Connect environment before sending feedback"
              accessibilityRole="button"
            >
              <SendHorizontal size={25} color={c.textPrimary} />
            </Pressable>
          </View>
        </View>
      </View>

      <ModeSelectSheet
        visible={modeSheetVisible}
        selectedMode={selectedMode}
        onSelect={setSelectedMode}
        onClose={() => setModeSheetVisible(false)}
      />

      <CodeSessionMoreMenu
        visible={moreMenuVisible}
        session={session}
        onClose={() => setMoreMenuVisible(false)}
        onCopyBranch={copyBranch}
        onShare={shareSession}
        onRename={renameSession}
        onArchive={archiveSession}
      />

      <EnvironmentOptionsSheet
        visible={environmentSheetVisible}
        onClose={() => setEnvironmentSheetVisible(false)}
        onOpenDesktop={openDesktop}
      />
    </SafeAreaView>
  );
}

function CodeSessionsEmptyState() {
  const c = useThemeColors();
  return (
    <View
      testID="code-sessions-empty-state"
      className="flex-1 items-center justify-center py-20 px-8"
    >
      <View
        className="w-16 h-16 rounded-full items-center justify-center mb-5"
        style={{ backgroundColor: c.surfaceElevated }}
      >
        <GitBranch size={28} color={c.textSecondary} />
      </View>
      <Text className="text-[18px] font-semibold text-center mb-2" style={{ color: c.textPrimary }}>
        No code sessions yet
      </Text>
      <Text className="text-[14px] text-center leading-[20px]" style={{ color: c.textMuted }}>
        Start a new session to run code on AGI Desktop or AGI Cloud environments.
      </Text>
    </View>
  );
}

function TranscriptBlock({ line, index }: { line: string; index: number }) {
  const c = useThemeColors();
  const isCommand = line.startsWith('Bash ');

  if (isCommand) {
    return (
      <View
        className="rounded-xl border px-4 py-3"
        style={{ backgroundColor: c.surfaceElevated, borderColor: c.border }}
      >
        <Text className="text-[15px] leading-[24px]" style={{ color: c.textSecondary }}>
          <Text className="font-semibold" style={{ color: c.textPrimary }}>
            Bash
          </Text>{' '}
          {line.replace(/^Bash /, '')}
        </Text>
      </View>
    );
  }

  return (
    <Text
      className="text-[25px] leading-[37px]"
      style={{ color: index === 0 ? c.textSecondary : c.textPrimary }}
    >
      {line}
    </Text>
  );
}

function modeLabel(mode: CodeSessionMode): string {
  return mode === 'plan' ? 'Plan' : 'Code';
}

function shortRepo(repo: string): string {
  const parts = repo.split('/');
  return parts[1] ?? repo;
}

function useOpenDrawer() {
  const navigation = useNavigation();

  return useCallback(() => {
    const parent = navigation.getParent?.();
    if (parent) {
      parent.dispatch(DrawerActions.openDrawer());
      return;
    }
    navigation.dispatch(DrawerActions.openDrawer());
  }, [navigation]);
}

export default CodeSessionsScreen;
