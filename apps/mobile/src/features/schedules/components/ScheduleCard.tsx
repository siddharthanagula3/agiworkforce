import { useCallback, useState } from 'react';
import { getScheduleActionAvailability } from '@agiworkforce/cloud-contracts';
import { View, type AccessibilityActionEvent, type GestureResponderEvent } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Clock, ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { Separator } from '@/components/ui/Separator';
import { ScheduleRunHistory } from './ScheduleRunHistory';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors, motion } from '@/src/ui/theme';
import { useScheduleStore, type Schedule } from '../store';
import { triggerScheduleNow } from '../service';
import { isMobileScheduleRecurrenceSupported } from '../policy';
import { toUserMessage } from '@/services/userMessage';
import { ActionMenuSheet } from '@/src/features/conversation-actions/RenameConversationModal';
import { useActionMenu } from '@/src/shared/hooks/useActionMenu';
import type { ConversationMenuAction } from '@/src/features/conversation-actions/useConversationActions';

interface ScheduleCardProps {
  schedule: Schedule;
  index: number;
  onPress: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RUN_NOW_FAILED = 'The run could not start. Try again.';
const RESUME_TO_RUN = 'Resume this schedule to run it now.';
const MORE_ACTIONS_ACCESSIBILITY_ACTION = 'more-actions';
const CARD_ACCESSIBILITY_ACTIONS = [
  { name: MORE_ACTIONS_ACCESSIBILITY_ACTION, label: 'More actions' },
];

function formatTime(timeOfDay: string): string {
  const [hoursStr, minutesStr] = timeOfDay.split(':');
  const parsedHours = parseInt(hoursStr, 10);
  const parsedMinutes = parseInt(minutesStr ?? '', 10);
  const hours =
    Number.isFinite(parsedHours) && parsedHours >= 0 && parsedHours <= 23 ? parsedHours : 9;
  const minutes =
    Number.isFinite(parsedMinutes) && parsedMinutes >= 0 && parsedMinutes <= 59
      ? parsedMinutes.toString().padStart(2, '0')
      : '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

function parseValidDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatRecurrence(schedule: Schedule): string {
  const time = formatTime(schedule.timeOfDay);

  switch (schedule.recurrence) {
    case 'once': {
      if (schedule.scheduledAt) {
        const date = parseValidDate(schedule.scheduledAt);
        if (!date) return `Once at ${time}`;
        const month = date.toLocaleDateString(undefined, { month: 'short' });
        const day = date.getDate();
        return `Once on ${month} ${day} at ${time}`;
      }
      return `Once at ${time}`;
    }
    case 'daily':
      return `Daily at ${time}`;
    case 'weekly': {
      if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
        const days = schedule.daysOfWeek
          .filter((d) => Number.isInteger(d) && d >= 0 && d < DAY_LABELS.length)
          .map((d) => DAY_LABELS[d]);
        if (days.length > 0) return `Every ${days.join(', ')} at ${time}`;
      }
      return `Weekly at ${time}`;
    }
    case 'monthly': {
      const rawDay = schedule.dayOfMonth ?? 1;
      const day = Number.isInteger(rawDay) && rawDay >= 1 && rawDay <= 31 ? rawDay : 1;
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
    case 'interval': {
      const minutes = Math.max(1, Math.round((schedule.intervalMs ?? 60_000) / 60_000));
      if (minutes % 1_440 === 0) {
        const days = minutes / 1_440;
        return `Every ${days} ${days === 1 ? 'day' : 'days'}`;
      }
      if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return `Every ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
      }
      return `Every ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    }
    case 'rrule':
      return schedule.recurrenceRule
        ? `Rule: ${schedule.recurrenceRule}`
        : `Custom rule at ${time}`;
    case 'event':
      return 'When an event fires';
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

function formatLastRun(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const at = new Date(isoDate);
  if (!Number.isFinite(at.getTime())) return null;
  const minutes = Math.floor((Date.now() - at.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return at.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function describeLastRun(schedule: Schedule): { text: string; failed: boolean } {
  const when = formatLastRun(schedule.lastRunAt);
  if (!when) return { text: 'Not run yet', failed: false };
  if (schedule.lastRunStatus === 'failed') return { text: `Last run failed ${when}`, failed: true };
  return { text: `Last run ${when}`, failed: false };
}

const claimTouch = () => true;

export function ScheduleCard({ schedule, index, onPress, onToggle, onDelete }: ScheduleCardProps) {
  const colors = useThemeColors();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const lastRun = describeLastRun(schedule);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const hasLegacyCadence = !isMobileScheduleRecurrenceSupported(schedule.recurrence);
  const fetchRuns = useScheduleStore((s) => s.fetchRuns);
  const fetchSchedules = useScheduleStore((s) => s.fetchSchedules);
  const moreMenu = useActionMenu();
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const availability =
    schedule.status && schedule.actionType
      ? getScheduleActionAvailability({
          status: schedule.status,
          actionType: schedule.actionType,
          isEnabled: schedule.isActive,
        })
      : null;

  const handleRunNow = useCallback(async () => {
    if (starting || !availability?.canRun) return;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setStarting(true);
    setRunError(null);
    try {
      await triggerScheduleNow(schedule.id);
      setHistoryExpanded(true);
      await Promise.all([fetchRuns(schedule.id), fetchSchedules()]);
    } catch (error) {
      setRunError(toUserMessage(error, RUN_NOW_FAILED));
    } finally {
      setStarting(false);
    }
  }, [starting, availability?.canRun, hapticsEnabled, schedule.id, fetchRuns, fetchSchedules]);

  const handleDelete = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onDelete(schedule.id);
  }, [hapticsEnabled, onDelete, schedule.id]);

  const toggleHistory = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setHistoryExpanded((v) => !v);
  }, [hapticsEnabled]);

  const handleToggleHistory = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      toggleHistory();
    },
    [toggleHistory],
  );

  const openMoreActions = useCallback(() => {
    const actions: ConversationMenuAction[] = [];
    if (availability?.canRun && !starting) {
      actions.push({ key: 'run-now', label: 'Run now', run: () => void handleRunNow() });
    }
    if (availability?.canToggle && !starting) {
      actions.push({
        key: 'toggle-active',
        label: schedule.isActive ? 'Pause' : 'Resume',
        run: () => onToggle(schedule.id),
      });
    }
    actions.push({
      key: 'toggle-history',
      label: historyExpanded ? 'Hide history' : 'Show history',
      run: toggleHistory,
    });
    if (availability?.canEdit) {
      actions.push({ key: 'edit', label: 'Edit', run: () => onPress(schedule.id) });
    }
    actions.push({ key: 'delete', label: 'Delete', destructive: true, run: handleDelete });
    moreMenu.open(
      schedule.name,
      actions,
      !availability?.canRun &&
        availability?.canToggle &&
        !schedule.isActive &&
        schedule.pausedReason !== 'approval_required'
        ? RESUME_TO_RUN
        : undefined,
    );
  }, [
    availability?.canEdit,
    availability?.canRun,
    availability?.canToggle,
    handleDelete,
    handleRunNow,
    historyExpanded,
    moreMenu,
    onPress,
    onToggle,
    schedule.id,
    schedule.isActive,
    schedule.name,
    schedule.pausedReason,
    starting,
    toggleHistory,
  ]);

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === MORE_ACTIONS_ACCESSIBILITY_ACTION) openMoreActions();
    },
    [openMoreActions],
  );

  return (
    <Animated.View
      entering={FadeInDown.duration(motion.moved)
        .delay(index * 60)
        .springify()}
    >
      <PressableBox
        onPress={availability?.canEdit ? () => onPress(schedule.id) : undefined}
        className="mb-3 active:opacity-80"
        accessibilityLabel={`Schedule: ${schedule.name}, ${formatRecurrence(schedule)}`}
        accessibilityRole={availability?.canEdit ? 'button' : undefined}
        accessibilityActions={CARD_ACCESSIBILITY_ACTIONS}
        onAccessibilityAction={handleAccessibilityAction}
      >
        <Card variant="elevated">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-[15px] font-semibold text-white flex-1 mr-3" numberOfLines={1}>
              {schedule.name}
            </Text>
            <Switch
              value={schedule.isActive}
              disabled={!availability?.canToggle || starting}
              onValueChange={() => onToggle(schedule.id)}
            />
            <View onStartShouldSetResponder={claimTouch}>
              <PressableBox
                onPress={openMoreActions}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                accessibilityLabel={`More actions for ${schedule.name}`}
                accessibilityRole="button"
              >
                <MoreHorizontal size={20} color={colors.textSecondary} />
              </PressableBox>
            </View>
          </View>

          <Text className="text-sm text-white/50 mb-2.5 leading-[18px]" numberOfLines={2}>
            {schedule.prompt}
          </Text>

          <View className="flex-row items-center gap-1.5 mb-2.5">
            <Clock size={13} color={colors.textMuted} />
            <Text className="text-sm text-white/60">{formatRecurrence(schedule)}</Text>
          </View>
          {hasLegacyCadence ? (
            <Text className="mb-2.5 text-sm leading-5 text-amber-400">
              Edit this cadence on Web, or switch to Once, Daily, Weekly or Monthly.
            </Text>
          ) : null}
          {schedule.pausedReason === 'approval_required' ? (
            <Text className="mb-2.5 text-sm leading-5" style={{ color: colors.agentWarning }}>
              Paused for your approval, so approve or deny it in History.
            </Text>
          ) : null}

          <Text
            className="text-sm mb-2"
            style={{ color: lastRun.failed ? colors.agentError : colors.textMuted }}
          >
            {lastRun.text}
          </Text>

          <View className="flex-row flex-wrap items-center justify-between mt-1">
            <Text className="text-sm text-white/30">
              Next run: {formatRelativeTime(schedule.nextRunAt)}
            </Text>
            <View className="flex-row items-center gap-1" onStartShouldSetResponder={claimTouch}>
              {starting ? (
                <Text accessibilityLiveRegion="polite" className="text-sm text-white/40">
                  Starting…
                </Text>
              ) : null}
              <PressableBox
                onPress={handleToggleHistory}
                hitSlop={8}
                className="flex-row items-center gap-1 px-2 py-1 rounded-md active:bg-white/5"
                accessibilityLabel={historyExpanded ? 'Hide run history' : 'Show run history'}
                accessibilityRole="button"
              >
                <Text className="text-sm text-white/40">History</Text>
                {historyExpanded ? (
                  <ChevronUp size={11} color={colors.textMuted} />
                ) : (
                  <ChevronDown size={11} color={colors.textMuted} />
                )}
              </PressableBox>
            </View>
          </View>

          {runError ? (
            <Text className="mt-2 text-sm leading-5" style={{ color: colors.agentError }}>
              {runError}
            </Text>
          ) : null}

          <ActionMenuSheet
            menu={moreMenu.menu}
            dismissLabel={`Dismiss actions for ${schedule.name}`}
          />

          {historyExpanded && (
            <View onStartShouldSetResponder={claimTouch}>
              <Separator className="mt-3 mb-3" />
              <ScheduleRunHistory scheduleId={schedule.id} maxRuns={5} />
            </View>
          )}
        </Card>
      </PressableBox>
    </Animated.View>
  );
}
