/**
 * Quick Schedule
 *
 * Natural-language schedule creation chip. Accepts free-form phrases like
 * "Run this every day at 9am" and parses them into a schedule without
 * needing the full form. Sends parsed data to the schedule store on confirm.
 *
 * Parsing is intentionally lightweight — only covers the most common patterns.
 * Complex schedules should use the full ScheduleForm.
 */
import { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { Zap, X, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useScheduleStore, type CreateScheduleInput } from '@/stores/scheduleStore';
import { colors } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Natural language parser
// ---------------------------------------------------------------------------

interface ParsedSchedule {
  recurrence: 'daily' | 'weekly' | 'monthly' | 'once';
  timeOfDay: string; // HH:MM
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
  // Try "9am", "9:30am", "14:00", "2pm", "noon", "midnight"
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

/** Extract a time string from a sentence. Returns parsed time or default "09:00". */
function extractTime(text: string): string {
  // Look for patterns: "at 9am", "at 9:30", "at noon", "@ 2pm"
  const atMatch = text.match(/(?:at|@)\s*([\w:]+(?:\s*(?:am|pm))?)/i);
  if (atMatch) {
    const parsed = parseTime(atMatch[1]);
    if (parsed) return parsed;
  }
  return '09:00';
}

/** Parse a natural language string into a structured schedule. */
export function parseNaturalLanguage(text: string): ParsedSchedule | null {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;

  const timeOfDay = extractTime(text);

  // Weekly: "every monday", "on tuesdays and thursdays", "every mon, wed, fri"
  const dayMatches: number[] = [];
  for (const [name, idx] of Object.entries(DAY_NAMES)) {
    // Check for whole-word match
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

  // Monthly: "every 1st", "on the 15th", "monthly"
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

  // Daily
  if (/daily|every\s+day|each\s+day/.test(lower)) {
    return {
      recurrence: 'daily',
      timeOfDay,
      description: `Daily at ${timeOfDay}`,
    };
  }

  // "every morning" → 8am, "every evening" → 18:00
  if (/every\s+morning/.test(lower)) {
    return { recurrence: 'daily', timeOfDay: '08:00', description: 'Daily at 08:00' };
  }
  if (/every\s+evening/.test(lower)) {
    return { recurrence: 'daily', timeOfDay: '18:00', description: 'Daily at 18:00' };
  }
  if (/every\s+night/.test(lower)) {
    return { recurrence: 'daily', timeOfDay: '21:00', description: 'Daily at 21:00' };
  }

  // Weekdays
  if (/weekdays?|every\s+weekday/.test(lower)) {
    return {
      recurrence: 'weekly',
      timeOfDay,
      daysOfWeek: [1, 2, 3, 4, 5],
      description: `Weekdays at ${timeOfDay}`,
    };
  }

  // Weekends
  if (/weekends?|every\s+weekend/.test(lower)) {
    return {
      recurrence: 'weekly',
      timeOfDay,
      daysOfWeek: [0, 6],
      description: `Weekends at ${timeOfDay}`,
    };
  }

  // Fall back to daily if a time was specified
  if (lower.match(/(?:at|@)\s*([\w:]+(?:\s*(?:am|pm))?)/i)) {
    return { recurrence: 'daily', timeOfDay, description: `Daily at ${timeOfDay}` };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Suggestion chips
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  'Every day at 9am',
  'Weekdays at 8am',
  'Every Monday at 10am',
  'Every Sunday at 6pm',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface QuickScheduleProps {
  /** Pre-filled prompt text (e.g., from current chat context) */
  defaultPrompt?: string;
  onCreated?: () => void;
}

export function QuickSchedule({ defaultPrompt = '', onCreated }: QuickScheduleProps) {
  const [visible, setVisible] = useState(false);
  const [input, setInput] = useState('');
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const createSchedule = useScheduleStore((s) => s.createSchedule);

  const parsed = input.trim() ? parseNaturalLanguage(input) : null;

  const handleOpen = useCallback(() => {
    setInput('');
    setPrompt(defaultPrompt);
    setError('');
    setVisible(true);
  }, [defaultPrompt]);

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
        model: 'auto-balanced',
        recurrence: parsed.recurrence,
        timeOfDay: parsed.timeOfDay,
        daysOfWeek: parsed.daysOfWeek,
        dayOfMonth: parsed.dayOfMonth,
        scheduledAt: null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        isActive: true,
      };
      await createSchedule(scheduleInput);
      handleClose();
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

  return (
    <>
      {/* Trigger button */}
      <Pressable
        onPress={handleOpen}
        className="flex-row items-center gap-2 px-4 py-2.5 rounded-xl active:opacity-70"
        style={{
          backgroundColor: `${colors.teal}12`,
          borderWidth: 1,
          borderColor: `${colors.teal}25`,
        }}
        accessibilityLabel="Quick schedule"
        accessibilityRole="button"
      >
        <Zap size={16} color={colors.teal} />
        <Text className="text-[13px] font-medium flex-1" style={{ color: colors.teal }}>
          Quick Schedule
        </Text>
        <ChevronRight size={14} color={`${colors.teal}70`} />
      </Pressable>

      {/* Modal */}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <Pressable
            className="flex-1"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onPress={handleClose}
          >
            <Pressable
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
                <Pressable
                  onPress={handleClose}
                  className="w-7 h-7 rounded-full items-center justify-center active:bg-white/10"
                >
                  <X size={16} color={colors.textMuted} />
                </Pressable>
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
                    style={{ flex: 1, color: colors.textPrimary, fontSize: 15 }}
                    autoFocus
                    returnKeyType="next"
                  />
                  {input.length > 0 && (
                    <Pressable onPress={() => setInput('')} hitSlop={8}>
                      <X size={14} color={colors.textMuted} />
                    </Pressable>
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
                    <Pressable
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
                    </Pressable>
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
                      fontSize: 14,
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
                <Pressable
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
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Text className="text-[15px] font-semibold text-white">Create Schedule</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
