import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, SectionList, TextInput, View, type SectionListData } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MessageSquare,
  Pin,
  ChevronRight,
  SlidersHorizontal,
  SquarePen,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
// NativeWind's JSX interop silently drops function-form `style` on Pressable,
// which stripped the row cards and the New-chat FAB of all styling. See
// components/ui/pressable-box.tsx.
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
import { useChatStore } from '@/stores/chatStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
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
      // Relative time, not a message preview. Claude's chats list
      // (claude_reference/117) shows "1 day ago" per row, and a preview of the
      // last message is frequently noise here — a code fence, or a bare
      // "1 2 3 4 5 6 7 8 9 10..." — which tells the user nothing about which
      // conversation this is. Reuses the artifact gallery's formatter rather
      // than adding a second relative-time implementation.
      subtitle: formatAgeLabel(conversation.updatedAt),
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
  const router = useRouter();
  const navigation = useNavigation();
  // The drawer's icon-only search button hands off to this screen rather than
  // keeping a second search implementation of its own, so it arrives with
  // `focusSearch=1` and expects the field below to already be focused.
  const params = useLocalSearchParams<{ focusSearch?: string | string[] }>();
  const autoFocusSearch =
    (Array.isArray(params.focusSearch) ? params.focusSearch[0] : params.focusSearch) === '1';
  const searchInputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChatListFilter>('all');
  const appMode = useChatAppModeStore((state) => state.appMode);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);

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

  // Re-run when the gate inputs change, not only on mount.
  //
  // loadConversations no-ops unless Cloud Mode is active AND Clerk has
  // hydrated, and it swallows failures to stay usable offline. On a cold start
  // the mount usually wins that race, so the one-shot effect fetched nothing
  // and the screen kept rendering whatever MMKV had persisted — indefinitely,
  // since nothing re-triggered it. Chats archived on another surface stayed
  // visible here for exactly that reason.
  useEffect(() => {
    void loadConversations();
  }, [appMode, isClerkSignedIn, loadConversations]);

  useEffect(() => {
    searchConversations(query);
  }, [query, searchConversations]);

  // Covers the case the declarative `autoFocus` below cannot: the drawer sits
  // over an already-mounted Chats screen, so there is no mount for autoFocus to
  // fire on. Runs whenever the param arrives or changes.
  useEffect(() => {
    if (!autoFocusSearch) return;
    searchInputRef.current?.focus();
  }, [autoFocusSearch]);

  // Read each mode's history from the store that OWNS it.
  //
  // Cloud conversations live in useChatCloudMessageStore — that is the store
  // loadConversations() writes the server list into, and the SEPARATION-FIX in
  // chatMessageStore.ts stopped cloud rows being written into the local store
  // at all. This screen was still filtering the LOCAL store for rows tagged
  // `executionMode: 'cloud'`, so in Cloud Mode it rendered a stale MMKV mirror
  // that no server response ever touched: chats archived (or deleted, or
  // renamed) elsewhere stayed exactly as they were, and the `archived=exclude`
  // filter on the list request could not affect what was displayed.
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
          // Two stacked lines (title + mode subtitle) in a fixed 52pt box clipped
          // the subtitle at accessibility text sizes. minHeight lets the header
          // grow with the type instead.
          minHeight: 52,
          paddingVertical: 4,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <DrawerButton onPress={() => openNearestDrawer(navigation)} />
        <View style={{ flex: 1 }}>
          <Text
            maxFontSizeMultiplier={1.4}
            style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700' }}
          >
            Chats
          </Text>
          <Text maxFontSizeMultiplier={1.4} style={{ color: colors.textMuted, fontSize: 11 }}>
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
        contentContainerStyle={{
          paddingBottom: FLOATING_PRIMARY_ACTION_LIST_PADDING,
          flexGrow: hasResults ? 0 : 1,
        }}
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

      <FloatingPrimaryAction
        label="New chat"
        icon={SquarePen}
        onPress={() => router.push('/(app)/(tabs)/chat')}
      />

      {/* Search is bottom-anchored: both references put it within thumb
          reach at the bottom of the list (claude_reference/117 puts it below
          the New-chat pill; ChatGPT does the same on Projects, IMG_0691).
          It sat at the top here, and was ALSO duplicated in the drawer.
          Now the shared implementation Library, Projects and the connectors
          directory adopt too, so sibling list screens cannot drift apart. */}
      <BottomSearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search"
        accessibilityLabel="Search chats, projects, files, library, and artifacts"
        inputRef={searchInputRef}
        autoFocus={autoFocusSearch}
      />
    </SafeAreaView>
  );
}

export default ChatsListScreen;
