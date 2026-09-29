import { useState } from 'react';
import { View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { computeContextBudget } from '@/src/features/memory/services/contextBudgeter';
import type { ChatMessage } from '@/types/chat';
import { ContextDetailsSheet } from './ContextDetailsSheet';

interface ContextWarningChipProps {
  modelId: string;
  messages: ChatMessage[];
  onStartFreshChat?: () => void;
}

export function ContextWarningChip({
  modelId,
  messages,
  onStartFreshChat,
}: ContextWarningChipProps) {
  const colors = useThemeColors();
  const budget = computeContextBudget(modelId, messages);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (budget.status === 'ok') return null;

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingVertical: 7,
          backgroundColor: colors.warningSurface,
          borderTopWidth: 1,
          borderTopColor: colors.warningBorder,
          gap: 8,
        }}
        accessibilityRole="alert"
        accessibilityLabel="Context warning"
      >
        <Pressable
          onPress={() => setDetailsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Chat is getting long. View what is in context"
          testID="context-warning-details"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minHeight: 32 }}
        >
          <AlertTriangle size={13} color={colors.agentWarning} strokeWidth={2} />
          <Text
            style={{
              fontSize: typeScale.caption,
              color: colors.agentWarning,
              fontWeight: '500',
              flex: 1,
            }}
            numberOfLines={1}
          >
            Chat is getting long. Start a fresh chat for faster responses.
          </Text>
        </Pressable>

        {onStartFreshChat && (
          <Pressable
            onPress={onStartFreshChat}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 3,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.warningBorder,
            }}
            accessibilityRole="button"
            accessibilityLabel="Start fresh chat"
          >
            <Text
              style={{ fontSize: typeScale.caption, color: colors.agentWarning, fontWeight: '600' }}
            >
              New chat
            </Text>
          </Pressable>
        )}
      </View>
      <ContextDetailsSheet
        visible={detailsOpen}
        modelId={modelId}
        messages={messages}
        onClose={() => setDetailsOpen(false)}
        onStartFreshChat={onStartFreshChat}
      />
    </>
  );
}
