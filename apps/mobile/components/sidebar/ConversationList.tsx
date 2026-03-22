import { useMemo, useCallback } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { MessageSquare, Pin, Search } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { ConversationItem } from './ConversationItem';
import { useChatStore } from '@/stores/chatStore';
import { colors } from '@/lib/theme';
import { TIME_GROUPS } from '@/lib/constants';
import type { ConversationSummary, ConversationGroup } from '@/types/chat';

type SectionLabel = 'Pinned' | ConversationGroup;

interface GroupedConversations {
  label: SectionLabel;
  conversations: ConversationSummary[];
}

/**
 * Groups conversations into Pinned / Today / Yesterday / This Week / Older buckets.
 * Pinned conversations appear in a dedicated section at the top and are excluded
 * from the date-based groups to prevent duplication.
 */
function groupConversations(conversations: ConversationSummary[]): GroupedConversations[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const pinned: ConversationSummary[] = [];
  const groups: Record<ConversationGroup, ConversationSummary[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Older: [],
  };

  // Sort by updatedAt descending (most recent first)
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  for (const conv of sorted) {
    if (conv.pinned) {
      pinned.push(conv);
      continue;
    }

    const updated = new Date(conv.updatedAt).getTime();
    const age = todayMs - updated;

    if (age < 0) {
      // Updated today (or in the future)
      groups.Today.push(conv);
    } else if (age < TIME_GROUPS.YESTERDAY) {
      groups.Yesterday.push(conv);
    } else if (age < TIME_GROUPS.THIS_WEEK) {
      groups['This Week'].push(conv);
    } else {
      groups.Older.push(conv);
    }
  }

  const result: GroupedConversations[] = [];

  // Pinned section always first
  if (pinned.length > 0) {
    result.push({ label: 'Pinned', conversations: pinned });
  }

  // Only return non-empty date groups
  const order: ConversationGroup[] = ['Today', 'Yesterday', 'This Week', 'Older'];
  for (const label of order) {
    if (groups[label].length > 0) {
      result.push({ label, conversations: groups[label] });
    }
  }

  return result;
}

interface ConversationListProps {
  searchQuery?: string;
  searchResults?: Array<{ conversationId: string; messageId: string; snippet: string }>;
  /** When set, only show conversations belonging to this project */
  filterProjectId?: string | null;
}

/**
 * Sidebar conversation list.
 * Groups conversations by recency and renders ConversationItem rows.
 * Pull to refresh loads from server.
 * When searchResults is provided, renders a flat search results list with snippets.
 * When filterProjectId is provided, only conversations in that project are shown.
 */
export function ConversationList({
  searchQuery,
  searchResults,
  filterProjectId,
}: ConversationListProps) {
  const allConversations = useChatStore((s) => s.conversations);

  // Apply project filter first, then search filter
  const projectFiltered = filterProjectId
    ? allConversations.filter((c) => c.projectId === filterProjectId)
    : allConversations;

  const conversations =
    searchQuery && !searchResults
      ? projectFiltered.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : projectFiltered;
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const isLoadingConversations = useChatStore((s) => s.isLoadingConversations);

  const grouped = useMemo(() => groupConversations(conversations), [conversations]);

  const handleRefresh = useCallback(() => {
    loadConversations();
  }, [loadConversations]);

  // Search results — flat list with snippets
  if (searchResults && searchResults.length > 0 && searchQuery) {
    return (
      <ScrollView className="flex-1 px-3" showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 4, paddingTop: 8, paddingBottom: 6 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: 'rgba(255,255,255,0.35)',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
            }}
          >
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
          </Text>
        </View>
        {searchResults.map((result) => {
          const conv = allConversations.find((c) => c.id === result.conversationId);
          if (!conv) return null;
          return (
            <ConversationItem
              key={`${result.conversationId}-${result.messageId}`}
              conversation={conv}
              isActive={conv.id === currentConversationId}
              snippet={result.snippet}
            />
          );
        })}
        <View style={{ height: 24 }} />
      </ScrollView>
    );
  }

  // Search query with no results
  if (searchQuery && searchResults && searchResults.length === 0) {
    return (
      <ScrollView className="flex-1 px-3">
        <View className="items-center py-16 gap-3">
          <Search size={32} color={colors.textMuted} />
          <Text className="text-sm text-white/40 text-center">
            {`No results for "${searchQuery}"`}
          </Text>
        </View>
      </ScrollView>
    );
  }

  // Empty state
  if (conversations.length === 0 && !isLoadingConversations) {
    return (
      <ScrollView
        className="flex-1 px-3"
        refreshControl={
          <RefreshControl
            refreshing={isLoadingConversations}
            onRefresh={handleRefresh}
            tintColor={colors.teal}
          />
        }
      >
        <View className="items-center py-16 gap-3">
          <MessageSquare size={32} color={colors.textMuted} />
          <Text className="text-sm text-white/40 text-center">
            No conversations yet.{'\n'}Start a new chat to begin.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 px-3"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isLoadingConversations}
          onRefresh={handleRefresh}
          tintColor={colors.teal}
        />
      }
    >
      {grouped.map((group, groupIndex) => (
        <View key={group.label}>
          {/* Group header */}
          <View
            style={{
              paddingHorizontal: 4,
              paddingTop: groupIndex === 0 ? 8 : 16,
              paddingBottom: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {group.label === 'Pinned' && <Pin size={10} color="rgba(255, 255, 255, 0.35)" />}
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: 'rgba(255, 255, 255, 0.35)',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              {group.label}
            </Text>
          </View>

          {/* Conversation rows */}
          {group.conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === currentConversationId}
            />
          ))}
        </View>
      ))}

      {/* Bottom padding */}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
