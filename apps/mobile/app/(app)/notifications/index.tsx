/**
 * Notification Center Screen
 *
 * Lists all in-app notifications with timestamps, priority tiers,
 * and quick actions. Tapping an item deep-links to the relevant screen.
 */
import { useCallback } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckCheck,
  Trash2,
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  useNotificationCenter,
  getPriorityColor,
  getPriorityLabel,
  type NotificationCenterItem,
  type NotificationPriority,
} from '@/services/notifications';
import { colors } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Priority Icon
// ---------------------------------------------------------------------------

function PriorityIcon({ priority }: { priority: NotificationPriority }) {
  const color = getPriorityColor(priority);
  switch (priority) {
    case 'critical':
      return <AlertOctagon size={16} color={color} />;
    case 'high':
      return <AlertTriangle size={16} color={color} />;
    case 'normal':
      return <CheckCircle2 size={16} color={color} />;
    case 'low':
      return <Info size={16} color={color} />;
  }
}

function getPriorityBadgeColor(priority: NotificationPriority): 'red' | 'yellow' | 'teal' | 'gray' {
  switch (priority) {
    case 'critical':
      return 'red';
    case 'high':
      return 'yellow';
    case 'normal':
      return 'teal';
    case 'low':
      return 'gray';
  }
}

// ---------------------------------------------------------------------------
// Notification Item
// ---------------------------------------------------------------------------

interface NotificationItemProps {
  item: NotificationCenterItem;
  onPress: (item: NotificationCenterItem) => void;
  onMarkRead: (id: string) => void;
}

function NotificationItem({ item, onPress, onMarkRead }: NotificationItemProps) {
  const priorityColor = getPriorityColor(item.priority);
  const timeLabel = formatNotificationTime(item.receivedAt);

  return (
    <Animated.View entering={FadeIn.duration(200)} layout={LinearTransition.springify()}>
      <Pressable
        onPress={() => onPress(item)}
        className={`rounded-xl overflow-hidden active:opacity-80 ${item.read ? '' : ''}`}
        accessibilityLabel={`Notification: ${item.title}`}
        accessibilityRole="button"
      >
        <View
          className="p-4 rounded-xl"
          style={{
            backgroundColor: item.read ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
            borderWidth: 1,
            borderColor: item.read ? 'rgba(255,255,255,0.06)' : `${priorityColor}30`,
          }}
        >
          {/* Header row */}
          <View className="flex-row items-start gap-2.5 mb-1">
            <View style={{ marginTop: 1 }}>
              <PriorityIcon priority={item.priority} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2 mb-0.5">
                <Text
                  className={`text-xs font-semibold flex-1 ${item.read ? 'text-white/60' : 'text-white'}`}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                {!item.read && (
                  <View
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: priorityColor }}
                  />
                )}
              </View>
              <Text
                className={`text-[11px] leading-4 ${item.read ? 'text-white/35' : 'text-white/60'}`}
                numberOfLines={2}
              >
                {item.body}
              </Text>
            </View>
            <ChevronRight size={14} color={colors.textMuted} style={{ marginTop: 2 }} />
          </View>

          {/* Footer row: priority badge + time + mark read */}
          <View className="flex-row items-center gap-2 mt-2 pl-6">
            <Badge
              label={getPriorityLabel(item.priority)}
              color={getPriorityBadgeColor(item.priority)}
            />
            <Text className="text-[10px] text-white/30 flex-1">{timeLabel}</Text>
            {!item.read && (
              <Pressable
                onPress={() => onMarkRead(item.id)}
                className="px-2 py-0.5 rounded-md bg-white/5 active:bg-white/10"
                accessibilityLabel="Mark as read"
                accessibilityRole="button"
              >
                <Text className="text-[10px] text-white/50">Mark read</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Notification Center Screen
// ---------------------------------------------------------------------------

export default function NotificationCenterScreen() {
  const router = useRouter();
  const { items, unreadCount, markRead, markAllRead, clear } = useNotificationCenter();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleItemPress = useCallback(
    (item: NotificationCenterItem) => {
      markRead(item.id);
      const route = item.data.route;
      const agentId = item.data.agentId;

      // Deep-link based on notification type
      switch (item.data.type) {
        case 'agent_failed':
        case 'emergency_stop_triggered':
          if (agentId) {
            router.push(`/(app)/companion/agent/${agentId}` as Parameters<typeof router.push>[0]);
          } else {
            router.push('/(app)/companion');
          }
          break;
        case 'agent_approval_needed':
        case 'approval_pending_escalation':
          router.push('/(app)/companion');
          break;
        case 'agent_paused':
          if (agentId) {
            router.push(`/(app)/companion/agent/${agentId}` as Parameters<typeof router.push>[0]);
          } else {
            router.push('/(app)/companion');
          }
          break;
        case 'task_completed':
          if (route && typeof route === 'string') {
            router.push(route as Parameters<typeof router.push>[0]);
          } else {
            router.push('/(app)');
          }
          break;
        case 'schedule_triggered':
          router.push('/(app)/schedules');
          break;
        default:
          if (route && typeof route === 'string') {
            router.push(route as Parameters<typeof router.push>[0]);
          }
          break;
      }
    },
    [markRead, router],
  );

  const handleClearAll = useCallback(() => {
    Alert.alert('Clear All', 'Remove all notifications from this list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: clear,
      },
    ]);
  }, [clear]);

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center px-3 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2 flex-1">
          Notifications
        </Text>
        {unreadCount > 0 && (
          <View className="bg-teal-500/20 rounded-full px-2 py-0.5 mr-2">
            <Text className="text-teal-400 text-[10px] font-bold">{unreadCount}</Text>
          </View>
        )}
        {items.length > 0 && (
          <View className="flex-row gap-1">
            {unreadCount > 0 && (
              <Pressable
                onPress={markAllRead}
                className="p-2 rounded-lg active:bg-white/5"
                accessibilityLabel="Mark all as read"
                accessibilityRole="button"
              >
                <CheckCheck size={18} color={colors.textSecondary} />
              </Pressable>
            )}
            <Pressable
              onPress={handleClearAll}
              className="p-2 rounded-lg active:bg-white/5"
              accessibilityLabel="Clear all notifications"
              accessibilityRole="button"
            >
              <Trash2 size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Content */}
      {items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-16 h-16 rounded-2xl bg-white/5 items-center justify-center mb-4">
            <BellOff size={28} color={colors.textMuted} />
          </View>
          <Text className="text-white/60 text-center text-sm">No notifications yet.</Text>
          <Text className="text-white/40 text-center text-xs mt-1">
            Agent alerts, approvals, and task updates will appear here.
          </Text>
        </View>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <NotificationItem item={item} onPress={handleItemPress} onMarkRead={markRead} />
          )}
          ListHeaderComponent={
            items.length > 0 ? (
              <View className="py-3">
                <Text className="text-xs text-white/40">
                  {unreadCount > 0
                    ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                    : 'All caught up'}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNotificationTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
