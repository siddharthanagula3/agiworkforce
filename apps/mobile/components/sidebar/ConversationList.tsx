import { useEffect, useMemo, useCallback } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { MessageSquare } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { ConversationItem } from './ConversationItem';
import { useChatStore } from '@/stores/chatStore';
import { colors } from '@/lib/theme';
import { TIME_GROUPS } from '@/lib/constants';
import type { ConversationSummary, ConversationGroup } from '@/types/chat';

interface GroupedConversations {
  label: ConversationGroup;
  conversations: ConversationSummary[];
}

/**
 * Groups conversations into Today / Yesterday / This Week / Older buckets.
 */
function groupConversations(conversations: ConversationSummary[]): GroupedConversations[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

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

  // Only return non-empty groups
  const order: ConversationGroup[] = ['Today', 'Yesterday', 'This Week', 'Older'];
  return order
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, conversations: groups[label] }));
}

/**
 * Sidebar conversation list.
 * Groups conversations by recency and renders ConversationItem rows.
 * Pull to refresh loads from server.
 */
export function ConversationList() {
  const conversations = useChatStore((s) => s.conversations);
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const isLoadingConversations = useChatStore((s) => s.isLoadingConversations);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const grouped = useMemo(() => groupConversations(conversations), [conversations]);

  const handleRefresh = useCallback(() => {
    loadConversations();
  }, [loadConversations]);

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
            }}
          >
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
