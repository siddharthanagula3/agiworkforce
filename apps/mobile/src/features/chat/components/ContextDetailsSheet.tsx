import { useMemo } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { dialogPadding, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  computeContextBudget,
  summarizeContext,
} from '@/src/features/memory/services/contextBudgeter';
import { getManagedDisplayName } from '@/src/features/model-picker/service';
import type { ChatMessage } from '@/types/chat';

interface ContextDetailsSheetProps {
  visible: boolean;
  modelId: string;
  messages: ChatMessage[];
  onClose: () => void;
  onStartFreshChat?: () => void;
}

const numberFormat = new Intl.NumberFormat();

export function ContextDetailsSheet({
  visible,
  modelId,
  messages,
  onClose,
  onStartFreshChat,
}: ContextDetailsSheetProps) {
  const colors = useThemeColors();
  const budget = useMemo(() => computeContextBudget(modelId, messages), [messages, modelId]);
  const rows = useMemo(() => summarizeContext(messages), [messages]);
  const percent = Math.min(100, Math.round((budget.usedTokens / budget.contextWindowTokens) * 100));
  const barColor =
    budget.status === 'ok'
      ? colors.textSecondary
      : budget.status === 'warn'
        ? colors.agentWarning
        : colors.agentError;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      accessibilityViewIsModal
      onRequestClose={onClose}
    >
      <View
        style={{ flex: 1, backgroundColor: colors.surfaceBase, padding: dialogPadding }}
        testID="context-details-sheet"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: typeScale.headline,
              fontWeight: '600',
            }}
          >
            What is in context
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close context details"
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
              {getManagedDisplayName(modelId)}
            </Text>
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.body }}
              testID="context-details-usage"
            >
              {`About ${numberFormat.format(budget.usedTokens)} of ${numberFormat.format(budget.contextWindowTokens)} tokens (${percent}%)`}
            </Text>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Context used"
              accessibilityValue={{ min: 0, max: 100, now: percent }}
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.neutralSurface,
                overflow: 'hidden',
              }}
            >
              <View style={{ width: `${percent}%`, height: 6, backgroundColor: barColor }} />
            </View>
            {budget.status !== 'ok' ? (
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.footnote,
                  lineHeight: 19,
                }}
              >
                {budget.status === 'compact'
                  ? 'The oldest messages are summarized so the newest fit. A fresh chat keeps answers fast and complete.'
                  : 'This chat is close to the point where the oldest messages get summarized.'}
              </Text>
            ) : null}
          </View>

          <View>
            {rows.map((row) => (
              <View
                key={row.key}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: 44,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
                testID={`context-details-row-${row.key}`}
              >
                <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>
                  {row.label}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
                  {row.key === 'attachments'
                    ? numberFormat.format(row.count)
                    : `${numberFormat.format(row.count)}, about ${numberFormat.format(row.tokens)} tokens`}
                </Text>
              </View>
            ))}
          </View>

          <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote, lineHeight: 19 }}>
            Counts are estimated on this device. Instructions, memory and sources added when a
            message is sent are not included.
          </Text>

          {onStartFreshChat ? (
            <Button
              title="Start a new chat"
              variant="outline"
              onPress={() => {
                onClose();
                onStartFreshChat();
              }}
            />
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
