/**
 * share-preview.tsx
 *
 * HIGH-MOB-03 fix (2026-05-04): Share intent content is shown here for user
 * review before any LLM call is made. The user must tap "Send to Chat" to
 * proceed. Content is sanitised and length-capped before display and before
 * being passed to sendMessage.
 */
import { useState } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { X, Send, AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/useTheme';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/stores/modelStore';

/** Hard cap on shared text that will be forwarded to the LLM (100 KB). */
const MAX_SHARED_BYTES = 100 * 1024;

/**
 * Wrap shared content in a named XML tag so the model treats it as external
 * data rather than instructions. System prompt must instruct the model to
 * treat content inside <shared_via_intent> as untrusted user-supplied text.
 */
function sanitiseSharedText(raw: string): { text: string; truncated: boolean } {
  // Remove prompt-injection markers that could escape the wrapper tag
  const cleaned = raw.replace(/<\/?shared_via_intent>/gi, '').replace(/<\/?system>/gi, '');

  const encoder = new TextEncoder();
  const bytes = encoder.encode(cleaned);

  if (bytes.length <= MAX_SHARED_BYTES) {
    return { text: `<shared_via_intent>\n${cleaned}\n</shared_via_intent>`, truncated: false };
  }

  // Truncate to byte limit, then back off to the nearest valid char boundary
  const truncated = new TextDecoder().decode(bytes.slice(0, MAX_SHARED_BYTES));
  return {
    text: `<shared_via_intent>\n${truncated}\n</shared_via_intent>`,
    truncated: true,
  };
}

export default function SharePreviewScreen() {
  const { colors: themeColors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ text?: string }>();
  const rawText = typeof params.text === 'string' ? params.text : '';

  const [sending, setSending] = useState(false);

  const { text: sanitised, truncated } = sanitiseSharedText(rawText);

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    try {
      const { createConversation, sendMessage } = useChatStore.getState();
      const { selectedModel } = useModelStore.getState();

      const previewTitle = rawText.length > 40 ? rawText.slice(0, 40).trim() + '...' : rawText;
      const id = await createConversation(previewTitle);
      sendMessage(id, sanitised, selectedModel);
      router.replace(`/(app)/chat/${id}` as Parameters<typeof router.replace>[0]);
    } catch {
      setSending(false);
      Alert.alert('Error', 'Could not start chat. Please try again.');
    }
  };

  const handleDismiss = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: themeColors.border,
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: '600', color: themeColors.textPrimary }}>
          Shared Content
        </Text>
        <Pressable onPress={handleDismiss} hitSlop={12}>
          <X size={22} color={themeColors.textMuted} />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
        {/* Truncation warning */}
        {truncated && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: themeColors.agentWarning + '22',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <AlertTriangle size={16} color={themeColors.agentWarning} />
            <Text style={{ flex: 1, color: themeColors.agentWarning, fontSize: 13 }}>
              Content was truncated to 100 KB before sending.
            </Text>
          </View>
        )}

        {/* Preview box */}
        <View
          style={{
            backgroundColor: themeColors.surfaceElevated,
            borderRadius: 12,
            padding: 14,
            borderWidth: 1,
            borderColor: themeColors.border,
          }}
        >
          <Text
            style={{
              color: themeColors.textSecondary,
              fontSize: 13,
              lineHeight: 20,
              fontFamily: 'monospace',
            }}
            selectable
          >
            {rawText.slice(0, 2000)}
            {rawText.length > 2000 ? `\n\n… (${rawText.length - 2000} more chars)` : ''}
          </Text>
        </View>

        <Text style={{ color: themeColors.textMuted, fontSize: 12, textAlign: 'center' }}>
          Review the shared content above before sending to your AI chat.
        </Text>
      </ScrollView>

      {/* Action bar */}
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: themeColors.border,
        }}
      >
        <Pressable
          onPress={handleDismiss}
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: themeColors.border,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: themeColors.textPrimary, fontWeight: '600' }}>Dismiss</Text>
        </Pressable>

        <Pressable
          onPress={handleSend}
          disabled={sending || !rawText.trim()}
          style={{
            flex: 2,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: sending ? themeColors.teal + '88' : themeColors.teal,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Send size={16} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600' }}>
            {sending ? 'Opening chat…' : 'Send to Chat'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
