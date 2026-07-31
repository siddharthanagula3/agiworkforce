/**
 * Notification Center Screen
 *
 * Lists all in-app notifications with timestamps, priority tiers,
 * and quick actions. Tapping an item deep-links to the relevant screen.
 */
import { useCallback } from 'react';
import { View, Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
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
import { formatNotificationTime } from '@/src/features/notifications/time';
import {
  useNotificationCenter,
  getPriorityLabel,
  type NotificationCenterItem,
  type NotificationPriority,
} from '@/services/notifications';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';

// ---------------------------------------------------------------------------
// Priority Icon
// ---------------------------------------------------------------------------

function getPriorityTone(
  priority: NotificationPriority,
  colors: ColorScheme,
): { color: string; border: string } {
  switch (priority) {
    case 'critical':
      return { color: colors.agentError, border: colors.dangerBorder };
    case 'high':
      return { color: colors.agentWarning, border: colors.warningBorder };
    case 'normal':
      return { color: colors.teal, border: colors.successBorder };
    case 'low':
      return { color: colors.textMuted, border: colors.neutralBorder };
  }
}

function PriorityIcon({ priority, color }: { priority: NotificationPriority; color: string }) {
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
  const colors = useThemeColors();
  const priorityTone = getPriorityTone(item.priority, colors);
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
            backgroundColor: item.read ? colors.surfaceElevated : colors.neutralSurface,
            borderWidth: 1,
            borderColor: item.read ? colors.borderLight : priorityTone.border,
          }}
        >
          {/* Header row */}
          <View className="flex-row items-start gap-2.5 mb-1">
            <View style={{ marginTop: 1 }}>
              <PriorityIcon priority={item.priority} color={priorityTone.color} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2 mb-0.5">
                <Text
                  className="text-xs font-semibold flex-1"
                  style={{ color: item.read ? colors.textSecondary : colors.textPrimary }}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                {!item.read && (
                  <View
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: priorityTone.color }}
                  />
                )}
              </View>
              <Text
                className="text-[11px] leading-4"
                style={{ color: item.read ? colors.textMuted : colors.textSecondary }}
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
            <Text className="text-[10px] flex-1" style={{ color: colors.textMuted }}>
              {timeLabel}
            </Text>
            {!item.read && (
              <Pressable
                onPress={() => onMarkRead(item.id)}
                className="px-2 py-0.5 rounded-md"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.surfaceHover : colors.neutralSurface,
                })}
                accessibilityLabel="Mark as read"
                accessibilityRole="button"
              >
                <Text className="text-[10px]" style={{ color: colors.textSecondary }}>
                  Mark read
                </Text>
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
  const colors = useThemeColors();
  const router = useRouter();
  const { items, unreadCount, markRead, markAllRead, clear } = useNotificationCenter();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/(app)' as const });
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
            router.push({
              pathname: '/(app)/companion/agent/[id]' as const,
              params: { id: agentId },
            });
          } else {
            router.push({ pathname: '/(app)/companion' as const });
          }
          break;
        case 'agent_approval_needed':
        case 'approval_pending_escalation':
          router.push({ pathname: '/(app)/companion' as const });
          break;
        case 'agent_paused':
          if (agentId) {
            router.push({
              pathname: '/(app)/companion/agent/[id]' as const,
              params: { id: agentId },
            });
          } else {
            router.push({ pathname: '/(app)/companion' as const });
          }
          break;
        case 'task_completed':
          if (route && typeof route === 'string') {
            router.push(route as Parameters<typeof router.push>[0]);
          } else {
            router.push({ pathname: '/(app)' as const });
          }
          break;
        case 'schedule_triggered':
          router.push({ pathname: '/(app)/schedules' as const });
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

  if (!FEATURES.cloudChat) return null;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      {/* Header */}
      <View className="flex-row items-center px-3 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg"
          style={({ pressed }) => pressed && { backgroundColor: colors.surfaceHover }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2 flex-1" style={{ color: colors.textPrimary }}>
          Notifications
        </Text>
        {unreadCount > 0 && (
          <View
            className="rounded-full px-2 py-0.5 mr-2"
            style={{ backgroundColor: colors.successSurface }}
          >
            <Text className="text-[10px] font-bold" style={{ color: colors.teal }}>
              {unreadCount}
            </Text>
          </View>
        )}
        {items.length > 0 && (
          <View className="flex-row gap-1">
            {unreadCount > 0 && (
              <Pressable
                onPress={markAllRead}
                className="p-2 rounded-lg"
                style={({ pressed }) => pressed && { backgroundColor: colors.surfaceHover }}
                accessibilityLabel="Mark all as read"
                accessibilityRole="button"
              >
                <CheckCheck size={18} color={colors.textSecondary} />
              </Pressable>
            )}
            <Pressable
              onPress={handleClearAll}
              className="p-2 rounded-lg"
              style={({ pressed }) => pressed && { backgroundColor: colors.surfaceHover }}
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
          <View
            className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
            style={{ backgroundColor: colors.neutralSurface }}
          >
            <BellOff size={28} color={colors.textMuted} />
          </View>
          <Text className="text-center text-sm" style={{ color: colors.textSecondary }}>
            No notifications yet.
          </Text>
          <Text className="text-center text-xs mt-1" style={{ color: colors.textMuted }}>
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
                <Text className="text-xs" style={{ color: colors.textMuted }}>
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
