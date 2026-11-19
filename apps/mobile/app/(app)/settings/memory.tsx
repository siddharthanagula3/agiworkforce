import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Platform,
  View,
  TextInput,
  RefreshControl,
  ScrollView,
  SectionList,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  Ban,
  Brain,
  FileText,
  GitCompareArrows,
  Search,
  Trash2,
  X,
  Plus,
  Upload,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Skeleton } from '@/components/ui/Skeleton';
import { AddMemorySheet, MemoryItem } from '@/src/features/settings/components';
import { SettingsGroup, SettingsRow } from '@/src/features/settings/Common';
import { ScreenHeader } from '@/src/shared/components/cloud-screen';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { useMemoryStore, type MemoryEntry } from '@/src/features/memory/store';
import {
  DELETION_WARNING_MESSAGE,
  MemoryControlsCard,
} from '@/src/features/memory/components/MemoryControlsCard';
import { describeMemoryDeletion } from '@/src/features/memory/deleteConfirmation';
import {
  describeMemoryFreshness,
  groupMemoryFactsByTopic,
  type MemoryTopicGroup,
} from '@/src/features/memory/services/consolidation';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { useCloudMemoryStore } from '@/stores/memory/cloudMemoryStore';
import { useMemorySyncStateStore } from '@/stores/memory/memorySyncStateStore';
import { fetchPreferenceNamespace, patchPreferenceNamespace } from '@/services/preferences';
import { useThemeColors, type ColorScheme, elevation, zIndex, motion } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { fetchWorkspaceOverview } from '@/src/features/team/service';
import { useAuthStore } from '@/src/features/auth/store';
import {
  accountScopedUiStateKey,
  captureAccountScopedUiState,
  isAccountScopedUiStateCurrent,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';
import { contentColumn } from '@/src/shared/layout/contentColumn';

const FILTER_CATEGORIES = ['All', 'Pinned'] as const;

interface MemoryListSection {
  key: string;
  title: string;
  data: MemoryEntry[];
}

function describeMemoryScope(isCloud: boolean, workspaceName: string | null | undefined): string {
  if (!isCloud) return 'Stored on this device only.';
  if (workspaceName === undefined) return 'Saved to your AGI Cloud account.';
  if (workspaceName === null) {
    return 'Personal memories. Workspace memories stay in their workspace.';
  }
  return `${workspaceName} workspace memories, never used in personal chats.`;
}

function formatCount(n: number): string {
  if (n === 1) return '1 memory';
  return `${n} memories`;
}

const CAPABILITIES_NAMESPACE = 'capabilities';

type AccountMemoryCapability =
  'memory' | 'searchPastChats' | 'generateFromHistory' | 'includeSensitiveTopics';

export default function MemoryScreen() {
  const router = useRouter();
  const goBack = useGoBack('/(app)/settings');
  const colors = useThemeColors();
  const currentIsCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const localMemoryEnabled = useLocalSettingsStore((state) => state.memoryEnabled);
  const localReferencePastChats = useLocalSettingsStore((state) => state.referencePastChats);
  const localGenerateMemory = useLocalSettingsStore((state) => state.generateMemoryFromHistory);
  const setLocalMemoryEnabled = useLocalSettingsStore((state) => state.setMemoryEnabled);
  const setLocalReferencePastChats = useLocalSettingsStore((state) => state.setReferencePastChats);
  const setLocalGenerateMemory = useLocalSettingsStore(
    (state) => state.setGenerateMemoryFromHistory,
  );
  const localIncludeSensitive = useLocalSettingsStore((state) => state.includeSensitiveTopics);
  const setLocalIncludeSensitive = useLocalSettingsStore(
    (state) => state.setIncludeSensitiveTopics,
  );
  const cloudMemoryEnabled = useCloudSettingsStore((state) => state.memoryEnabled);
  const cloudReferencePastChats = useCloudSettingsStore((state) => state.referencePastChats);
  const cloudGenerateMemory = useCloudSettingsStore((state) => state.generateMemoryFromHistory);
  const setCloudMemoryEnabled = useCloudSettingsStore((state) => state.setMemoryEnabled);
  const setCloudReferencePastChats = useCloudSettingsStore((state) => state.setReferencePastChats);
  const setCloudGenerateMemory = useCloudSettingsStore(
    (state) => state.setGenerateMemoryFromHistory,
  );
  const cloudIncludeSensitive = useCloudSettingsStore((state) => state.includeSensitiveTopics);
  const setCloudIncludeSensitive = useCloudSettingsStore(
    (state) => state.setIncludeSensitiveTopics,
  );
  const memoryEnabled = currentIsCloud ? cloudMemoryEnabled : localMemoryEnabled;
  const referencePastChats = currentIsCloud ? cloudReferencePastChats : localReferencePastChats;
  const generateMemoryFromHistory = currentIsCloud ? cloudGenerateMemory : localGenerateMemory;
  const includeSensitiveTopics = currentIsCloud ? cloudIncludeSensitive : localIncludeSensitive;
  const saveAccountCapability = useCallback(
    (
      key: AccountMemoryCapability,
      value: boolean,
      previous: boolean,
      apply: (enabled: boolean) => void,
    ) => {
      apply(value);
      patchPreferenceNamespace(CAPABILITIES_NAMESPACE, { [key]: value })
        .then(() => {
          if (key === 'memory') useMemorySyncStateStore.getState().setAccountMemoryEnabled(value);
        })
        .catch(() => {
          apply(previous);
          Alert.alert(
            'Not saved',
            'This memory setting could not be saved to your account. Check your connection and try again.',
          );
        });
    },
    [],
  );
  const setMemoryEnabled = currentIsCloud
    ? (value: boolean) =>
        saveAccountCapability('memory', value, cloudMemoryEnabled, setCloudMemoryEnabled)
    : setLocalMemoryEnabled;
  const setReferencePastChats = currentIsCloud
    ? (value: boolean) =>
        saveAccountCapability(
          'searchPastChats',
          value,
          cloudReferencePastChats,
          setCloudReferencePastChats,
        )
    : setLocalReferencePastChats;
  const setGenerateMemoryFromHistory = currentIsCloud
    ? (value: boolean) =>
        saveAccountCapability(
          'generateFromHistory',
          value,
          cloudGenerateMemory,
          setCloudGenerateMemory,
        )
    : setLocalGenerateMemory;
  const setIncludeSensitiveTopics = currentIsCloud
    ? (value: boolean) =>
        saveAccountCapability(
          'includeSensitiveTopics',
          value,
          cloudIncludeSensitive,
          setCloudIncludeSensitive,
        )
    : setLocalIncludeSensitive;

  useEffect(() => {
    if (!currentIsCloud || !clerkUserId) return;
    let cancelled = false;
    fetchPreferenceNamespace(CAPABILITIES_NAMESPACE)
      .then((settings) => {
        if (cancelled) return;
        const stored = settings as Partial<Record<AccountMemoryCapability, unknown>>;
        const cloud = useCloudSettingsStore.getState();
        if (typeof stored.memory === 'boolean') cloud.setMemoryEnabled(stored.memory);
        else if (!cloud.memoryPolicyInitialized)
          useCloudSettingsStore.setState({ memoryEnabled: false });
        if (typeof stored.searchPastChats === 'boolean') {
          cloud.setReferencePastChats(stored.searchPastChats);
        }
        if (typeof stored.generateFromHistory === 'boolean') {
          cloud.setGenerateMemoryFromHistory(stored.generateFromHistory);
        }
        cloud.setIncludeSensitiveTopics(stored.includeSensitiveTopics === true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [clerkUserId, currentIsCloud]);

  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [editingMemory, setEditingMemory] = useState<MemoryEntry | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [deletionIncomplete, setDeletionIncomplete] = useState(false);

  const {
    entries,
    filteredEntries,
    loading,
    error,
    searchQuery,
    fetchMemories,
    addMemory,
    updateMemory,
    deleteMemory,
    resetMemories,
    togglePin,
    setSearchQuery,
    clearError,
    resetVisibleState,
  } = useMemoryStore();
  const screenScopeKey = accountScopedUiStateKey(
    captureAccountScopedUiState(currentIsCloud ? 'cloud' : 'local'),
  );
  const activeScopeRef = useRef<AccountScopedUiState | null>(null);
  const activeScopeKeyRef = useRef<string | null>(null);
  const editorScopeRef = useRef<AccountScopedUiState | null>(null);

  useLayoutEffect(() => {
    const nextScope = captureAccountScopedUiState(currentIsCloud ? 'cloud' : 'local');
    const nextKey = accountScopedUiStateKey(nextScope);
    if (activeScopeKeyRef.current !== nextKey) {
      resetVisibleState();
      setSearchText('');
      setActiveFilter('All');
      setEditingMemory(null);
      setAddSheetOpen(false);
      setDeletionIncomplete(false);
      editorScopeRef.current = null;
    }
    activeScopeRef.current = nextScope;
    activeScopeKeyRef.current = nextKey;
  }, [clerkUserId, currentIsCloud, resetVisibleState]);

  const isScopeCurrent = useCallback((captured = activeScopeRef.current) => {
    return isAccountScopedUiStateCurrent(
      captured,
      useChatAppModeStore.getState().appMode === 'cloud' ? 'cloud' : 'local',
    );
  }, []);

  useEffect(() => {
    if (screenScopeKey === 'unavailable') return;
    void fetchMemories();
  }, [fetchMemories, screenScopeKey]);

  useEffect(() => {
    if (!currentIsCloud || screenScopeKey === 'unavailable') return;
    return useCloudMemoryStore.subscribe((state, previous) => {
      if (state.entries !== previous.entries) void fetchMemories();
    });
  }, [currentIsCloud, fetchMemories, screenScopeKey]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5_000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  const memoryFreshness = useMemo(() => describeMemoryFreshness(entries), [entries]);

  const [workspaceName, setWorkspaceName] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setWorkspaceName(undefined);
    if (!currentIsCloud || screenScopeKey === 'unavailable') return;
    const controller = new AbortController();
    fetchWorkspaceOverview(controller.signal)
      .then((overview) => {
        if (controller.signal.aborted) return;
        if (!overview.activeWorkspaceId) {
          setWorkspaceName(null);
          return;
        }
        const active = overview.workspaces.find(
          (workspace) => workspace.id === overview.activeWorkspaceId,
        );
        setWorkspaceName(active?.name ?? overview.workspace?.name ?? 'active');
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [currentIsCloud, screenScopeKey]);

  const localConversations = useChatMessageStore((state) => state.conversations);
  const cloudConversations = useChatCloudMessageStore((state) => state.conversations);
  const conversationTitles = useMemo(() => {
    const conversations = currentIsCloud ? cloudConversations : localConversations;
    return new Map(conversations.map((conversation) => [conversation.id, conversation.title]));
  }, [cloudConversations, currentIsCloud, localConversations]);

  const displayedEntries = useMemo(() => {
    const source = searchQuery.trim() ? filteredEntries : entries;

    if (activeFilter === 'All') return source;

    return source.filter((e) => e.pinned);
  }, [entries, filteredEntries, searchQuery, activeFilter]);

  const topicGroups = useMemo<MemoryTopicGroup[] | null>(() => {
    if (activeFilter !== 'All' || searchQuery.trim()) return null;
    const groups = groupMemoryFactsByTopic(displayedEntries);
    return groups.length > 1 ? groups : null;
  }, [activeFilter, displayedEntries, searchQuery]);

  const handleSearchChange = useCallback(
    (text: string) => {
      if (!isScopeCurrent()) return;
      setSearchText(text);
      setSearchQuery(text);
    },
    [isScopeCurrent, setSearchQuery],
  );

  const handleClearSearch = useCallback(() => {
    if (!isScopeCurrent()) return;
    setSearchText('');
    setSearchQuery('');
  }, [isScopeCurrent, setSearchQuery]);

  const handleRefresh = useCallback(() => {
    if (!isScopeCurrent()) return;
    void fetchMemories();
  }, [fetchMemories, isScopeCurrent]);

  const handleTogglePin = useCallback(
    (id: string) => {
      if (!isScopeCurrent()) return;
      void togglePin(id);
    },
    [isScopeCurrent, togglePin],
  );

  const handleImportPress = useCallback(() => {
    router.push('/(app)/settings/memory-import' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleSummaryPress = useCallback(() => {
    router.push('/(app)/settings/memory-summary' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleConflictsPress = useCallback(() => {
    router.push('/(app)/settings/memory-conflicts' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleExclusionsPress = useCallback(() => {
    router.push('/(app)/settings/memory-exclusions' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleResetPress = useCallback(() => {
    const actionScope = activeScopeRef.current;
    if (!isScopeCurrent(actionScope)) return;
    Alert.alert(
      'Reset memory?',
      currentIsCloud
        ? `This permanently deletes every memory ${
            workspaceName
              ? `for the ${workspaceName} workspace`
              : workspaceName === null
                ? 'in your personal AGI Cloud memory'
                : 'in this AGI Cloud memory'
          }, on every device. Your chats are not deleted. This cannot be undone.`
        : 'This permanently deletes every memory saved on this device. Your chats are not deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset memory',
          style: 'destructive',
          onPress: async () => {
            if (!isScopeCurrent(actionScope)) return;
            const completed = await resetMemories();
            if (!isScopeCurrent(actionScope)) return;
            setDeletionIncomplete(!completed);
            if (!completed && Platform.OS === 'ios') {
              AccessibilityInfo.announceForAccessibility(DELETION_WARNING_MESSAGE);
            }
          },
        },
      ],
    );
  }, [currentIsCloud, isScopeCurrent, resetMemories, workspaceName]);

  const handleAddPress = useCallback(() => {
    const actionScope = activeScopeRef.current;
    if (!isScopeCurrent(actionScope)) return;
    editorScopeRef.current = actionScope;
    setEditingMemory(null);
    setAddSheetOpen(true);
  }, [isScopeCurrent]);

  const handleEdit = useCallback(
    (memory: MemoryEntry) => {
      const actionScope = activeScopeRef.current;
      if (!isScopeCurrent(actionScope)) return;
      editorScopeRef.current = actionScope;
      setEditingMemory(memory);
      setAddSheetOpen(true);
    },
    [isScopeCurrent],
  );

  const handleCloseEditor = useCallback(() => {
    editorScopeRef.current = null;
    setAddSheetOpen(false);
    setEditingMemory(null);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      const actionScope = editorScopeRef.current ?? activeScopeRef.current;
      if (!isScopeCurrent(actionScope)) return;
      void deleteMemory(id);
    },
    [deleteMemory, isScopeCurrent],
  );

  const handleSwipeDelete = useCallback(
    (id: string) => {
      const actionScope = activeScopeRef.current;
      if (!isScopeCurrent(actionScope)) return;
      const memory = entries.find((entry) => entry.id === id);
      if (!memory) return;
      Alert.alert('Delete memory?', describeMemoryDeletion(memory.fact, currentIsCloud), [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (!isScopeCurrent(actionScope)) return;
            void deleteMemory(id);
          },
        },
      ]);
    },
    [currentIsCloud, deleteMemory, entries, isScopeCurrent],
  );

  const handleOpenConversation = useCallback(
    (conversationId: string) => {
      router.push(`/(app)/chat/${conversationId}` as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const handleSave = useCallback(
    async (content: string, _category?: string) => {
      if (!isScopeCurrent(editorScopeRef.current)) return null;
      return (await addMemory(content)) ?? null;
    },
    [addMemory, isScopeCurrent],
  );

  const handleUpdate = useCallback(
    async (id: string, content: string) => {
      if (!isScopeCurrent(editorScopeRef.current)) return null;
      return (await updateMemory(id, content)) ?? null;
    },
    [isScopeCurrent, updateMemory],
  );

  // Stored entries stay listed, editable and deletable while memory is off: the
  // master switch stops the assistant using them, it does not lock the person
  // out of their own data. Dimming states that they are inert right now.
  const renderItem = useCallback(
    ({ item }: { item: MemoryEntry }) => (
      <View style={{ paddingHorizontal: 16, opacity: memoryEnabled ? 1 : 0.45 }}>
        <MemoryItem
          memory={item}
          conversationTitle={
            (item.source_conversation_id
              ? conversationTitles.get(item.source_conversation_id)
              : null) ??
            item.source_conversation_title ??
            null
          }
          onEdit={handleEdit}
          onDelete={handleSwipeDelete}
          onTogglePin={handleTogglePin}
          onOpenConversation={handleOpenConversation}
        />
      </View>
    ),
    [
      conversationTitles,
      handleEdit,
      handleOpenConversation,
      handleSwipeDelete,
      handleTogglePin,
      memoryEnabled,
    ],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: MemoryListSection }) =>
      section.title ? (
        <Text
          accessibilityRole="header"
          style={{
            color: colors.textMuted,
            fontSize: typeScale.caption,
            fontWeight: '700',
            textTransform: 'uppercase',
            paddingTop: 8,
            paddingBottom: 6,
            paddingHorizontal: 16,
            backgroundColor: colors.surfaceBase,
          }}
        >
          {section.title}
        </Text>
      ) : null,
    [colors.surfaceBase, colors.textMuted],
  );

  const keyExtractor = useCallback((item: MemoryEntry) => item.id, []);

  const listSections = useMemo<MemoryListSection[]>(() => {
    if (loading && entries.length === 0) return [];
    if (displayedEntries.length === 0) return [];
    return topicGroups ?? [{ key: 'all', title: '', data: displayedEntries }];
  }, [displayedEntries, entries.length, loading, topicGroups]);

  const listHeader = (
    <View>
      <MemoryControlsCard
        isCloud={currentIsCloud}
        memoryEnabled={memoryEnabled}
        referencePastChats={referencePastChats}
        generateMemoryFromHistory={generateMemoryFromHistory}
        includeSensitiveTopics={includeSensitiveTopics}
        onMemoryEnabledChange={setMemoryEnabled}
        onReferencePastChatsChange={setReferencePastChats}
        onGenerateMemoryFromHistoryChange={setGenerateMemoryFromHistory}
        onIncludeSensitiveTopicsChange={setIncludeSensitiveTopics}
        deletionWarning={
          deletionIncomplete
            ? { onTryAgain: handleResetPress, onDismiss: () => setDeletionIncomplete(false) }
            : null
        }
      />

      <View className="px-4">
        <SettingsGroup>
          <SettingsRow
            label="Memory summary"
            icon={FileText}
            {...(memoryFreshness ? { value: memoryFreshness } : {})}
            onPress={handleSummaryPress}
          />
          <SettingsRow
            label="Replaced memories"
            icon={GitCompareArrows}
            onPress={handleConflictsPress}
          />
          {currentIsCloud ? (
            <SettingsRow label="Never remember" icon={Ban} onPress={handleExclusionsPress} />
          ) : null}
          <SettingsRow
            label="Reset memory"
            icon={Trash2}
            onPress={handleResetPress}
            destructive
            isLast
          />
        </SettingsGroup>
      </View>

      <View className="px-4 mb-2 gap-0.5">
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
          {loading ? 'Loading…' : formatCount(entries.length)}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
          {describeMemoryScope(currentIsCloud, workspaceName)}
        </Text>
      </View>

      {!memoryEnabled ? (
        <View className="mx-4 mb-2 flex-row items-center gap-3">
          <Text style={{ flex: 1, color: colors.textSecondary, fontSize: typeScale.caption }}>
            Memory is off, so new memories can't be added or imported.
          </Text>
          <Pressable
            onPress={() => setMemoryEnabled(true)}
            accessibilityRole="button"
            accessibilityLabel="Turn on Memory"
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.caption, fontWeight: '600' }}
            >
              Turn on
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error && (
        <Animated.View entering={FadeIn.duration(motion.quick)} className="mx-4 mb-2">
          <View
            className="rounded-lg px-3 py-2"
            style={{
              backgroundColor: colors.dangerSurface,
              borderWidth: 1,
              borderColor: colors.dangerBorder,
            }}
          >
            <Text style={{ color: colors.agentError, fontSize: typeScale.caption }}>{error}</Text>
          </View>
        </Animated.View>
      )}

      <View
        style={{ opacity: memoryEnabled ? 1 : 0.45 }}
        accessibilityLabel={
          memoryEnabled ? undefined : 'Memory is off. Saved memories are not used in chats.'
        }
      >
        <View
          className="mx-4 mb-3 flex-row items-center gap-2 rounded-xl px-3 py-2"
          style={{
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Search size={16} color={colors.textMuted} />
          <TextInput
            className="flex-1 py-0"
            style={{ color: colors.textPrimary, fontSize: typeScale.subhead, letterSpacing: 0 }}
            placeholder="Search memories..."
            placeholderTextColor={colors.textMuted}
            value={searchText}
            onChangeText={handleSearchChange}
            selectionColor={colors.teal}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <Pressable
              onPress={handleClearSearch}
              hitSlop={14}
              className="p-0.5"
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={14} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        <View className="mb-3">
          <ScrollView
            keyboardShouldPersistTaps="handled"
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          >
            {FILTER_CATEGORIES.map((cat) => {
              const isActive = activeFilter === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setActiveFilter(cat)}
                  accessibilityLabel={`${cat} memories`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  className="px-3 py-1.5 rounded-full"
                  style={{
                    borderWidth: 1,
                    borderColor: isActive ? colors.accentBorder : colors.border,
                    backgroundColor: isActive ? colors.accentSurface : colors.surfaceElevated,
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? colors.textPrimary : colors.textSecondary,
                      fontSize: typeScale.caption,
                      fontWeight: '500',
                    }}
                  >
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <ScreenHeader
        title={currentIsCloud ? 'Cloud Memory' : 'Memory'}
        onBack={goBack}
        trailing={
          memoryEnabled ? (
            <Pressable
              onPress={handleImportPress}
              hitSlop={5}
              className="p-2 rounded-lg"
              style={({ pressed }) => ({
                backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
              })}
              accessibilityLabel="Import memories"
              accessibilityRole="button"
            >
              <Upload size={18} color={colors.textSecondary} />
            </Pressable>
          ) : undefined
        }
      />

      <SectionList
        testID="memory-list"
        sections={listSections}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={keyExtractor}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ ...contentColumn('reading'), paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          loading && entries.length === 0 ? (
            <LoadingSkeleton colors={colors} />
          ) : (
            <EmptyState
              hasSearch={searchText.length > 0}
              isPinnedFilter={activeFilter === 'Pinned'}
              memoryEnabled={memoryEnabled}
              colors={colors}
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={loading && entries.length > 0}
            onRefresh={handleRefresh}
            tintColor={colors.teal}
          />
        }
      />

      {!addSheetOpen && memoryEnabled ? (
        <View style={{ position: 'absolute', right: 24, bottom: 24, zIndex: zIndex.control }}>
          <Pressable
            onPress={handleAddPress}
            accessibilityRole="button"
            accessibilityLabel="Add memory"
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.black,
              borderWidth: 1,
              borderColor: colors.border,
              ...elevation.e3,
            }}
          >
            <Plus size={24} color={colors.white} />
          </Pressable>
        </View>
      ) : null}

      <AddMemorySheet
        editingMemory={editingMemory}
        onClose={handleCloseEditor}
        onDelete={handleDelete}
        onSave={handleSave}
        onUpdate={handleUpdate}
        open={addSheetOpen}
        isCloud={currentIsCloud}
      />
    </SafeAreaView>
  );
}

function LoadingSkeleton({ colors }: { colors: ColorScheme }) {
  return (
    <View className="px-4 gap-3 mt-2">
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          className="rounded-xl p-4 gap-2"
          style={{
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Skeleton width="100%" height={14} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="60%" height={14} />
          <View className="flex-row gap-2 mt-2">
            <Skeleton width={60} height={18} borderRadius={9} />
            <Skeleton width={48} height={18} borderRadius={9} />
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyState({
  hasSearch,
  isPinnedFilter,
  memoryEnabled,
  colors,
}: {
  hasSearch: boolean;
  isPinnedFilter: boolean;
  memoryEnabled: boolean;
  colors: ColorScheme;
}) {
  return (
    <View className="items-center justify-center px-8 pt-10">
      <View
        className="w-20 h-20 rounded-2xl items-center justify-center mb-4"
        style={{
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Brain size={36} color={colors.textMuted} />
      </View>
      <Text
        variant="subheading"
        className="text-center mb-1.5"
        style={{ color: colors.textPrimary }}
      >
        {hasSearch ? 'No results found' : isPinnedFilter ? 'No pinned memories' : 'No memories yet'}
      </Text>
      <Text
        className="text-center leading-5"
        style={{ color: colors.textMuted, fontSize: typeScale.subhead }}
      >
        {hasSearch
          ? 'Try a different search term'
          : isPinnedFilter
            ? 'Pin a memory to keep it at the top'
            : memoryEnabled
              ? 'Add notes manually or import from another app.'
              : 'Turn on Memory to add notes or import from another app.'}
      </Text>
    </View>
  );
}
