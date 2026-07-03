import { useState, useCallback } from 'react';
import {
  View,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Bug, Lightbulb, MessageCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { api } from '@/services/api';
import { useTheme } from '@/src/ui/theme';

type FeedbackType = 'bug' | 'feature' | 'general';

const FEEDBACK_TYPES: Array<{ type: FeedbackType; label: string; icon: typeof Bug }> = [
  { type: 'bug', label: 'Bug Report', icon: Bug },
  { type: 'feature', label: 'Feature Request', icon: Lightbulb },
  { type: 'general', label: 'General Feedback', icon: MessageCircle },
];

const SETTINGS_RETURN_PATH = '/(app)/(tabs)/settings' as const;
const ABOUT_RETURN_PATH = '/(app)/about' as const;

function resolveReturnTo(value: unknown): typeof SETTINGS_RETURN_PATH | typeof ABOUT_RETURN_PATH {
  if (value === ABOUT_RETURN_PATH) return ABOUT_RETURN_PATH;
  return SETTINGS_RETURN_PATH;
}

export default function FeedbackScreen() {
  const { colors, statusBarStyle } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = resolveReturnTo(
    Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo,
  );
  const [type, setType] = useState<FeedbackType>('general');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const canSubmit = !sending && Boolean(message.trim());

  const handleSubmit = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert('Empty Feedback', 'Please describe your feedback before submitting.');
      return;
    }

    setSending(true);
    try {
      await api.post('/api/mobile/feedback', { type, message: trimmed });
      Alert.alert('Thank You!', 'Your feedback has been submitted.', [
        { text: 'OK', onPress: () => router.replace(returnTo) },
      ]);
    } catch {
      Alert.alert('Submission Failed', 'Could not submit feedback. Please try again later.');
    } finally {
      setSending(false);
    }
  }, [type, message, router, returnTo]);

  const handleBack = useCallback(() => {
    router.replace(returnTo);
  }, [returnTo, router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <StatusBar style={statusBarStyle} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={{
            height: 50,
            paddingHorizontal: 8,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Pressable
            onPress={handleBack}
            accessibilityLabel="Go back"
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
            Send Feedback
          </Text>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 24,
            gap: 18,
          }}
        >
          <View style={{ gap: 8 }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0,
              }}
            >
              Type
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {FEEDBACK_TYPES.map((ft) => {
                const Icon = ft.icon;
                const selected = type === ft.type;
                return (
                  <Pressable
                    key={ft.type}
                    onPress={() => setType(ft.type)}
                    style={{
                      flex: 1,
                      minHeight: 70,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingHorizontal: 6,
                      paddingVertical: 10,
                      borderRadius: 14,
                      backgroundColor: selected ? `${colors.teal}20` : colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: selected ? `${colors.teal}40` : colors.border,
                    }}
                    accessibilityLabel={ft.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Icon size={18} color={selected ? colors.teal : colors.textMuted} />
                    <Text
                      numberOfLines={2}
                      style={{
                        color: selected ? colors.teal : colors.textSecondary,
                        fontSize: 12,
                        lineHeight: 15,
                        fontWeight: '600',
                        textAlign: 'center',
                      }}
                    >
                      {ft.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0,
              }}
            >
              {type === 'bug' ? 'Describe the issue' : 'Your feedback'}
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={
                type === 'bug'
                  ? 'What happened? What did you expect to happen?'
                  : type === 'feature'
                    ? 'Describe the feature you would like...'
                    : 'Tell us what you think...'
              }
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={2000}
              style={{
                minHeight: 260,
                backgroundColor: colors.surfaceElevated,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: colors.textPrimary,
                fontSize: 15,
                lineHeight: 22,
              }}
              accessibilityLabel={type === 'bug' ? 'Bug description' : 'Feedback message'}
            />
            <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'right' }}>
              {message.length}/2000
            </Text>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel={sending ? 'Sending feedback' : 'Submit feedback'}
            accessibilityState={{ disabled: !canSubmit }}
            style={{ width: '100%' }}
          >
            {({ pressed }) => (
              <View
                style={{
                  width: '100%',
                  minHeight: 52,
                  paddingHorizontal: 16,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: canSubmit
                    ? pressed
                      ? colors.textPrimary
                      : colors.teal
                    : colors.neutralSurface,
                  borderWidth: canSubmit ? 0 : 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    color: canSubmit ? colors.accentText : colors.textMuted,
                    fontSize: 14,
                    fontWeight: '600',
                  }}
                >
                  {sending ? 'Sending...' : 'Submit Feedback'}
                </Text>
              </View>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
