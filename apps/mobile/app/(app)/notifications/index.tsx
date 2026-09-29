import { useCallback, useMemo } from 'react';
import { ActivityIndicator, View, Alert } from 'react-native';
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
  cloudRunNotificationRoute,
  useNotificationCenter,
  getPriorityLabel,
  type NotificationCenterItem,
  type NotificationPriority,
} from '@/services/notifications';
import { useThemeColors, type ColorScheme, motion } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { translatePlural } from '@/src/i18n/plural';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import {
  accountNotificationDestination,
  useAccountNotifications,
} from '@/src/features/notifications/accountFeed';
import type { NotificationFeedItem, NotificationSeverity } from '@agiworkforce/types';

const ACCOUNT_RECORDED_EVENT_TYPES = new Set([
  'agent_approval_needed',
  'task_completed',
  'agent_failed',
  'schedule_run',
  'chat_message',
]);

const SEVERITY_PRIORITY: Record<NotificationSeverity, NotificationPriority> = {
  error: 'critical',
  warning: 'high',
  success: 'normal',
  info: 'low',
};

type InboxRow =
  | { source: 'account'; key: string; item: NotificationFeedItem }
  | { source: 'device'; key: string; item: NotificationCenterItem };

interface RowView {
  title: string;
  body: string;
  priority: NotificationPriority;
  receivedAt: string;
  read: boolean;
}

function rowView(row: InboxRow): RowView {
  if (row.source === 'device') return row.item;
  return {
    title: row.item.title,
    body: row.item.message,
    priority: SEVERITY_PRIORITY[row.item.severity],
    receivedAt: row.item.createdAt,
    read: row.item.read,
  };
}

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

interface NotificationItemProps {
  row: InboxRow;
  onPress: (row: InboxRow) => void;
  onMarkRead: (row: InboxRow) => void;
}

function NotificationItem({ row, onPress, onMarkRead }: NotificationItemProps) {
  const colors = useThemeColors();
  const item = rowView(row);
  const priorityTone = getPriorityTone(item.priority, colors);
  const timeLabel = formatNotificationTime(item.receivedAt);

  return (
    <Animated.View entering={FadeIn.duration(motion.quick)} layout={LinearTransition.springify()}>
      <Pressable
        onPress={() => onPress(row)}
        className="rounded-xl overflow-hidden active:opacity-80"
        accessibilityLabel={`${item.read ? '' : 'Unread, '}${item.title}, ${timeLabel}`}
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
                className="text-xs leading-4"
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
            <Text className="text-xs flex-1" style={{ color: colors.textMuted }}>
              {timeLabel}
            </Text>
            {!item.read && (
              <Pressable
                onPress={() => onMarkRead(row)}
                className="px-2 py-0.5 rounded-md"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.surfaceHover : colors.neutralSurface,
                })}
                accessibilityLabel="Mark as read"
                accessibilityRole="button"
              >
                <Text className="text-xs" style={{ color: colors.textSecondary }}>
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

export default function NotificationCenterScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const device = useNotificationCenter();
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const account = useAccountNotifications(cloudUnlocked);
  const accountLoaded = cloudUnlocked && !account.loading && account.error === null;

  const deviceItems = useMemo(
    () =>
      accountLoaded
        ? device.items.filter((item) => !ACCOUNT_RECORDED_EVENT_TYPES.has(item.data.type))
        : device.items,
    [accountLoaded, device.items],
  );

  const rows = useMemo<InboxRow[]>(
    () =>
      [
        ...account.items.map((item): InboxRow => ({
          source: 'account',
          key: `account:${item.id}`,
          item,
        })),
        ...deviceItems.map((item): InboxRow => ({
          source: 'device',
          key: `device:${item.id}`,
          item,
        })),
      ].sort((a, b) => rowView(b).receivedAt.localeCompare(rowView(a).receivedAt)),
    [account.items, deviceItems],
  );

  const unreadCount = account.unreadCount + deviceItems.filter((item) => !item.read).length;
  const { markRead: markDeviceRead, markAllRead: markAllDeviceRead, clear } = device;
  const { markRead: markAccountRead, markAllRead: markAllAccountRead } = account;

  const markRowRead = useCallback(
    (row: InboxRow) => {
      if (row.source === 'account') markAccountRead(row.item.id);
      else markDeviceRead(row.item.id);
    },
    [markAccountRead, markDeviceRead],
  );

  const markAllRead = useCallback(() => {
    markAllDeviceRead();
    if (cloudUnlocked) markAllAccountRead();
  }, [cloudUnlocked, markAllAccountRead, markAllDeviceRead]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/(app)' as const });
  }, [router]);

  const handleAccountPress = useCallback(
    (item: NotificationFeedItem) => {
      markAccountRead(item.id);
      const destination = accountNotificationDestination(item.href);
      if (!destination) return;
      if (destination.kind === 'native') {
        router.push(destination.route as Parameters<typeof router.push>[0]);
      } else {
        void openUntrustedUrlInAppBrowser(destination.url);
      }
    },
    [markAccountRead, router],
  );

  const handleDevicePress = useCallback(
    (item: NotificationCenterItem) => {
      markDeviceRead(item.id);
      const route = item.data.route;
      const runRoute = cloudRunNotificationRoute(item.data);
      if (runRoute) {
        router.push(runRoute);
        return;
      }

      switch (item.data.type) {
        case 'agent_failed':
        case 'emergency_stop_triggered':
        case 'agent_paused':
          router.push('/(app)/tasks' as Parameters<typeof router.push>[0]);
          break;
        case 'agent_approval_needed':
        case 'approval_pending_escalation':
          router.push({ pathname: '/(app)/companion' as const });
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
    [markDeviceRead, router],
  );

  const handleItemPress = useCallback(
    (row: InboxRow) => {
      if (row.source === 'account') handleAccountPress(row.item);
      else handleDevicePress(row.item);
    },
    [handleAccountPress, handleDevicePress],
  );

  const handleClearAll = useCallback(() => {
    Alert.alert('Clear All', 'Remove the notifications stored on this device?', [
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
            <Text className="text-xs font-bold" style={{ color: colors.teal }}>
              {unreadCount}
            </Text>
          </View>
        )}
        {rows.length > 0 && (
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
            {deviceItems.length > 0 && (
              <Pressable
                onPress={handleClearAll}
                className="p-2 rounded-lg"
                style={({ pressed }) => pressed && { backgroundColor: colors.surfaceHover }}
                accessibilityLabel="Clear notifications on this device"
                accessibilityRole="button"
              >
                <Trash2 size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* Content */}
      {rows.length === 0 && account.loading ? (
        <View
          className="flex-1 items-center justify-center"
          accessibilityLabel="Loading notifications"
        >
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : rows.length === 0 ? (
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
          {account.error ? (
            <Button
              title="Retry"
              variant="outline"
              size="sm"
              className="mt-4"
              onPress={() => void account.refresh()}
            />
          ) : null}
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(row) => row.key}
          onEndReached={() => void account.loadMore()}
          onEndReachedThreshold={0.4}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <NotificationItem row={item} onPress={handleItemPress} onMarkRead={markRowRead} />
          )}
          ListFooterComponent={
            account.loadingMore ? (
              <View className="py-4" accessibilityLabel="Loading older notifications">
                <ActivityIndicator color={colors.textSecondary} />
              </View>
            ) : null
          }
          ListHeaderComponent={
            rows.length > 0 ? (
              <View className="py-3">
                <Text className="text-xs" style={{ color: colors.textMuted }}>
                  {unreadCount > 0
                    ? translatePlural('common', 'counts.unreadNotifications', unreadCount, {
                        one: '{{count}} unread notification',
                        other: '{{count}} unread notifications',
                      })
                    : 'All caught up'}
                </Text>
                {account.error ? (
                  <Pressable
                    onPress={() => void account.refresh()}
                    accessibilityRole="button"
                    accessibilityLabel={`${account.error} Retry`}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text className="text-xs" style={{ color: colors.textSecondary }}>
                      {account.error} Tap to retry.
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
