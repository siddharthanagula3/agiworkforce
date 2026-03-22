import { View, Pressable } from 'react-native';
import { X, Reply } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import type { ChatMessage } from '@/types/chat';

interface QuotedReplyBarProps {
  /** The message being quoted/replied to */
  message: ChatMessage;
  /** Called when user dismisses the quote */
  onDismiss: () => void;
}

/**
 * Shows a compact quoted message card above the input bar.
 * Displayed when user swipes right on a message to quote-reply.
 */
export function QuotedReplyBar({ message, onDismiss }: QuotedReplyBarProps) {
  const isUser = message.role === 'user';
  const label = isUser ? 'You' : (message.model ?? 'Assistant');
  const preview =
    message.content.length > 100 ? message.content.slice(0, 100).trim() + '...' : message.content;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(33, 128, 141, 0.08)',
        borderLeftWidth: 3,
        borderLeftColor: colors.teal,
        borderRadius: 8,
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
      }}
    >
      <Reply size={14} color={colors.teal} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            color: colors.teal,
            marginBottom: 2,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: 'rgba(255, 255, 255, 0.5)',
          }}
          numberOfLines={2}
        >
          {preview}
        </Text>
      </View>
      <Pressable
        onPress={onDismiss}
        hitSlop={12}
        accessibilityLabel="Dismiss reply"
        accessibilityRole="button"
      >
        <X size={16} color="rgba(255, 255, 255, 0.3)" />
      </Pressable>
    </View>
  );
}
