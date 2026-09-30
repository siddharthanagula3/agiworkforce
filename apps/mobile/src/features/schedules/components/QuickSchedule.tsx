import { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Keyboard,
} from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { Zap, X, Plus, ArrowUp } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { VoiceInputButton } from '@/src/features/voice/components/VoiceInputButton';
import { showVoicePermissionAlert } from '@/src/features/voice/components/voicePermissionAlert';
import { useScheduleStore, type CreateScheduleInput } from '../store';
import { requestsSubDailySchedule } from '../policy';
import { DEFAULT_AUTO_MODE_ID } from '@/lib/models';

interface ParsedSchedule {
  recurrence: 'daily' | 'weekly' | 'monthly' | 'once';
  timeOfDay: string;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  description: string;
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

function extractTime(text: string): string {
  const atMatch = text.match(/(?:at|@)\s*([\w:]+(?:\s*(?:am|pm))?)/i);
  if (atMatch) {
    const parsed = parseTime(atMatch[1]);
    if (parsed) return parsed;
  }
  return '09:00';
}

export function parseNaturalLanguage(text: string): ParsedSchedule | null {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;
  if (requestsSubDailySchedule(lower)) return null;

  const timeOfDay = extractTime(text);

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

  if (lower.match(/(?:at|@)\s*([\w:]+(?:\s*(?:am|pm))?)/i)) {
    return { recurrence: 'daily', timeOfDay, description: `Daily at ${timeOfDay}` };
  }

  return null;
}

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
  const [visible, setVisible] = useState(false);
  const [input, setInput] = useState('');
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const createSchedule = useScheduleStore((s) => s.createSchedule);

  const parsed = input.trim() ? parseNaturalLanguage(input) : null;

  const handleOpen = useCallback(() => {
    Keyboard.dismiss();
    setError('');
    setVisible(true);
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setError('');
  }, []);

  const handleCreate = useCallback(async () => {
    if (!parsed) {
      setError('Could not understand the schedule. Try "Every day at 9am".');
      return;
    }
    if (!prompt.trim()) {
      setError('Please enter what the AI should do.');
      return;
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
        scheduledAt: null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
          onPress={onDetailedCreate ?? handleOpen}
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
          onSubmitEditing={handleOpen}
        />
        <View className="h-11 w-11 items-center justify-center">
          <VoiceInputButton onTranscription={handleTranscription} onError={handleVoiceError} />
        </View>
        <PressableBox
          onPress={handleOpen}
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
        <Text className="mx-4 mb-2 text-xs" style={{ color: colors.agentError }}>
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
              style={{ backgroundColor: colors.surfaceOverlay }}
            >
              {/* Header */}
              <View className="flex-row items-center justify-between px-4 pt-5 pb-3">
                <View className="flex-row items-center gap-2">
                  <Zap size={18} color={colors.teal} />
                  <Text className="text-[16px] font-semibold text-white">Quick Schedule</Text>
                </View>
                <PressableBox
                  onPress={handleClose}
                  className="w-7 h-7 rounded-full items-center justify-center active:bg-white/10"
                >
                  <X size={16} color={colors.textMuted} />
                </PressableBox>
              </View>

              <View className="px-4 pb-8">
                {/* Natural language input */}
                <Text className="text-[12px] text-white/50 mb-2">When should it run?</Text>
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

                {/* Parsed preview */}
                {parsed && (
                  <View
                    className="flex-row items-center gap-2 px-3 py-2 rounded-lg mb-3"
                    style={{ backgroundColor: `${colors.teal}12` }}
                  >
                    <Zap size={12} color={colors.teal} />
                    <Text className="text-[12px]" style={{ color: colors.teal }}>
                      {parsed.description}
                    </Text>
                  </View>
                )}

                {/* Suggestion chips */}
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
                        className="text-[12px]"
                        style={{ color: input === s ? colors.teal : colors.textSecondary }}
                      >
                        {s}
                      </Text>
                    </PressableBox>
                  ))}
                </View>

                {/* Prompt input */}
                <Text className="text-[12px] text-white/50 mb-2">What should the AI do?</Text>
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

                {/* Error */}
                {error ? <Text className="text-[12px] text-red-400 mb-3">{error}</Text> : null}

                {/* Create button */}
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
                    <ActivityIndicator color={colors.accentText} size="small" />
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
