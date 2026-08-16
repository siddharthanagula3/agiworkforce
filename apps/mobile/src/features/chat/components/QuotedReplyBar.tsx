import { View, Pressable } from 'react-native';
import { X, Reply } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { getShortDisplayName } from '@/src/features/model-picker/service';
import { useTierStore } from '@/src/features/billing/store';
import type { ChatMessage } from '@/types/chat';

interface QuotedReplyBarProps {
  message: ChatMessage;
  onDismiss: () => void;
}

export function QuotedReplyBar({ message, onDismiss }: QuotedReplyBarProps) {
  const colors = useThemeColors();
  const subscriptionTier = useTierStore((s) => s.tier);
  const isUser = message.role === 'user';
  const label = isUser
    ? 'You'
    : message.model
      ? getShortDisplayName(message.model, subscriptionTier)
      : 'Assistant';
  const preview =
    message.content.length > 100 ? message.content.slice(0, 100).trim() + '...' : message.content;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.accentSurface,
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
            color: colors.textMuted,
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
        <X size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
