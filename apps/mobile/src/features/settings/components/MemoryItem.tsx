import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Pencil, Trash2, Pin, PinOff } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useThemeColors, motion } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { MemoryEntry } from '@/src/features/memory/store';
import { memoryFactOrigin } from '@/src/features/memory/services/consolidation';

const EDIT_GRACE_MS = 60_000;

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1_000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(months / 12)}y ago`;
}

function describeMemoryTime(memory: MemoryEntry): string {
  const updatedAt = memory.updated_at ?? memory.created_at;
  return updatedAt - memory.created_at > EDIT_GRACE_MS
    ? `Edited ${formatRelativeTime(updatedAt)}`
    : `Added ${formatRelativeTime(memory.created_at)}`;
}

function describeMemoryOrigin(memory: MemoryEntry, conversationTitle: string | null): string {
  const origin = memoryFactOrigin(memory);
  const base =
    origin === 'imported'
      ? 'Imported'
      : origin === 'typed'
        ? 'Added by you'
        : conversationTitle
          ? `Learned from “${conversationTitle}”`
          : 'Learned from a chat';
  if (memory.project_id) {
    return `${base}, only in project “${memory.project_name ?? 'a project'}”`;
  }
  return base;
}

interface MemoryItemProps {
  memory: MemoryEntry;
  conversationTitle?: string | null;
  onEdit: (memory: MemoryEntry) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onOpenConversation?: (conversationId: string) => void;
}

export function MemoryItem({
  memory,
  conversationTitle = null,
  onEdit,
  onDelete,
  onTogglePin,
  onOpenConversation,
}: MemoryItemProps) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const animOpacity = useSharedValue(0);

  const toggleExpand = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    animOpacity.value = withTiming(next ? 1 : 0, { duration: motion.quick });
  }, [expanded, animOpacity]);

  const expandStyle = useAnimatedStyle(() => ({
    opacity: animOpacity.value,
  }));

  const originLabel = describeMemoryOrigin(memory, conversationTitle);
  const linkedConversationId =
    memoryFactOrigin(memory) === 'learned' && conversationTitle
      ? memory.source_conversation_id
      : null;

  const renderRightActions = useCallback(
    () => (
      <Pressable
        onPress={() => onDelete(memory.id)}
        className="items-center justify-center px-6 rounded-r-xl"
        style={{ backgroundColor: colors.dangerSurface }}
        accessibilityLabel="Delete memory"
        accessibilityRole="button"
      >
        <Trash2 size={20} color={colors.agentError} />
      </Pressable>
    ),
    [memory.id, onDelete, colors.agentError, colors.dangerSurface],
  );

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(motion.quick)}>
      <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
        <Card variant="default" className="mb-2">
          {/* Top row: fact text + actions */}
          <View className="flex-row items-start gap-2">
            <Pressable
              onPress={toggleExpand}
              className="flex-1"
              accessibilityLabel={`Memory: ${memory.fact.slice(0, 80)}`}
              accessibilityRole="button"
              accessibilityHint={expanded ? 'Tap to collapse' : 'Tap to expand'}
            >
              <Text
                className="text-sm leading-5"
                style={{ color: colors.textPrimary }}
                numberOfLines={expanded ? undefined : 3}
              >
                {memory.fact}
              </Text>

              {!expanded && memory.fact.length > 150 && (
                <Text className="text-xs mt-1" style={{ color: colors.teal }}>
                  Tap to expand
                </Text>
              )}
            </Pressable>

            <View className="flex-row gap-1 items-center">
              <Pressable
                onPress={() => onTogglePin(memory.id)}
                className="p-1.5 rounded-md"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                })}
                accessibilityLabel={memory.pinned ? 'Unpin memory' : 'Pin memory'}
                accessibilityRole="button"
              >
                {memory.pinned ? (
                  <PinOff size={14} color={colors.teal} />
                ) : (
                  <Pin size={14} color={colors.textMuted} />
                )}
              </Pressable>

              <Pressable
                onPress={() => onEdit(memory)}
                className="p-1.5 rounded-md"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                })}
                accessibilityLabel="Edit memory"
                accessibilityRole="button"
              >
                <Pencil size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          {expanded && <Animated.View style={expandStyle} className="mt-1" />}

          <View className="flex-row items-center mt-2.5 gap-2">
            {memory.pinned && <Badge label="Pinned" color="teal" />}
            {linkedConversationId && onOpenConversation ? (
              <Pressable
                onPress={() => onOpenConversation(linkedConversationId)}
                className="flex-1"
                accessibilityRole="link"
                accessibilityLabel={`${originLabel}. Open the chat`}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.textSecondary,
                    fontSize: typeScale.caption,
                    textDecorationLine: 'underline',
                  }}
                >
                  {originLabel}
                </Text>
              </Pressable>
            ) : (
              <Text
                numberOfLines={1}
                className="flex-1"
                style={{ color: colors.textMuted, fontSize: typeScale.caption }}
              >
                {originLabel}
              </Text>
            )}
            <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
              {describeMemoryTime(memory)}
            </Text>
          </View>
        </Card>
      </Swipeable>
    </Animated.View>
  );
}
