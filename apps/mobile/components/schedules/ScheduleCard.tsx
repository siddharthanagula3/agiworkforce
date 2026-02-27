import { useCallback } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Clock, Trash2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';
import type { Schedule } from '@/stores/scheduleStore';

interface ScheduleCardProps {
  schedule: Schedule;
  index: number;
  onPress: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(timeOfDay: string): string {
  const [hoursStr, minutesStr] = timeOfDay.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = minutesStr ?? '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

function formatRecurrence(schedule: Schedule): string {
  const time = formatTime(schedule.timeOfDay);

  switch (schedule.recurrence) {
    case 'once': {
      if (schedule.scheduledAt) {
        const date = new Date(schedule.scheduledAt);
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        const day = date.getDate();
        return `Once on ${month} ${day} at ${time}`;
      }
      return `Once at ${time}`;
    }
    case 'daily':
      return `Daily at ${time}`;
    case 'weekly': {
      if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
        const days = schedule.daysOfWeek.map((d) => DAY_LABELS[d]).join(', ');
        return `Every ${days} at ${time}`;
      }
      return `Weekly at ${time}`;
    }
    case 'monthly': {
      const day = schedule.dayOfMonth ?? 1;
      const suffix =
        day === 1 || day === 21 || day === 31
          ? 'st'
          : day === 2 || day === 22
            ? 'nd'
            : day === 3 || day === 23
              ? 'rd'
              : 'th';
      return `Monthly on the ${day}${suffix} at ${time}`;
    }
    case 'custom':
      return schedule.cronExpression ? `Cron: ${schedule.cronExpression}` : `Custom at ${time}`;
    default:
      return time;
  }
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return 'Not scheduled';
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff < 0) return 'Overdue';

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

type StatusBadgeColor = 'green' | 'red' | 'yellow' | 'gray';
function getStatusBadge(status: Schedule['lastRunStatus']): {
  label: string;
  color: StatusBadgeColor;
} {
  switch (status) {
    case 'success':
      return { label: 'Success', color: 'green' };
    case 'failed':
      return { label: 'Failed', color: 'red' };
    case 'pending':
      return { label: 'Pending', color: 'yellow' };
    default:
      return { label: 'Never', color: 'gray' };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleCard({ schedule, index, onPress, onToggle, onDelete }: ScheduleCardProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const statusBadge = getStatusBadge(schedule.lastRunStatus);

  const handleDelete = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onDelete(schedule.id);
  }, [hapticsEnabled, onDelete, schedule.id]);

  return (
    <Animated.View
      entering={FadeInDown.duration(300)
        .delay(index * 60)
        .springify()}
    >
      <Pressable onPress={() => onPress(schedule.id)} className="mb-3 active:opacity-80">
        <Card variant="elevated">
          {/* Row 1: Name + Toggle */}
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-[15px] font-semibold text-white flex-1 mr-3" numberOfLines={1}>
              {schedule.name}
            </Text>
            <Switch value={schedule.isActive} onValueChange={() => onToggle(schedule.id)} />
          </View>

          {/* Row 2: Prompt (truncated) */}
          <Text className="text-sm text-white/50 mb-2.5 leading-[18px]" numberOfLines={2}>
            {schedule.prompt}
          </Text>

          {/* Row 3: Recurrence */}
          <View className="flex-row items-center gap-1.5 mb-2.5">
            <Clock size={13} color={colors.textMuted} />
            <Text className="text-xs text-white/60">{formatRecurrence(schedule)}</Text>
          </View>

          {/* Row 4: Model + Last run status */}
          <View className="flex-row items-center gap-2 mb-2">
            <Badge label={schedule.model} color="gray" />
            <Badge label={statusBadge.label} color={statusBadge.color} />
          </View>

          {/* Footer: Next run + delete */}
          <View className="flex-row items-center justify-between mt-1">
            <Text className="text-[11px] text-white/30">
              Next run: {formatRelativeTime(schedule.nextRunAt)}
            </Text>
            <Pressable
              onPress={handleDelete}
              hitSlop={12}
              className="p-1.5 rounded-md active:bg-red-500/10"
            >
              <Trash2 size={14} color={colors.agentError} />
            </Pressable>
          </View>
        </Card>
      </Pressable>
    </Animated.View>
  );
}
