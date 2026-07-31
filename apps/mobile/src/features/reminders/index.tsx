import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Bell, CalendarDays, Clock3, ShieldCheck } from 'lucide-react-native';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/src/ui/theme';
import {
  createIOSReminder,
  MAX_REMINDER_TITLE_LENGTH,
  parseReminderDueInputs,
  reminderDueInputsFromISO,
  ReminderCreationError,
} from './service';

export default function ReminderReviewScreen() {
  const { colors, statusBarStyle } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string; due?: string }>();
  const initialDue = useMemo(() => reminderDueInputsFromISO(params.due), [params.due]);
  const [title, setTitle] = useState(typeof params.title === 'string' ? params.title : '');
  const [dateInput, setDateInput] = useState(initialDue.dateInput);
  const [timeInput, setTimeInput] = useState(initialDue.timeInput);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/(app)' as const });
  }, [router]);

  const createReminder = useCallback(async () => {
    if (creating) return;
    setError(null);

    try {
      const due = parseReminderDueInputs(dateInput, timeInput);
      setCreating(true);
      await createIOSReminder({ title, due });
      Alert.alert(
        'Reminder Created',
        due
          ? 'The reviewed reminder was added to Apple Reminders.'
          : 'The reviewed reminder was added without a due date.',
        [{ text: 'Done', onPress: dismiss }],
      );
    } catch (cause) {
      if (cause instanceof ReminderCreationError) {
        setError(cause.message);
        if (cause.code === 'permission-denied') {
          Alert.alert('Reminders Access Needed', cause.message, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ]);
        }
      } else {
        setError('Apple Reminders could not save this item. Try again.');
      }
    } finally {
      setCreating(false);
    }
  }, [creating, dateInput, dismiss, timeInput, title]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <StatusBar style={statusBarStyle} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={{
            minHeight: 52,
            paddingHorizontal: 8,
            flexDirection: 'row',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Pressable
            onPress={dismiss}
            accessibilityLabel="Cancel reminder"
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
            })}
          >
            <ArrowLeft size={20} color={colors.textSecondary} />
          </Pressable>
          <Text
            variant="subheading"
            style={{ marginLeft: 4, color: colors.textPrimary, fontWeight: '700' }}
          >
            Review Reminder
          </Text>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 18 }}
        >
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${colors.teal}20`,
              }}
            >
              <Bell size={24} color={colors.teal} />
            </View>
            <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700' }}>
              Create an Apple Reminder
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
              Nothing is created until you review these details and tap Create Reminder.
            </Text>
          </View>

          <Input
            label="Reminder"
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setError(null);
            }}
            placeholder="What should you be reminded about?"
            autoCapitalize="sentences"
            maxLength={MAX_REMINDER_TITLE_LENGTH}
            returnKeyType="next"
          />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Date (optional)"
                value={dateInput}
                onChangeText={(value) => {
                  setDateInput(value);
                  setError(null);
                }}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>
            <View style={{ width: 116 }}>
              <Input
                label="Time (optional)"
                value={timeInput}
                onChangeText={(value) => {
                  setTimeInput(value);
                  setError(null);
                }}
                placeholder="HH:mm"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
          </View>

          <View
            style={{
              gap: 8,
              padding: 14,
              borderRadius: 14,
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CalendarDays size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                A date without a time creates an all-day reminder.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Clock3 size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                Leave both fields blank to create an undated reminder.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} color={colors.teal} />
              <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13 }}>
                This action writes only this reminder and does not send it to a model.
              </Text>
            </View>
          </View>

          {error ? (
            <View
              accessibilityRole="alert"
              style={{
                padding: 12,
                borderRadius: 10,
                backgroundColor: `${colors.agentError}18`,
                borderWidth: 1,
                borderColor: `${colors.agentError}40`,
              }}
            >
              <Text style={{ color: colors.agentError, fontSize: 13 }}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => void createReminder()}
            disabled={creating}
            accessibilityRole="button"
            accessibilityLabel="Create Reminder"
            accessibilityState={{ disabled: creating }}
            style={({ pressed }) => ({
              minHeight: 50,
              borderRadius: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: colors.teal,
              opacity: creating ? 0.6 : pressed ? 0.82 : 1,
            })}
          >
            {creating ? (
              <ActivityIndicator color={colors.surfaceBase} />
            ) : (
              <Bell size={18} color={colors.surfaceBase} />
            )}
            <Text style={{ color: colors.surfaceBase, fontSize: 15, fontWeight: '700' }}>
              {creating ? 'Creating…' : 'Create Reminder'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
