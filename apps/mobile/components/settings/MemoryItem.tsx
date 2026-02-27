import { useCallback, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Pencil, Trash2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { colors } from '@/lib/theme';
import type { MemoryEntry } from '@/stores/memoryStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Category badge colors */
const CATEGORY_COLORS: Record<string, 'teal' | 'purple' | 'blue' | 'yellow' | 'green' | 'gray'> = {
  coding: 'teal',
  research: 'purple',
  writing: 'blue',
  preferences: 'yellow',
  general: 'green',
};

function getCategoryColor(
  category: string | null,
): 'teal' | 'purple' | 'blue' | 'yellow' | 'green' | 'gray' {
  if (!category) return 'gray';
  return CATEGORY_COLORS[category.toLowerCase()] ?? 'gray';
}

/** Source label colors — always gray to stay subtle */
const SOURCE_LABELS: Record<string, string> = {
  mobile: 'Mobile',
  desktop: 'Desktop',
  web: 'Web',
  auto: 'Auto',
};

/** Format relative time from an ISO string */
function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

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

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MemoryItemProps {
  memory: MemoryEntry;
  onEdit: (memory: MemoryEntry) => void;
  onDelete: (id: string) => void;
}

export function MemoryItem({ memory, onEdit, onDelete }: MemoryItemProps) {
  const [expanded, setExpanded] = useState(false);

  // Animated opacity for expand/collapse
  const animOpacity = useSharedValue(0);

  const toggleExpand = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    animOpacity.value = withTiming(next ? 1 : 0, { duration: 200 });
  }, [expanded, animOpacity]);

  const expandStyle = useAnimatedStyle(() => ({
    opacity: animOpacity.value,
  }));

  // Swipe-to-delete right action
  const renderRightActions = useCallback(
    () => (
      <Pressable
        onPress={() => onDelete(memory.id)}
        className="bg-red-500/20 items-center justify-center px-6 rounded-r-xl"
      >
        <Trash2 size={20} color={colors.agentError} />
      </Pressable>
    ),
    [memory.id, onDelete],
  );

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
        <Card variant="default" className="mb-2">
          {/* Top row: content + edit button */}
          <View className="flex-row items-start gap-2">
            <Pressable onPress={toggleExpand} className="flex-1">
              <Text
                className="text-sm text-white leading-5"
                numberOfLines={expanded ? undefined : 3}
              >
                {memory.content}
              </Text>

              {/* Expanded content indicator */}
              {!expanded && memory.content.length > 150 && (
                <Text className="text-xs text-teal-400 mt-1">
                  Tap to expand
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => onEdit(memory)}
              className="p-1.5 rounded-md active:bg-white/5"
              accessibilityLabel="Edit memory"
            >
              <Pencil size={14} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Expanded extra content (animated) */}
          {expanded && (
            <Animated.View style={expandStyle} className="mt-1" />
          )}

          {/* Bottom row: badges + timestamp */}
          <View className="flex-row items-center mt-2.5 gap-2">
            {memory.category && (
              <Badge
                label={memory.category}
                color={getCategoryColor(memory.category)}
              />
            )}
            <Badge
              label={SOURCE_LABELS[memory.source] ?? memory.source}
              color="gray"
            />
            <View className="flex-1" />
            <Text className="text-[10px] text-white/30">
              {formatRelativeTime(memory.updatedAt)}
            </Text>
          </View>
        </Card>
      </Swipeable>
    </Animated.View>
  );
}
