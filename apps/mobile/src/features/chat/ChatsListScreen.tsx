import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  TextInput,
  View,
  type SectionListData,
} from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Code2,
  Compass,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  MessageSquare,
  Pin,
  ChevronRight,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Star,
  SquarePen,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { PressableBox } from '@/components/ui/pressable-box';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { BottomSearchBar } from '@/src/shared/components/BottomSearchBar';
import { DrawerButton } from '@/src/shared/components/DrawerButton';
import {
  FloatingPrimaryAction,
  FLOATING_PRIMARY_ACTION_LIST_PADDING,
} from '@/src/shared/components/FloatingPrimaryAction';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useChatStore } from '@/stores/chatStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import {
  InlineRenameField,
  RenameConversationModal,
  useConversationActions,
} from '@/src/features/conversation-actions';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useAuthStore } from '@/src/features/auth/store';
import {
  executionModeForConversation,
  isHistoryVisibleConversation,
} from '@/src/features/chat/utils/conversationMode';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import {
  accentColorForKind,
  formatAgeLabel,
  mergeMobileArtifactsForGallery,
  useArtifactStore,
} from '@/src/features/artifacts/store';
import { collectGeneratedImages } from '@/src/features/library/collectGeneratedImages';
import { contentColumn } from '@/src/shared/layout/contentColumn';
import {
  buildMobileGlobalSearchGroups,
  collectSearchableMobileFiles,
  searchMobileDestinations,
  type MobileGlobalSearchResult,
} from '@/src/features/search';
import type { ConversationGroup, ConversationSummary } from '@/types/chat';
import { TIME_GROUPS } from '@/lib/constants';

type ChatListFilter = 'all' | 'pinned' | 'unread';
type SearchKind = 'chat' | 'destination' | 'project' | 'file' | 'library' | 'artifact';

const SEARCH_KIND_ICONS: Record<SearchKind, LucideIcon> = {
  chat: MessageSquare,
  destination: Compass,
  project: FolderOpen,
  file: FileText,
  library: ImageIcon,
  artifact: Code2,
};

interface ChatsListItem extends MobileGlobalSearchResult {
  kind: SearchKind;
  pinned?: boolean;
  starred?: boolean;
  unread?: boolean;
}

type ChatsListSection = SectionListData<ChatsListItem, { title: string }>;

const FILTER_LABELS: Record<ChatListFilter, string> = {
  all: 'All chats',
  pinned: 'Pinned',
  unread: 'Unread',
};

function groupHistory(conversations: ReadonlyArray<ConversationSummary>): ChatsListSection[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const groups: Record<'Pinned' | ConversationGroup, ChatsListItem[]> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    'This Week': [],
    Older: [],
  };

  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  for (const conversation of sorted) {
    const item: ChatsListItem = {
      kind: 'chat',
      id: conversation.id,
      title: conversation.title || 'Untitled chat',
      subtitle: formatAgeLabel(conversation.updatedAt),
      pinned: conversation.pinned,
      starred: conversation.starred === true,
      unread: conversation.unread,
    };
    if (conversation.pinned) {
      groups.Pinned.push(item);
      continue;
    }
    const age = todayMs - new Date(conversation.updatedAt).getTime();
    if (age < 0) groups.Today.push(item);
    else if (age < TIME_GROUPS.YESTERDAY) groups.Yesterday.push(item);
    else if (age < TIME_GROUPS.THIS_WEEK) groups['This Week'].push(item);
    else groups.Older.push(item);
  }

  return (['Pinned', 'Today', 'Yesterday', 'This Week', 'Older'] as const)
    .filter((title) => groups[title].length > 0)
    .map((title) => ({ title, data: groups[title] }));
}

function searchSection(
  title: string,
  kind: SearchKind,
  results: MobileGlobalSearchResult[],
): ChatsListSection | null {
  if (results.length === 0) return null;
  return {
    title,
    data: results.map((result) => ({ ...result, kind })),
  };
}

function SearchKindIcon({ kind, color }: { kind: SearchKind; color: string }) {
  const Icon = SEARCH_KIND_ICONS[kind];
  return <Icon size={18} color={color} />;
}

export function ChatsListScreen({ searchOnly = false }: { searchOnly?: boolean }) {
  const colors = useThemeColors();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ focusSearch?: string | string[] }>();
  const autoFocusSearch =
    searchOnly ||
    (Array.isArray(params.focusSearch) ? params.focusSearch[0] : params.focusSearch) === '1';
  const searchInputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChatListFilter>('all');
  const appMode = useChatAppModeStore((state) => state.appMode);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);

  const conversations = useChatStore((state) => state.conversations);
  const messages = useChatStore((state) => state.messages);
  const loadConversations = useChatStore((state) => state.loadConversations);
  const loadMoreConversations = useChatStore((state) => state.loadMoreConversations);
  const isLoadingConversations = useChatStore((state) => state.isLoadingConversations);
  const isLoadingMoreConversations = useChatStore((state) => state.isLoadingMoreConversations);
  const hasMoreCloudConversations = useChatStore((state) => state.hasMoreCloudConversations);
  const conversationLoadError = useChatStore((state) => state.conversationLoadError);
  const cloudConversations = useChatCloudMessageStore((state) => state.conversations);
  const cloudMessages = useChatCloudMessageStore((state) => state.messages);
  const searchConversations = useChatViewStore((state) => state.searchConversations);
  const searchResultQuery = useChatViewStore((state) => state.searchQuery);
  const searchResults = useChatViewStore((state) => state.searchResults);
  const { openActions, rename } = useConversationActions();
  const serverChatMatches = useChatViewStore((state) => state.remoteSearchChats);
  const serverProjectMatches = useChatViewStore((state) => state.remoteSearchProjects);
  const localProjects = useProjectStore((state) => state.projects);
  const cloudProjects = useCloudProjectStore((state) => state.projects);
  const storedArtifacts = useArtifactStore((state) => state.artifacts);
  const cloudArtifacts = useArtifactStore((state) => state.cloudArtifacts);
  const cloudArtifactsOwnerId = useArtifactStore((state) => state.cloudArtifactsOwnerId);

  useFocusEffect(
    useCallback(() => {
      if (appMode === 'cloud' && (!isClerkSignedIn || !clerkUserId)) return;
      void loadConversations({ firstPageOnly: appMode === 'cloud' });
    }, [appMode, clerkUserId, isClerkSignedIn, loadConversations]),
  );

  useEffect(() => {
    searchConversations(query);
  }, [query, searchConversations]);

  useEffect(() => {
    if (!autoFocusSearch) return;
    searchInputRef.current?.focus();
  }, [autoFocusSearch]);

  const modeConversations = useMemo(() => {
    const source = appMode === 'cloud' ? cloudConversations : conversations;
    return source.filter(
      (conversation) =>
        executionModeForConversation(conversation) === appMode &&
        isHistoryVisibleConversation(conversation),
    );
  }, [appMode, cloudConversations, conversations]);

  const filteredHistory = useMemo(() => {
    if (filter === 'pinned') return modeConversations.filter((conversation) => conversation.pinned);
    if (filter === 'unread') return modeConversations.filter((conversation) => conversation.unread);
    return modeConversations;
  }, [filter, modeConversations]);

  const projects = useMemo(() => {
    if (!FEATURES.projects) return [];
    if (appMode === 'cloud') {
      return cloudProjects
        .filter((project) => project.deletedAt === null && !project.isArchived)
        .map((project) => ({
          id: project.id,
          name: project.name,
          description: project.description,
        }));
    }
    return localProjects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
    }));
  }, [appMode, cloudProjects, localProjects]);

  const artifacts = useMemo(
    () =>
      mergeMobileArtifactsForGallery(storedArtifacts, cloudArtifacts, colors, cloudArtifactsOwnerId)
        .filter((artifact) => artifact.provenance?.scope === appMode)
        .map((artifact) => ({
          ...artifact,
          accentColor: accentColorForKind(artifact.kind, colors),
        })),
    [appMode, cloudArtifacts, cloudArtifactsOwnerId, colors, storedArtifacts],
  );

  const libraryImages = useMemo(() => {
    if (appMode === 'cloud') return collectGeneratedImages(cloudConversations, cloudMessages);
    return collectGeneratedImages(modeConversations, messages);
  }, [appMode, cloudConversations, cloudMessages, messages, modeConversations]);
  const files = useMemo(
    () =>
      collectSearchableMobileFiles(
        modeConversations,
        appMode === 'cloud' ? cloudMessages : messages,
      ),
    [appMode, cloudMessages, messages, modeConversations],
  );

  const contentMatchIds = useMemo(
    () =>
      searchResultQuery === query.trim()
        ? new Set(searchResults.map((result) => result.conversationId))
        : new Set<string>(),
    [query, searchResultQuery, searchResults],
  );
  const searchIsCurrent = searchResultQuery === query.trim();
  const remoteSearchChats = useMemo(
    () => (searchIsCurrent ? serverChatMatches : []),
    [searchIsCurrent, serverChatMatches],
  );
  const remoteSearchProjects = useMemo(
    () => (searchIsCurrent ? serverProjectMatches : []),
    [searchIsCurrent, serverProjectMatches],
  );
  const globalResults = useMemo(
    () =>
      buildMobileGlobalSearchGroups({
        query,
        conversations: filteredHistory,
        conversationContentMatchIds: contentMatchIds,
        projects,
        files,
        libraryImages,
        artifacts,
        remoteChats: remoteSearchChats,
        remoteProjects: remoteSearchProjects,
      }),
    [
      artifacts,
      contentMatchIds,
      files,
      filteredHistory,
      libraryImages,
      projects,
      query,
      remoteSearchChats,
      remoteSearchProjects,
    ],
  );

  const isSearching = query.trim().length > 0;
  const sections = useMemo<ChatsListSection[]>(() => {
    if (!isSearching) return searchOnly ? [] : groupHistory(filteredHistory);
    return [
      searchSection('Chats', 'chat', globalResults.chats),
      searchSection('Go to', 'destination', searchMobileDestinations(query)),
      searchSection('Projects', 'project', globalResults.projects),
      searchSection('Files', 'file', globalResults.files),
      searchSection('Library', 'library', globalResults.library),
      searchSection('Artifacts', 'artifact', globalResults.artifacts),
    ].filter((section): section is ChatsListSection => section !== null);
  }, [filteredHistory, globalResults, isSearching, query, searchOnly]);

  const openFilter = useCallback(() => {
    const option = (value: ChatListFilter) => ({
      text: `${filter === value ? '✓ ' : ''}${FILTER_LABELS[value]}`,
      onPress: () => setFilter(value),
    });
    Alert.alert('Filter chats', 'Choose which chats appear in this list and in search.', [
      option('all'),
      option('pinned'),
      option('unread'),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [filter]);

  const openItem = useCallback(
    (item: ChatsListItem) => {
      if (item.kind === 'chat') {
        router.push({
          pathname: '/(app)/chat/[id]',
          params: { id: item.id },
        });
        return;
      }
      if (item.kind === 'destination') {
        router.push((item.targetId ?? item.id) as Parameters<typeof router.push>[0]);
        return;
      }
      if (item.kind === 'project') {
        router.push({
          pathname: '/(app)/projects/[id]',
          params: { id: item.id },
        });
        return;
      }
      if (item.kind === 'file') {
        router.push({
          pathname: '/(app)/chat/[id]',
          params: { id: item.targetId ?? item.id },
        });
        return;
      }
      if (item.kind === 'library') {
        router.push({
          pathname: '/(app)/library',
          params: { imageId: item.id },
        });
        return;
      }
      router.push({
        pathname: '/(app)/artifacts',
        params: { artifactId: item.id },
      });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatsListItem }) => (
      <PressableBox
        onPress={() => openItem(item)}
        onLongPress={
          item.kind === 'chat'
            ? () => openActions(item.id, item.title, item.pinned === true)
            : undefined
        }
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.kind}: ${item.title}${item.unread ? ', unread' : ''}`}
        accessibilityHint={item.kind === 'chat' ? 'Long press for more actions' : undefined}
        style={({ pressed }) => ({
          minHeight: 66,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceHover : colors.surfaceElevated,
          paddingHorizontal: 14,
          paddingVertical: 11,
          marginHorizontal: 16,
          marginBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        })}
      >
        {item.unread ? (
          <View
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textPrimary }}
          />
        ) : null}
        {item.pinned ? <Pin size={15} color={colors.textMuted} fill={colors.textMuted} /> : null}
        {item.starred ? (
          <Star
            size={15}
            color={colors.textMuted}
            fill={colors.textMuted}
            accessibilityLabel="Starred"
          />
        ) : null}
        {isSearching ? <SearchKindIcon kind={item.kind} color={colors.textMuted} /> : null}
        {item.kind === 'chat' && rename.conversationId === item.id ? (
          <InlineRenameField rename={rename} />
        ) : (
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
            >
              {item.title}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: colors.textMuted, fontSize: typeScale.caption }}
            >
              {item.subtitle}
            </Text>
          </View>
        )}
        {isSearching ? (
          <ChevronRight size={16} color={colors.textMuted} />
        ) : item.kind === 'chat' ? (
          <PressableBox
            onPress={() => openActions(item.id, item.title, item.pinned === true)}
            accessibilityRole="button"
            accessibilityLabel={`More actions for ${item.title}`}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              marginEnd: -10,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
            })}
          >
            <MoreHorizontal size={18} color={colors.textMuted} />
          </PressableBox>
        ) : (
          <ChevronRight size={16} color={colors.textMuted} />
        )}
      </PressableBox>
    ),
    [colors, isSearching, openActions, openItem, rename],
  );

  const hasResults = sections.some((section) => section.data.length > 0);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <View
        style={{
          ...contentColumn('reading'),
          minHeight: 52,
          paddingVertical: 4,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {searchOnly ? (
          <Pressable
            onPress={() => router.replace('/(app)/chats')}
            accessibilityRole="button"
            accessibilityLabel="Close search"
            hitSlop={8}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={21} color={colors.textSecondary} />
          </Pressable>
        ) : (
          <DrawerButton onPress={() => openNearestDrawer(navigation)} />
        )}
        <View style={{ flex: 1 }}>
          <Text
            maxFontSizeMultiplier={2}
            style={{ color: colors.textPrimary, fontSize: typeScale.title3, fontWeight: '700' }}
          >
            {searchOnly ? 'Search' : 'Chats'}
          </Text>
          <Text
            maxFontSizeMultiplier={2}
            style={{ color: colors.textMuted, fontSize: typeScale.caption }}
          >
            {appMode === 'cloud' ? 'Managed Cloud' : 'Local on this device'}
          </Text>
        </View>
        {!searchOnly && (
          <Pressable
            onPress={openFilter}
            accessibilityRole="button"
            accessibilityLabel={`Filter chats. ${FILTER_LABELS[filter]}`}
            hitSlop={8}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: filter === 'all' ? colors.transparent : colors.accentSurface,
            }}
          >
            <SlidersHorizontal
              size={19}
              color={filter === 'all' ? colors.textSecondary : colors.teal}
            />
          </Pressable>
        )}
      </View>

      <SectionList
        testID="chats-list"
        refreshControl={
          appMode === 'cloud' ? (
            <RefreshControl
              refreshing={isLoadingConversations}
              onRefresh={() => void loadConversations({ firstPageOnly: true })}
              tintColor={colors.textMuted}
            />
          ) : undefined
        }
        initialNumToRender={20}
        sections={sections}
        onEndReached={() => {
          if (
            appMode === 'cloud' &&
            hasMoreCloudConversations &&
            !searchOnly &&
            !isSearching &&
            !conversationLoadError
          ) {
            void loadMoreConversations();
          }
        }}
        onEndReachedThreshold={0.4}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View
            style={{
              paddingHorizontal: 18,
              paddingTop: 14,
              paddingBottom: 7,
              backgroundColor: colors.surfaceBase,
            }}
          >
            <Text
              style={{
                color: colors.textMuted,
                fontSize: typeScale.caption,
                fontWeight: '700',
                letterSpacing: 0.7,
                textTransform: 'uppercase',
              }}
            >
              {section.title}
            </Text>
          </View>
        )}
        contentContainerStyle={{
          ...contentColumn('reading'),
          paddingBottom: FLOATING_PRIMARY_ACTION_LIST_PADDING,
          flexGrow: hasResults ? 0 : 1,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          appMode === 'cloud' && conversationLoadError && !hasMoreCloudConversations ? (
            <View
              accessibilityRole="alert"
              style={{ paddingHorizontal: 18, paddingVertical: 14, gap: 8 }}
            >
              <Text style={{ color: colors.agentError, fontSize: typeScale.footnote }}>
                {conversationLoadError}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading chats"
                onPress={() => void loadConversations({ firstPageOnly: true })}
              >
                <Text
                  style={{ color: colors.teal, fontSize: typeScale.footnote, fontWeight: '600' }}
                >
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : null
        }
        ListFooterComponent={
          appMode === 'cloud' && hasMoreCloudConversations && !isSearching && !searchOnly ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Load older chats"
              disabled={isLoadingMoreConversations}
              onPress={() => void loadMoreConversations()}
              style={{ alignItems: 'center', paddingVertical: 18, gap: 8 }}
            >
              {conversationLoadError ? (
                <Text
                  accessibilityRole="alert"
                  style={{ color: colors.agentError, fontSize: typeScale.footnote }}
                >
                  {conversationLoadError}
                </Text>
              ) : null}
              {isLoadingMoreConversations ? (
                <ActivityIndicator color={colors.teal} accessibilityLabel="Loading older chats" />
              ) : (
                <Text
                  style={{ color: colors.teal, fontSize: typeScale.footnote, fontWeight: '600' }}
                >
                  Load older chats
                </Text>
              )}
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          appMode === 'cloud' && conversationLoadError ? null : (
            <View
              style={{
                flex: 1,
                minHeight: 360,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 36,
                gap: 10,
              }}
            >
              {searchOnly && !isSearching ? (
                <Search size={34} color={colors.textMuted} />
              ) : appMode === 'cloud' && isLoadingConversations ? (
                <ActivityIndicator color={colors.teal} accessibilityLabel="Loading chats" />
              ) : (
                <MessageSquare size={34} color={colors.textMuted} />
              )}
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.headline,
                  fontWeight: '600',
                }}
              >
                {searchOnly && !isSearching
                  ? 'Search your workspace'
                  : appMode === 'cloud' && isLoadingConversations
                    ? 'Loading chats'
                    : isSearching
                      ? 'No matches'
                      : filter === 'all'
                        ? 'No chats yet'
                        : 'No chats here'}
              </Text>
              {appMode === 'cloud' && isLoadingConversations ? null : (
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: typeScale.footnote,
                    textAlign: 'center',
                  }}
                >
                  {searchOnly && !isSearching
                    ? 'Find chats, projects, files, library images, and artifacts in this mode.'
                    : isSearching
                      ? `Nothing in ${appMode === 'cloud' ? 'Managed Cloud' : 'Local Mode'} matches “${query.trim()}”.`
                      : filter === 'all'
                        ? 'Start a new chat to begin your history.'
                        : `No ${FILTER_LABELS[filter].toLocaleLowerCase()} are available in this mode.`}
                </Text>
              )}
            </View>
          )
        }
      />

      {!searchOnly && (
        <FloatingPrimaryAction
          label="New chat"
          icon={SquarePen}
          onPress={() => router.push('/(app)/(tabs)/chat')}
        />
      )}

      <BottomSearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search"
        accessibilityLabel="Search chats, projects, files, library, and artifacts"
        inputRef={searchInputRef}
        autoFocus={autoFocusSearch}
      />
      <RenameConversationModal rename={rename} inline />
    </SafeAreaView>
  );
}

export default ChatsListScreen;
