/**
 * ThreadList
 *
 * Displays all cross-device threads with status badges, last-message
 * previews, and unread indicators. Tap a row to open the thread detail.
 */
import { useCallback } from 'react';
import { View, Pressable, FlatList } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { MessageSquare, CheckCircle2, Pause, Zap, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useCrossDeviceStore, type CrossDeviceThread } from '@/stores/crossDeviceStore';
import { colors } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) return 'just now';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

function getStatusBadgeColor(status: CrossDeviceThread['status']): 'blue' | 'green' | 'yellow' {
  switch (status) {
    case 'active':
      return 'blue';
    case 'completed':
      return 'green';
    case 'paused':
      return 'yellow';
  }
}

function StatusIcon({ status }: { status: CrossDeviceThread['status'] }) {
  switch (status) {
    case 'active':
      return <Zap size={13} color={colors.agentActive} />;
    case 'completed':
      return <CheckCircle2 size={13} color={colors.agentSuccess} />;
    case 'paused':
      return <Pause size={13} color={colors.agentWarning} />;
  }
}

// ---------------------------------------------------------------------------
// Thread row
// ---------------------------------------------------------------------------

interface ThreadRowProps {
  thread: CrossDeviceThread;
  onPress: (id: string) => void;
}

function ThreadRow({ thread, onPress }: ThreadRowProps) {
  const handlePress = useCallback(() => {
    onPress(thread.id);
  }, [thread.id, onPress]);

  const lastMessage = thread.messages[thread.messages.length - 1];
  const preview = lastMessage?.content?.slice(0, 80) ?? '';
  const hasUnread = thread.unreadCount > 0;

  return (
    <Animated.View entering={FadeIn.duration(200)} layout={LinearTransition.springify()}>
      <Pressable
        onPress={handlePress}
        accessibilityLabel={`Thread: ${thread.title}, status: ${thread.status}`}
        accessibilityRole="button"
        accessibilityHint="Tap to open thread"
      >
        <Card
          variant={hasUnread ? 'elevated' : 'default'}
          className={hasUnread ? 'border border-teal-500/20' : ''}
        >
          <View className="flex-row items-start gap-3">
            {/* Icon container */}
            <View
              className="w-9 h-9 rounded-xl items-center justify-center flex-shrink-0"
              style={{
                backgroundColor:
                  thread.status === 'active'
                    ? 'rgba(59,130,246,0.12)'
                    : thread.status === 'completed'
                      ? 'rgba(16,185,129,0.12)'
                      : 'rgba(245,158,11,0.12)',
              }}
            >
              <StatusIcon status={thread.status} />
            </View>

            {/* Content */}
            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2 mb-0.5">
                <Text className="text-sm font-semibold text-white flex-1" numberOfLines={1}>
                  {thread.title}
                </Text>
                {hasUnread && (
                  <View className="w-5 h-5 rounded-full bg-teal-500 items-center justify-center">
                    <Text className="text-[10px] font-bold text-white">
                      {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
                    </Text>
                  </View>
                )}
              </View>

              {preview ? (
                <Text className="text-xs text-white/50 leading-4 mb-1" numberOfLines={2}>
                  {preview}
                </Text>
              ) : (
                <Text className="text-xs text-white/30 italic mb-1">No messages yet</Text>
              )}

              <View className="flex-row items-center gap-2">
                <Badge label={thread.status} color={getStatusBadgeColor(thread.status)} />
                <Text className="text-[10px] text-white/30">
                  {formatRelativeTime(thread.lastMessageAt)}
                </Text>
                <Text className="text-[10px] text-white/20">
                  {thread.messages.length} msg{thread.messages.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>

            {/* Chevron */}
            <View className="self-center">
              <ChevronRight size={14} color={colors.textMuted} />
            </View>
          </View>
        </Card>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyThreadList() {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <View className="w-16 h-16 rounded-2xl bg-white/5 items-center justify-center mb-4">
        <MessageSquare size={28} color={colors.textMuted} />
      </View>
      <Text className="text-white/60 text-center text-sm font-medium mb-1">
        No cross-device threads
      </Text>
      <Text className="text-white/30 text-center text-xs leading-5">
        Start a conversation on your desktop and it will appear here for you to continue.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main ThreadList component
// ---------------------------------------------------------------------------

interface ThreadListProps {
  onThreadPress: (threadId: string) => void;
}

export function ThreadList({ onThreadPress }: ThreadListProps) {
  const threads = useCrossDeviceStore((s) => s.threads);

  const renderItem = useCallback(
    ({ item }: { item: CrossDeviceThread }) => <ThreadRow thread={item} onPress={onThreadPress} />,
    [onThreadPress],
  );

  const keyExtractor = useCallback((item: CrossDeviceThread) => item.id, []);

  if (threads.length === 0) {
    return <EmptyThreadList />;
  }

  return (
    <FlatList
      data={threads}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View className="flex-row items-center justify-between py-2 mb-1">
          <Text className="text-xs text-white/50 uppercase tracking-wider">Threads</Text>
          <Badge label={`${threads.length}`} color="gray" />
        </View>
      }
    />
  );
}
