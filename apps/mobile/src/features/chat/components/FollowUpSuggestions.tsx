import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { CornerDownRight } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { deriveFollowUps, followUpAsksForWebSearch } from '@agiworkforce/unified-chat/follow-ups';
import { fetchFollowUpSuggestions } from '@/src/features/chat/services/followUps';
import { followUpChipText } from '@/src/features/chat/utils/followUpChipText';
import { useCloudSyncStateStore } from '@/stores/chat/cloudSyncStateStore';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const MAX_SHOWN = 3;

export function cachedFollowUpSuggestions(
  metadata: Record<string, unknown> | undefined,
): string[] | undefined {
  const stored = metadata?.['followUpSuggestions'];
  return Array.isArray(stored)
    ? stored.filter((entry): entry is string => typeof entry === 'string')
    : undefined;
}

export interface FollowUpFallbackTurn {
  assistantContent: string;
  userContent?: string;
  messageCount: number;
}

export function FollowUpSuggestions({
  conversationId,
  messageId,
  onSelect,
  hidden = false,
  cached,
  onFetched,
  fallbackTurn,
  searchUnavailable = false,
}: {
  conversationId: string;
  messageId: string;
  onSelect: (prompt: string) => void;
  hidden?: boolean;
  cached?: readonly string[];
  onFetched?: (messageId: string, suggestions: string[]) => void;
  fallbackTurn?: FollowUpFallbackTurn;
  searchUnavailable?: boolean;
}) {
  const colors = useThemeColors();
  const [suggestions, setSuggestions] = useState<string[]>(() =>
    cached ? cached.slice(0, MAX_SHOWN) : [],
  );
  const [fetchSettledFor, setFetchSettledFor] = useState<string | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const isCached = cached !== undefined;
  const cachedKey = cached ? JSON.stringify(cached) : undefined;
  const onFetchedRef = useRef(onFetched);
  useEffect(() => {
    onFetchedRef.current = onFetched;
  }, [onFetched]);

  useEffect(() => {
    if (isCached) {
      setSuggestions((JSON.parse(cachedKey ?? '[]') as string[]).slice(0, MAX_SHOWN));
      return;
    }
    const controller = new AbortController();
    setSuggestions([]);
    setFetchSettledFor(null);
    const waitingToSync = (dirty: { messageId: string }[]) =>
      dirty.some((entry) => entry.messageId === messageId);
    const ask = () => {
      fetchFollowUpSuggestions(conversationId, messageId, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return;
          setSuggestions(found.slice(0, MAX_SHOWN));
          setFetchSettledFor(messageId);
          onFetchedRef.current?.(messageId, found);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            console.warn('[FollowUpSuggestions] suggestions unavailable', error);
            setFetchSettledFor(messageId);
          }
        });
    };

    if (!waitingToSync(useCloudSyncStateStore.getState().dirtyMessages)) {
      ask();
      return () => controller.abort();
    }
    const stopWaiting = useCloudSyncStateStore.subscribe((state) => {
      if (waitingToSync(state.dirtyMessages)) return;
      stopWaiting();
      ask();
    });
    return () => {
      stopWaiting();
      controller.abort();
    };
  }, [conversationId, messageId, isCached, cachedKey]);

  const settled = isCached || fetchSettledFor === messageId;
  const fallbackContent = fallbackTurn?.assistantContent;
  const fallbackUserContent = fallbackTurn?.userContent;
  const fallbackMessageCount = fallbackTurn?.messageCount ?? 0;
  const shown = useMemo(() => {
    const candidates =
      suggestions.length > 0
        ? suggestions
        : settled && fallbackContent !== undefined
          ? deriveFollowUps(fallbackContent, fallbackMessageCount, fallbackUserContent).map(
              (followUp) => followUp.text,
            )
          : [];
    const lines = [...new Set(candidates.map(followUpChipText))].filter(Boolean);
    return searchUnavailable ? lines.filter((text) => !followUpAsksForWebSearch(text)) : lines;
  }, [
    suggestions,
    settled,
    fallbackContent,
    fallbackMessageCount,
    fallbackUserContent,
    searchUnavailable,
  ]);

  if (shown.length === 0 || hidden || dismissedFor === messageId) return null;

  return (
    <View
      testID="follow-up-suggestions"
      accessibilityLabel="Suggested follow-ups"
      style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 6 }}
    >
      {shown.map((suggestion) => (
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
      <Pressable
        onPress={() => setDismissedFor(messageId)}
        accessibilityRole="button"
        accessibilityLabel="Hide suggestions"
        style={{
          minHeight: 44,
          justifyContent: 'center',
          alignSelf: 'flex-start',
          paddingHorizontal: 12,
        }}
      >
        <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>Hide</Text>
      </Pressable>
    </View>
  );
}
