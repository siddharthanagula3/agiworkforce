import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { CornerDownRight } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { fetchFollowUpSuggestions } from '@/src/features/chat/services/followUps';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const MAX_SHOWN = 3;

export function FollowUpSuggestions({
  conversationId,
  messageId,
  onSelect,
}: {
  conversationId: string;
  messageId: string;
  onSelect: (prompt: string) => void;
}) {
  const colors = useThemeColors();
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setSuggestions([]);
    void fetchFollowUpSuggestions(conversationId, messageId, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setSuggestions(found.slice(0, MAX_SHOWN));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [conversationId, messageId]);

  if (suggestions.length === 0) return null;

  return (
    <View
      testID="follow-up-suggestions"
      accessibilityLabel="Suggested follow-ups"
      style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 6 }}
    >
      {suggestions.map((suggestion) => (
        <Pressable
          key={suggestion}
          onPress={() => onSelect(suggestion)}
          accessibilityRole="button"
          accessibilityLabel={`Ask: ${suggestion}`}
          style={{
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            alignSelf: 'flex-start',
            maxWidth: '100%',
          }}
        >
          <CornerDownRight size={14} color={colors.textMuted} />
          <Text style={{ flexShrink: 1, color: colors.textSecondary, fontSize: typeScale.subhead }}>
            {suggestion}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
