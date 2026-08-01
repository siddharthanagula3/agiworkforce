import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, TextInput, View, type SectionListData } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Menu,
  MessageSquare,
  Pin,
  ChevronRight,
  Search,
  SlidersHorizontal,
  SquarePen,
  X,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
// NativeWind's JSX interop silently drops function-form `style` on Pressable,
// which stripped the row cards and the New-chat FAB of all styling. See
// components/ui/pressable-box.tsx.
import { PressableBox } from '@/components/ui/pressable-box';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { useThemeColors } from '@/src/ui/theme';
import { useChatStore } from '@/stores/chatStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  executionModeForConversation,
  isHistoryVisibleConversation,
} from '@/src/features/chat/utils/conversationMode';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import {
  accentColorForKind,
  mergeMobileArtifactsForGallery,
  useArtifactStore,
} from '@/src/features/artifacts/store';
import { collectGeneratedImages } from '@/src/features/library/collectGeneratedImages';
import {
  buildMobileGlobalSearchGroups,
  collectSearchableMobileFiles,
  type MobileGlobalSearchResult,
} from '@/src/features/search';
import type { ConversationGroup, ConversationSummary } from '@/types/chat';
import { TIME_GROUPS } from '@/lib/constants';

type ChatListFilter = 'all' | 'pinned' | 'unread';
type SearchKind = 'chat' | 'project' | 'file' | 'library' | 'artifact';

interface ChatsListItem extends MobileGlobalSearchResult {
  kind: SearchKind;
  pinned?: boolean;
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
      subtitle: conversation.lastMessage ?? 'Chat',
      pinned: conversation.pinned,
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

export function ChatsListScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChatListFilter>('all');
  const appMode = useChatAppModeStore((state) => state.appMode);

  const conversations = useChatStore((state) => state.conversations);
  const messages = useChatStore((state) => state.messages);
  const loadConversations = useChatStore((state) => state.loadConversations);
  const cloudConversations = useChatCloudMessageStore((state) => state.conversations);
  const cloudMessages = useChatCloudMessageStore((state) => state.messages);
  const searchConversations = useChatViewStore((state) => state.searchConversations);
  const searchResultQuery = useChatViewStore((state) => state.searchQuery);
  const searchResults = useChatViewStore((state) => state.searchResults);
  const localProjects = useProjectStore((state) => state.projects);
  const cloudProjects = useCloudProjectStore((state) => state.projects);
  const storedArtifacts = useArtifactStore((state) => state.artifacts);
  const cloudArtifacts = useArtifactStore((state) => state.cloudArtifacts);
  const cloudArtifactsOwnerId = useArtifactStore((state) => state.cloudArtifactsOwnerId);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    searchConversations(query);
  }, [query, searchConversations]);

  const modeConversations = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          executionModeForConversation(conversation) === appMode &&
          isHistoryVisibleConversation(conversation),
      ),
    [appMode, conversations],
  );

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
      }),
    [artifacts, contentMatchIds, files, filteredHistory, libraryImages, projects, query],
  );

  const isSearching = query.trim().length > 0;
  const sections = useMemo<ChatsListSection[]>(() => {
    if (!isSearching) return groupHistory(filteredHistory);
    return [
      searchSection('Chats', 'chat', globalResults.chats),
      searchSection('Projects', 'project', globalResults.projects),
      searchSection('Files', 'file', globalResults.files),
      searchSection('Library', 'library', globalResults.library),
      searchSection('Artifacts', 'artifact', globalResults.artifacts),
    ].filter((section): section is ChatsListSection => section !== null);
  }, [filteredHistory, globalResults, isSearching]);

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
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.kind}: ${item.title}`}
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
        {item.pinned ? <Pin size={15} color={colors.textMuted} fill={colors.textMuted} /> : null}
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}
          >
            {item.title}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
            {item.subtitle}
          </Text>
        </View>
        {isSearching ? (
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 10, textTransform: 'capitalize' }}>
              {item.kind}
            </Text>
          </View>
        ) : (
          /* Trailing chevron — the row is tappable and Claude's chats list
             (claude_reference/117) carries this affordance; without it the row
             reads as a static card rather than a link. Hidden while searching,
             where the kind badge occupies the same slot. */
          <ChevronRight size={16} color={colors.textMuted} />
        )}
      </PressableBox>
    ),
    [colors, isSearching, openItem],
  );

  const hasResults = sections.some((section) => section.data.length > 0);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <View
        style={{
          height: 52,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Pressable
          onPress={() => openNearestDrawer(navigation)}
          accessibilityRole="button"
          accessibilityLabel="Open navigation drawer"
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
        >
          <Menu size={20} color={colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700' }}>Chats</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {appMode === 'cloud' ? 'Managed Cloud' : 'Local on this device'}
          </Text>
        </View>
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
      </View>

      <View
        style={{
          height: 44,
          marginHorizontal: 16,
          marginTop: 6,
          marginBottom: 8,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Search size={17} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search chats, projects, files, library, and artifacts"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search chats, projects, files, library, and artifacts"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={{ flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 0 }}
        />
        {isSearching ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
          >
            <X size={17} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <SectionList
        testID="chats-list"
        initialNumToRender={20}
        sections={sections}
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
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 0.7,
                textTransform: 'uppercase',
              }}
            >
              {section.title}
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 126, flexGrow: hasResults ? 0 : 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
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
            <MessageSquare size={34} color={colors.textMuted} />
            <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '600' }}>
              {isSearching ? 'No matches' : filter === 'all' ? 'No chats yet' : 'No chats here'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
              {isSearching
                ? `Nothing in ${appMode === 'cloud' ? 'Managed Cloud' : 'Local Mode'} matches “${query.trim()}”.`
                : filter === 'all'
                  ? 'Start a new chat to begin your history.'
                  : `No ${FILTER_LABELS[filter].toLocaleLowerCase()} are available in this mode.`}
            </Text>
          </View>
        }
      />

      <PressableBox
        onPress={() => router.push('/(app)/(tabs)/chat')}
        accessibilityRole="button"
        accessibilityLabel="New chat"
        style={({ pressed }) => ({
          position: 'absolute',
          right: 18,
          // This SafeAreaView only claims the top edge, so `bottom` is measured
          // from the physical screen edge — a fixed 24 put the FAB underneath
          // the home indicator. Offset by the real inset instead.
          bottom: insets.bottom + 16,
          minHeight: 48,
          borderRadius: 24,
          paddingHorizontal: 18,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.teal,
          opacity: pressed ? 0.82 : 1,
        })}
      >
        <SquarePen size={18} color={colors.accentText} />
        <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: '700' }}>New chat</Text>
      </PressableBox>
    </SafeAreaView>
  );
}

export default ChatsListScreen;
