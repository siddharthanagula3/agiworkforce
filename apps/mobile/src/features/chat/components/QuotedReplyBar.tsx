import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { X, Reply } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { getShortDisplayName, UNKNOWN_MODEL_LABEL } from '@/src/features/model-picker/service';
import { useTierStore } from '@/src/features/billing/store';
import { answerPlainText } from '@/src/features/chat/utils/markdownPlainText';
import type { ChatMessage } from '@/types/chat';

interface QuotedReplyBarProps {
  message: ChatMessage;
  onDismiss: () => void;
}

export function quotedReplyAuthor(
  message: Pick<ChatMessage, 'role' | 'model'>,
  subscriptionTier?: string,
): string {
  if (message.role === 'user') return 'You';
  const modelName = message.model
    ? getShortDisplayName(message.model, subscriptionTier)
    : UNKNOWN_MODEL_LABEL;
  return modelName === UNKNOWN_MODEL_LABEL ? 'Assistant' : modelName;
}

const QUOTED_REPLY_MAX_CHARACTERS = 150;

export function quotedReplyText(content: string): string {
  const text = answerPlainText(content).replace(/\s+/g, ' ').trim();
  return text.length > QUOTED_REPLY_MAX_CHARACTERS
    ? `${text.slice(0, QUOTED_REPLY_MAX_CHARACTERS).trim()}...`
    : text;
}

export function QuotedReplyBar({ message, onDismiss }: QuotedReplyBarProps) {
  const colors = useThemeColors();
  const subscriptionTier = useTierStore((s) => s.tier);
  const label = quotedReplyAuthor(message, subscriptionTier);
  const preview = quotedReplyText(message.content);

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
            fontSize: typeScale.caption,
            fontWeight: '600',
            color: colors.teal,
            marginBottom: 2,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: typeScale.caption,
            color: colors.textMuted,
          }}
          numberOfLines={2}
        >
          {preview}
        </Text>
      </View>
      <PressableBox
        onPress={onDismiss}
        hitSlop={12}
        accessibilityLabel="Dismiss reply"
        accessibilityRole="button"
      >
        <X size={16} color={colors.textMuted} />
      </PressableBox>
    </View>
  );
}
