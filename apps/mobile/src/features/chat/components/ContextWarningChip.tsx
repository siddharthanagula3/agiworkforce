import { View, Pressable } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { computeContextBudget } from '@/src/features/memory/services/contextBudgeter';
import type { ChatMessage } from '@/types/chat';

interface ContextWarningChipProps {
  modelId: string;
  messages: ChatMessage[];
  onStartFreshChat?: () => void;
}

/**
 * Chip shown above the composer when the conversation is approaching the model's
 * context limit (>= 70% of contextWindow used). Disappears once the user acts or
 * when compaction reduces usage below the threshold.
 *
 * Placement: render above <Composer /> in the chat[id] screen, conditionally.
 */
export function ContextWarningChip({
  modelId,
  messages,
  onStartFreshChat,
}: ContextWarningChipProps) {
  const colors = useThemeColors();
  const budget = computeContextBudget(modelId, messages);

  if (budget.status === 'ok') return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 7,
        backgroundColor: `${colors.agentWarning}18`,
        borderTopWidth: 1,
        borderTopColor: `${colors.agentWarning}30`,
        gap: 8,
      }}
      accessibilityRole="alert"
      accessibilityLabel="Context warning"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
        <AlertTriangle size={13} color={colors.agentWarning} strokeWidth={2} />
        <Text
          style={{ fontSize: 12, color: colors.agentWarning, fontWeight: '500', flex: 1 }}
          numberOfLines={1}
        >
          Chat is getting long. Start a fresh chat for faster responses.
        </Text>
      </View>

      {onStartFreshChat && (
        <Pressable
          onPress={onStartFreshChat}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 3,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: `${colors.agentWarning}60`,
          }}
          accessibilityRole="button"
          accessibilityLabel="Start fresh chat"
        >
          <Text style={{ fontSize: 11, color: colors.agentWarning, fontWeight: '600' }}>
            New chat
          </Text>
        </Pressable>
      )}
    </View>
  );
}
