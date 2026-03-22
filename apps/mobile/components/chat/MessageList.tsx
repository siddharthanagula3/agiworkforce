import { useRef, useEffect, useCallback } from 'react';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { View, RefreshControl, Text } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Reply } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { MessageBubble } from './MessageBubble';
import { ChatEmptyState } from './ChatEmptyState';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';
import type { ChatMessage } from '@/types/chat';

interface MessageListProps {
  messages: ChatMessage[];
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string, reason?: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Called when user taps a quoted message to reply */
  onQuoteReply?: (message: ChatMessage) => void;
  /** Called when user reacts to a message */
  onReaction?: (messageId: string, reaction: 'thumbsUp' | 'thumbsDown' | null) => void;
  onPairDesktop?: () => void;
  /** Called to open the shared thinking bottom sheet */
  onOpenThinking?: (content: string, duration?: number) => void;
}

/**
 * Performant message list using FlashList.
 * Auto-scrolls to bottom on new messages and during streaming.
 */
export function MessageList({
  messages,
  onApprove,
  onReject,
  onDeleteMessage,
  onRetryMessage,
  onEditMessage,
  onRefresh,
  refreshing = false,
  onQuoteReply,
  onReaction,
  onPairDesktop,
  onOpenThinking,
}: MessageListProps) {
  const listRef = useRef<FlashListRef<ChatMessage>>(null);

  // Track whether the user has scrolled away from bottom
  const isNearBottomRef = useRef(true);

  // Auto-scroll to bottom when new messages arrive or content streams in
  const lastMessage = messages[messages.length - 1];
  const lastContent = lastMessage?.content;
  const lastIsStreaming = lastMessage?.isStreaming;

  useEffect(() => {
    if (messages.length > 0 && isNearBottomRef.current) {
      // Small delay to let FlashList finish layout
      const timer = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [messages.length, lastContent, lastIsStreaming]);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <SwipeReplyWrapper message={item} onSwipeReply={onQuoteReply}>
        <MessageBubble
          message={item}
          onApprove={onApprove}
          onReject={onReject}
          onDeleteMessage={onDeleteMessage}
          onRetryMessage={onRetryMessage}
          onEditMessage={onEditMessage}
          onReaction={onReaction}
          onOpenThinking={onOpenThinking}
        />
      </SwipeReplyWrapper>
    ),
    [
      onApprove,
      onReject,
      onDeleteMessage,
      onRetryMessage,
      onEditMessage,
      onQuoteReply,
      onReaction,
      onOpenThinking,
    ],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const typingFooter = useCallback(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg?.isStreaming || lastMsg.content.trim()) return null;
    return (
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          gap: 4,
          alignItems: 'center',
        }}
      >
        {[0, 150, 300].map((delay) => (
          <View
            key={delay}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: 'rgba(45,212,191,0.6)',
            }}
          />
        ))}
      </View>
    );
  }, [messages]);

  if (messages.length === 0) {
    return <ChatEmptyState onPairDesktop={onPairDesktop} />;
  }

  return (
    <FlashList
      ref={listRef}
      data={messages}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={{ paddingVertical: 8 }}
      showsVerticalScrollIndicator={false}
      onScroll={(event) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
        isNearBottomRef.current = distanceFromBottom < 150;
      }}
      scrollEventThrottle={100}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2dd4bf" />
        ) : undefined
      }
      ListFooterComponent={typingFooter}
    />
  );
}

// ---------------------------------------------------------------------------
// SwipeReplyWrapper — swipe right on any message to quote-reply
// ---------------------------------------------------------------------------

interface SwipeReplyWrapperProps {
  message: ChatMessage;
  onSwipeReply?: (message: ChatMessage) => void;
  children: React.ReactNode;
}

function SwipeReplyWrapper({ message, onSwipeReply, children }: SwipeReplyWrapperProps) {
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
            backgroundColor: 'rgba(33, 128, 141, 0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Reply size={18} color={colors.teal} />
        </View>
      </View>
    );
  }, []);

  const handleSwipeOpen = useCallback(
    (direction: 'left' | 'right') => {
      // Only trigger on left-side swipe (user swipes right to reveal left actions)
      if (direction !== 'left') return;
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      onSwipeReply?.(message);
      // Close the swipeable after triggering
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
