import { useRef, useEffect, useCallback, useState } from 'react';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { AccessibilityInfo, View, RefreshControl, StyleSheet } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { Reply, ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { MessageBubble } from './MessageBubble';
import type { ResearchPlanDecision } from './research/ResearchRunCard';
import { ChatEmptyState } from './ChatEmptyState';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { motion } from '@/src/ui/theme/tokens';
import { contentColumn } from '@/src/shared/layout/contentColumn';
import type { ChatMessage } from '@/types/chat';
import type { VariantInfoByMessageId } from '@agiworkforce/cloud-contracts';
import type { ImageAreaEdit } from '@/src/features/image/components/ImageAreaEditor';

const NEAR_BOTTOM_THRESHOLD = 150;

interface MessageListProps {
  messages: ChatMessage[];
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string, reason?: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onRetryWithModel?: (messageId: string) => void;
  onEditImageArea?: (message: ChatMessage, edit: ImageAreaEdit) => void;
  onDeleteImageConversation?: () => void;
  variantInfoByMessageId?: VariantInfoByMessageId;
  onSelectVariant?: (messageId: string) => void;
  onSwitchModel?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onQuoteReply?: (message: ChatMessage) => void;
  onReaction?: (messageId: string, reaction: 'thumbsUp' | 'thumbsDown' | null) => void;
  onPairDesktop?: () => void;
  onResolveToolApproval?: (
    messageId: string,
    toolCallId: string,
    decision: 'approved' | 'rejected',
    guidance?: string,
  ) => void;
  onResearchPlanDecision?: (messageId: string, decision: ResearchPlanDecision) => void;
  onRetryResearch?: (messageId: string) => void;
  onStopResearch?: () => void;
  onPauseResearch?: (messageId: string) => Promise<boolean>;
  resumingResearchMessageId?: string | null;
}

function turnOutcomeAnnouncement(message: ChatMessage): string {
  if (message.role !== 'assistant') return 'No response was generated';
  if (message.status === 'error') return 'Response failed';
  if (message.metadata?.['finishReason'] === 'stopped') {
    return message.content.trim()
      ? 'Response cancelled. Partial response saved.'
      : 'Response cancelled';
  }
  return 'Response complete';
}

export function MessageList({
  messages,
  onApprove,
  onReject,
  onDeleteMessage,
  onRetryMessage,
  onRetryWithModel,
  onEditImageArea,
  onDeleteImageConversation,
  variantInfoByMessageId,
  onSelectVariant,
  onSwitchModel,
  onEditMessage,
  onRefresh,
  refreshing = false,
  onQuoteReply,
  onReaction,
  onPairDesktop,
  onResolveToolApproval,
  onResearchPlanDecision,
  onRetryResearch,
  onStopResearch,
  onPauseResearch,
  resumingResearchMessageId = null,
}: MessageListProps) {
  const colors = useThemeColors();
  const listRef = useRef<FlashListRef<ChatMessage>>(null);

  const [showScrollButton, setShowScrollButton] = useState(false);

  const lastMessage = messages[messages.length - 1];
  const lastWasStreaming = useRef<{ id: string; streaming: boolean } | null>(null);
  useEffect(() => {
    const previous = lastWasStreaming.current;
    if (!lastMessage) {
      lastWasStreaming.current = null;
      return;
    }
    const streaming = lastMessage.isStreaming === true;
    if (previous?.id === lastMessage.id && previous.streaming && !streaming) {
      AccessibilityInfo.announceForAccessibility(turnOutcomeAnnouncement(lastMessage));
    }
    lastWasStreaming.current = { id: lastMessage.id, streaming };
  }, [lastMessage]);

  const fabOpacity = useSharedValue(0);
  const fabStyle = useAnimatedStyle(() => ({ opacity: fabOpacity.value }));

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  useEffect(() => {
    fabOpacity.value = withTiming(showScrollButton ? 1 : 0, {
      duration: motion.quick,
      easing: Easing.out(Easing.ease),
    });
  }, [showScrollButton, fabOpacity]);

  const handleQuoteSelection = useCallback(
    (message: ChatMessage, text: string) => onQuoteReply?.({ ...message, content: text }),
    [onQuoteReply],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      // The column is on the row, not on the list, so a swipe anywhere in the
      // pane still scrolls the thread on a tablet.
      <View testID="chat.message-row" style={contentColumn('reading')}>
        <SwipeReplyWrapper message={item} onSwipeReply={onQuoteReply} colors={colors}>
          <MessageBubble
            message={item}
            onApprove={onApprove}
            onReject={onReject}
            onDeleteMessage={onDeleteMessage}
            onRetryMessage={onRetryMessage}
            onRetryWithModel={onRetryWithModel}
            onEditImageArea={onEditImageArea}
            onDeleteImageConversation={onDeleteImageConversation}
            variant={variantInfoByMessageId?.[item.id]}
            onSelectVariant={onSelectVariant}
            onSwitchModel={onSwitchModel}
            onEditMessage={onEditMessage}
            onReaction={onReaction}
            onResolveToolApproval={onResolveToolApproval}
            onResearchPlanDecision={onResearchPlanDecision}
            onRetryResearch={onRetryResearch}
            onStopResearch={onStopResearch}
            onPauseResearch={onPauseResearch}
            isResumingResearch={resumingResearchMessageId === item.id}
            onQuoteSelection={onQuoteReply ? handleQuoteSelection : undefined}
          />
        </SwipeReplyWrapper>
      </View>
    ),
    [
      colors,
      handleQuoteSelection,
      onApprove,
      onReject,
      onDeleteMessage,
      onRetryMessage,
      onRetryWithModel,
      onEditImageArea,
      onDeleteImageConversation,
      variantInfoByMessageId,
      onSelectVariant,
      onSwitchModel,
      onEditMessage,
      onQuoteReply,
      onReaction,
      onResolveToolApproval,
      onResearchPlanDecision,
      onRetryResearch,
      onStopResearch,
      onPauseResearch,
      resumingResearchMessageId,
    ],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  if (messages.length === 0) {
    return (
      <View style={[styles.container, contentColumn('reading')]}>
        <ChatEmptyState onPairDesktop={onPairDesktop} />
      </View>
    );
  }

  return (
    <View testID="chat.message-list" style={styles.container}>
      <FlashList
        ref={listRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingVertical: 8 }}
        showsVerticalScrollIndicator={false}
        maintainVisibleContentPosition={{
          autoscrollToBottomThreshold: NEAR_BOTTOM_THRESHOLD,
          startRenderingFromBottom: true,
        }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distanceFromBottom =
            contentSize.height - contentOffset.y - layoutMeasurement.height;
          setShowScrollButton(distanceFromBottom >= NEAR_BOTTOM_THRESHOLD);
        }}
        scrollEventThrottle={100}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} />
          ) : undefined
        }
      />

      {/* Anchored to the reading column, so it stays over the thread rather
          than drifting to the edge of a wide pane. */}
      <View pointerEvents="box-none" style={styles.fabOverlay}>
        <View pointerEvents="box-none" style={[styles.fabColumn, contentColumn('reading')]}>
          <Animated.View
            style={[styles.fab, fabStyle]}
            pointerEvents={showScrollButton ? 'auto' : 'none'}
          >
            <Pressable
              onPress={scrollToBottom}
              accessibilityLabel="Scroll to bottom"
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.fabButton,
                {
                  backgroundColor: colors.teal,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <ChevronDown size={20} color={colors.accentText} strokeWidth={2.5} />
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fabOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  fabColumn: {
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
  },
  fabButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

interface SwipeReplyWrapperProps {
  message: ChatMessage;
  onSwipeReply?: (message: ChatMessage) => void;
  colors: ColorScheme;
  children: React.ReactNode;
}

function SwipeReplyWrapper({ message, onSwipeReply, colors, children }: SwipeReplyWrapperProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const renderLeftActions = useCallback(() => {
    return (
      <View
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          width: 60,
          marginRight: 4,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.accentSurface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Reply size={18} color={colors.teal} />
        </View>
      </View>
    );
  }, [colors]);

  const handleSwipeOpen = useCallback(
    (direction: 'left' | 'right') => {
      if (direction !== 'left') return;
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      onSwipeReply?.(message);
      swipeableRef.current?.close();
    },
    [message, onSwipeReply, hapticsEnabled],
  );

  if (!onSwipeReply) {
    return <>{children}</>;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      onSwipeableOpen={handleSwipeOpen}
      overshootLeft={false}
      friction={2}
    >
      {children}
    </Swipeable>
  );
}
