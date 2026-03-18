import { useState, useCallback } from 'react';
import { View, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Send, Bug, Lightbulb, MessageCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { api } from '@/services/api';
import { colors } from '@/lib/theme';

type FeedbackType = 'bug' | 'feature' | 'general';

const FEEDBACK_TYPES: Array<{ type: FeedbackType; label: string; icon: typeof Bug }> = [
  { type: 'bug', label: 'Bug Report', icon: Bug },
  { type: 'feature', label: 'Feature Request', icon: Lightbulb },
  { type: 'general', label: 'General Feedback', icon: MessageCircle },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const [type, setType] = useState<FeedbackType>('general');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

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
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Submission Failed', 'Could not submit feedback. Please try again later.');
    } finally {
      setSending(false);
    }
  }, [type, message, router]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
          <Text variant="subheading" className="ml-2">
            Send Feedback
          </Text>
        </View>

        <View className="flex-1 px-4 gap-5">
          {/* Type selector */}
          <View className="gap-2">
            <Text className="text-xs text-white/50 uppercase tracking-wider">Type</Text>
            <View className="flex-row gap-2">
              {FEEDBACK_TYPES.map((ft) => {
                const Icon = ft.icon;
                const selected = type === ft.type;
                return (
                  <Pressable
                    key={ft.type}
                    onPress={() => setType(ft.type)}
                    className="flex-1 items-center gap-1.5 py-3 rounded-xl"
                    style={{
                      backgroundColor: selected ? `${colors.teal}20` : colors.surfaceElevated,
                      borderWidth: selected ? 1 : 0,
                      borderColor: selected ? `${colors.teal}40` : 'transparent',
                    }}
                    accessibilityLabel={ft.label}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Icon size={18} color={selected ? colors.teal : colors.textMuted} />
                    <Text
                      className="text-xs font-medium"
                      style={{ color: selected ? colors.teal : colors.textSecondary }}
                    >
                      {ft.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Message input */}
          <View className="gap-2 flex-1">
            <Text className="text-xs text-white/50 uppercase tracking-wider">
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
              placeholderTextColor="rgba(255,255,255,0.25)"
              multiline
              textAlignVertical="top"
              maxLength={2000}
              style={{
                flex: 1,
                backgroundColor: colors.surfaceElevated,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.1)',
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: colors.textPrimary,
                fontSize: 15,
                lineHeight: 22,
                minHeight: 120,
              }}
              accessibilityLabel={type === 'bug' ? 'Bug description' : 'Feedback message'}
            />
            <Text className="text-[10px] text-white/20 text-right">{message.length}/2000</Text>
          </View>

          {/* Submit button */}
          <Button
            title={sending ? 'Sending...' : 'Submit Feedback'}
            variant="primary"
            size="lg"
            onPress={handleSubmit}
            disabled={sending || !message.trim()}
            className="mb-4"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
