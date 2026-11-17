import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useState, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Zap, X, Plus, ArrowUp } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { contentColumnInset } from '@/src/shared/layout/contentColumn';
import {
  VoiceInputButton,
  type VoiceInputHandle,
} from '@/src/features/voice/components/VoiceInputButton';
import { showVoicePermissionAlert } from '@/src/features/voice/components/voicePermissionAlert';
import { useScheduleStore, type CreateScheduleInput } from '../store';
import { requestsSubDailySchedule } from '../policy';
import { isoToZonedDateInput, scheduleTimingProblem, zonedDateAndTimeToIso } from '../timing';
import { DEFAULT_AUTO_MODE_ID } from '@/lib/models';

interface ParsedSchedule {
  recurrence: 'daily' | 'weekly' | 'monthly' | 'once';
  timeOfDay: string;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  scheduledDate?: string;
  description: string;
}

interface ParseOptions {
  now?: Date;
  timezone?: string;
}

const DAY_NAMES: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function parseTime(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  if (lower === 'noon') return '12:00';
  if (lower === 'midnight') return '00:00';

  const match = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] ?? '0', 10);
  const period = match[3];

  if (period === 'pm' && hours !== 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const TIME_INTRODUCER = /(?:\bat\b|@)\s*([\w:]+(?:\s*(?:am|pm))?)/gi;
const BARE_CLOCK = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;

function findExplicitTime(text: string): {
  introduced: boolean;
  time: string | null;
  phrase: string | null;
} {
  let introduced = false;
  for (const match of text.matchAll(TIME_INTRODUCER)) {
    introduced = true;
    const time = parseTime(match[1]);
    if (time) return { introduced, time, phrase: match[0] };
  }
  if (!introduced) {
    const bare = BARE_CLOCK.exec(text);
    const time = bare ? parseTime(bare[0]) : null;
    if (bare && time) return { introduced, time, phrase: bare[0] };
  }
  return { introduced, time: null, phrase: null };
}

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const MONTH_NAME = Object.keys(MONTHS).join('|');
const MONTH_FIRST = new RegExp(
  `\\b(${MONTH_NAME})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,
);
const DAY_FIRST = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAME})\\.?(?:,?\\s+(\\d{4}))?\\b`,
);
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const NUMERIC_DATE = /\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/;
const RELATIVE_WEEKDAY = new RegExp(
  `\\b(?:next|this|coming)\\s+(?:${Object.keys(DAY_NAMES).join('|')})\\b`,
);

const pad = (value: number) => String(value).padStart(2, '0');

function dateInput(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDays(input: string, days: number): string {
  const [year, month, day] = input.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

type DateReading = { kind: 'none' } | { kind: 'unreadable' } | { kind: 'date'; value: string };

function findOneTimeDate(lower: string, today: string): DateReading {
  const iso = ISO_DATE.exec(lower);
  if (iso) {
    const value = dateInput(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return value ? { kind: 'date', value } : { kind: 'unreadable' };
  }
  const named = MONTH_FIRST.exec(lower);
  const dayFirst = named ? null : DAY_FIRST.exec(lower);
  if (named || dayFirst) {
    const month = MONTHS[(named ? named[1] : dayFirst![2])!]!;
    const day = Number(named ? named[2] : dayFirst![1]);
    const yearText = named ? named[3] : dayFirst![3];
    const thisYear = Number(today.slice(0, 4));
    let value = dateInput(yearText ? Number(yearText) : thisYear, month, day);
    if (value && !yearText && value < today) value = dateInput(thisYear + 1, month, day);
    return value ? { kind: 'date', value } : { kind: 'unreadable' };
  }
  if (NUMERIC_DATE.test(lower) || RELATIVE_WEEKDAY.test(lower)) return { kind: 'unreadable' };
  if (/\btomorrow\b/.test(lower)) return { kind: 'date', value: addDays(today, 1) };
  if (/\btoday\b/.test(lower)) return { kind: 'date', value: today };
  return { kind: 'none' };
}

function describeDate(input: string): string {
  const [year, month, day] = input.split('-').map(Number);
  return `${MONTH_LABELS[month! - 1]} ${day}, ${year}`;
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function parseNaturalLanguage(
  text: string,
  { now = new Date(), timezone = deviceTimezone() }: ParseOptions = {},
): ParsedSchedule | null {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;
  if (requestsSubDailySchedule(lower)) return null;

  const explicit = findExplicitTime(text);
  if (explicit.introduced && !explicit.time) return null;
  const timeOfDay = explicit.time ?? '09:00';

  let today: string;
  try {
    today = isoToZonedDateInput(now.toISOString(), timezone);
  } catch {
    return null;
  }
  const oneTime = findOneTimeDate(lower, today);
  if (oneTime.kind === 'unreadable') return null;
  if (oneTime.kind === 'date') {
    if (/\b(?:every|each|daily|weekly|monthly)\b/.test(lower)) return null;
    return {
      recurrence: 'once',
      timeOfDay,
      scheduledDate: oneTime.value,
      description: `Once on ${describeDate(oneTime.value)} at ${timeOfDay}`,
    };
  }
  if (/\bonce\b/.test(lower) && !/\bonce\s+a\s+month\b/.test(lower)) return null;

  const dayMatches: number[] = [];
  for (const [name, idx] of Object.entries(DAY_NAMES)) {
    const re = new RegExp(`\\b${name}s?\\b`);
    if (re.test(lower)) {
      if (!dayMatches.includes(idx)) dayMatches.push(idx);
    }
  }

  if (dayMatches.length > 0) {
    const dayLabels = dayMatches
      .map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])
      .join(', ');
    return {
      recurrence: 'weekly',
      timeOfDay,
      daysOfWeek: dayMatches.sort((a, b) => a - b),
      description: `Every ${dayLabels} at ${timeOfDay}`,
    };
  }

  const monthlyMatch = lower.match(
    /(?:every\s+)?(\d{1,2})(?:st|nd|rd|th)|monthly|once\s+a\s+month/,
  );
  if (monthlyMatch) {
    const day = monthlyMatch[1] ? parseInt(monthlyMatch[1], 10) : 1;
    const clampedDay = Math.min(Math.max(day, 1), 31);
    return {
      recurrence: 'monthly',
      timeOfDay,
      dayOfMonth: clampedDay,
      description: `Monthly on the ${clampedDay} at ${timeOfDay}`,
    };
  }

  if (/daily|every\s+day|each\s+day/.test(lower)) {
    return {
      recurrence: 'daily',
      timeOfDay,
      description: `Daily at ${timeOfDay}`,
    };
  }

  if (/every\s+morning/.test(lower)) {
    return { recurrence: 'daily', timeOfDay: '08:00', description: 'Daily at 08:00' };
  }
  if (/every\s+evening/.test(lower)) {
    return { recurrence: 'daily', timeOfDay: '18:00', description: 'Daily at 18:00' };
  }
  if (/every\s+night/.test(lower)) {
    return { recurrence: 'daily', timeOfDay: '21:00', description: 'Daily at 21:00' };
  }

  if (/weekdays?|every\s+weekday/.test(lower)) {
    return {
      recurrence: 'weekly',
      timeOfDay,
      daysOfWeek: [1, 2, 3, 4, 5],
      description: `Weekdays at ${timeOfDay}`,
    };
  }

  if (/weekends?|every\s+weekend/.test(lower)) {
    return {
      recurrence: 'weekly',
      timeOfDay,
      daysOfWeek: [0, 6],
      description: `Weekends at ${timeOfDay}`,
    };
  }

  const leftover = explicit.phrase
    ? lower.replace(explicit.phrase.toLowerCase(), '').replace(/[\s,.!]+/g, '')
    : lower;
  if (explicit.time && !leftover) {
    return { recurrence: 'daily', timeOfDay, description: `Daily at ${timeOfDay}` };
  }

  return null;
}

const NOT_UNDERSTOOD =
  'Could not understand the schedule. Try "Every day at 9am" or "January 5 at 9am".';

const SUGGESTIONS = [
  'Every day at 9am',
  'Weekdays at 8am',
  'Every Monday at 10am',
  'Every Sunday at 6pm',
];

interface QuickScheduleProps {
  defaultPrompt?: string;
  onCreated?: () => void;
  onDetailedCreate?: () => void;
}

export function QuickSchedule({
  defaultPrompt = '',
  onCreated,
  onDetailedCreate,
}: QuickScheduleProps) {
  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const voiceControlRef = useRef<VoiceInputHandle | null>(null);
  const [visible, setVisible] = useState(false);
  const [input, setInput] = useState('');
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const createSchedule = useScheduleStore((s) => s.createSchedule);

  const parsed = input.trim() ? parseNaturalLanguage(input) : null;

  const handleOpen = useCallback(() => {
    voiceControlRef.current?.cancel();
    Keyboard.dismiss();
    setError('');
    setVisible(true);
  }, []);

  const handleSend = useCallback(() => {
    const taskPrompt = prompt.trim();
    if (!taskPrompt) return;
    if (parseNaturalLanguage(taskPrompt)) setInput(taskPrompt);
    handleOpen();
  }, [prompt, handleOpen]);

  const handleClose = useCallback(() => {
    voiceControlRef.current?.cancel();
    setVisible(false);
    setError('');
  }, []);

  const handleCreate = useCallback(async () => {
    if (!parsed) {
      setError(NOT_UNDERSTOOD);
      return;
    }
    if (!prompt.trim()) {
      setError('Please enter what the AI should do.');
      return;
    }
    const timezone = deviceTimezone();
    let scheduledAt: string | null = null;
    if (parsed.recurrence === 'once' && parsed.scheduledDate) {
      try {
        scheduledAt = zonedDateAndTimeToIso(parsed.scheduledDate, parsed.timeOfDay, timezone);
      } catch (dateError) {
        setError(scheduleTimingProblem(dateError));
        return;
      }
      if (new Date(scheduledAt).getTime() <= Date.now()) {
        setError('Choose a date and time in the future');
        return;
      }
    }

    setError('');
    setLoading(true);
    try {
      const scheduleInput: CreateScheduleInput = {
        name: input.length > 40 ? input.slice(0, 40) + '...' : input,
        prompt: prompt.trim(),
        model: DEFAULT_AUTO_MODE_ID,
        recurrence: parsed.recurrence,
        timeOfDay: parsed.timeOfDay,
        daysOfWeek: parsed.daysOfWeek,
        dayOfMonth: parsed.dayOfMonth,
        scheduledAt,
        timezone,
        isActive: true,
      };
      const created = await createSchedule(scheduleInput);
      if (!created) {
        setError('Cloud sign-in changed. Sign in again and retry this task.');
        return;
      }
      handleClose();
      setInput('');
      setPrompt('');
      onCreated?.();
    } catch {
      setError('Failed to create schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [parsed, prompt, input, createSchedule, handleClose, onCreated]);

  const handleSuggestion = useCallback((suggestion: string) => {
    setInput(suggestion);
    setError('');
  }, []);

  const handleTranscription = useCallback((text: string) => {
    setPrompt((current) => (current.trim() ? `${current.trim()} ${text}` : text));
    setError('');
  }, []);

  const handleVoiceError = useCallback((message: string, permissionDenied?: boolean) => {
    if (permissionDenied) showVoicePermissionAlert(message);
    else setError(message);
  }, []);

  return (
    <>
      <View
        className="mx-4 mb-2 flex-row items-center rounded-2xl border px-2 py-1.5"
        style={{
          backgroundColor: colors.surfaceOverlay,
          borderColor: colors.border,
        }}
      >
        <PressableBox
          onPress={() => {
            voiceControlRef.current?.cancel();
            (onDetailedCreate ?? handleOpen)();
          }}
          className="h-11 w-11 items-center justify-center"
          accessibilityLabel="Open detailed schedule form"
          accessibilityRole="button"
        >
          <Plus size={22} color={colors.textPrimary} />
        </PressableBox>
        <TextInput
          value={prompt}
          onChangeText={(text) => {
            setPrompt(text);
            setError('');
          }}
          placeholder="Schedule a task"
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, minHeight: 44, color: colors.textPrimary, fontSize: typeScale.body }}
          accessibilityLabel="Schedule a task"
          returnKeyType="done"
          onSubmitEditing={handleSend}
        />
        <View className="h-11 w-11 items-center justify-center">
          <VoiceInputButton
            controlRef={voiceControlRef}
            scopeKey={String(visible)}
            disabled={visible || loading}
            onTranscription={handleTranscription}
            onError={handleVoiceError}
          />
        </View>
        <PressableBox
          onPress={handleSend}
          disabled={!prompt.trim()}
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: prompt.trim() ? colors.teal : colors.surfaceElevated }}
          accessibilityLabel="Continue scheduling task"
          accessibilityRole="button"
          accessibilityState={{ disabled: !prompt.trim() }}
        >
          <ArrowUp size={20} color={prompt.trim() ? colors.white : colors.textMuted} />
        </PressableBox>
      </View>
      {error && !visible ? (
        <Text className="mx-4 mb-2 text-sm" style={{ color: colors.agentError }}>
          {error}
        </Text>
      ) : null}

      <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <PressableBox
            className="flex-1"
            style={{ backgroundColor: colors.scrim }}
            onPress={handleClose}
          >
            <PressableBox
              onPress={(e) => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 rounded-t-3xl"
              style={{
                backgroundColor: colors.surfaceOverlay,
                marginHorizontal: contentColumnInset('reading', windowWidth),
              }}
            >
              <View className="flex-row items-center justify-between px-4 pt-5 pb-3">
                <View className="flex-row items-center gap-2">
                  <Zap size={18} color={colors.teal} />
                  <Text className="text-[16px] font-semibold text-white">Quick Schedule</Text>
                </View>
                <PressableBox
                  hitSlop={8}
                  onPress={handleClose}
                  className="w-7 h-7 rounded-full items-center justify-center active:bg-white/10"
                  accessibilityRole="button"
                  accessibilityLabel="Close quick schedule"
                >
                  <X size={16} color={colors.textMuted} />
                </PressableBox>
              </View>

              <View className="px-4 pb-8">
                <Text className="text-sm text-white/50 mb-2">When should it run?</Text>
                <View
                  className="rounded-xl px-3 py-3 mb-3 flex-row items-center"
                  style={{ backgroundColor: colors.surfaceElevated }}
                >
                  <TextInput
                    value={input}
                    onChangeText={(t) => {
                      setInput(t);
                      setError('');
                    }}
                    placeholder='e.g. "Every day at 9am"'
                    placeholderTextColor={colors.textMuted}
                    style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}
                    autoFocus
                    returnKeyType="next"
                  />
                  {input.length > 0 && (
                    <PressableBox onPress={() => setInput('')} hitSlop={8}>
                      <X size={14} color={colors.textMuted} />
                    </PressableBox>
                  )}
                </View>

                {input.trim() && !parsed ? (
                  <Text className="text-sm mb-3" style={{ color: colors.agentError }}>
                    {NOT_UNDERSTOOD}
                  </Text>
                ) : null}
                {parsed && (
                  <View
                    className="flex-row items-center gap-2 px-3 py-2 rounded-lg mb-3"
                    style={{ backgroundColor: `${colors.teal}12` }}
                  >
                    <Zap size={12} color={colors.teal} />
                    <Text className="text-sm" style={{ color: colors.teal }}>
                      {parsed.description}
                    </Text>
                  </View>
                )}

                <View className="flex-row flex-wrap gap-2 mb-4">
                  {SUGGESTIONS.map((s) => (
                    <PressableBox
                      key={s}
                      onPress={() => handleSuggestion(s)}
                      className="px-3 py-1.5 rounded-full active:opacity-70"
                      style={{
                        backgroundColor: input === s ? `${colors.teal}20` : colors.surfaceElevated,
                        borderWidth: input === s ? 1 : 0,
                        borderColor: colors.teal,
                      }}
                    >
                      <Text
                        className="text-sm"
                        style={{ color: input === s ? colors.teal : colors.textSecondary }}
                      >
                        {s}
                      </Text>
                    </PressableBox>
                  ))}
                </View>

                <Text className="text-sm text-white/50 mb-2">What should the AI do?</Text>
                <View
                  className="rounded-xl px-3 py-3 mb-3"
                  style={{ backgroundColor: colors.surfaceElevated }}
                >
                  <TextInput
                    value={prompt}
                    onChangeText={(t) => {
                      setPrompt(t);
                      setError('');
                    }}
                    placeholder="e.g. Summarise today's news headlines"
                    placeholderTextColor={colors.textMuted}
                    style={{
                      color: colors.textPrimary,
                      fontSize: typeScale.subhead,
                      minHeight: 60,
                      textAlignVertical: 'top',
                    }}
                    multiline
                    numberOfLines={3}
                    returnKeyType="done"
                  />
                </View>

                {error ? <Text className="text-sm text-red-400 mb-3">{error}</Text> : null}

                <PressableBox
                  onPress={handleCreate}
                  disabled={loading || !parsed || !prompt.trim()}
                  className="rounded-xl py-3.5 items-center justify-center active:opacity-80"
                  style={{
                    backgroundColor:
                      !loading && parsed && prompt.trim() ? colors.teal : `${colors.teal}40`,
                  }}
                  accessibilityLabel="Create schedule"
                  accessibilityRole="button"
                >
                  {loading ? (
                    <LoadingIndicator size="small" />
                  ) : (
                    <Text
                      className="text-[15px] font-semibold"
                      style={{ color: colors.accentText }}
                    >
                      Create Schedule
                    </Text>
                  )}
                </PressableBox>
              </View>
            </PressableBox>
          </PressableBox>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
