import { useRef, useEffect, useCallback, useState } from 'react';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { View, RefreshControl, Pressable, StyleSheet } from 'react-native';
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
import { ChatEmptyState } from './ChatEmptyState';
import { TypingIndicator } from './TypingIndicator';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';
import type { ChatMessage } from '@/types/chat';

const NEAR_BOTTOM_THRESHOLD = 150;

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

  // Raw boolean ref — used inside scroll handler to avoid stale closure
  const isNearBottomRef = useRef(true);
  // Drives the visible scroll-to-bottom FAB
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Animated opacity for the FAB fade-in/out
  const fabOpacity = useSharedValue(0);
  const fabStyle = useAnimatedStyle(() => ({ opacity: fabOpacity.value }));

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Auto-scroll to bottom when new messages arrive or content streams in
  const lastMessage = messages[messages.length - 1];
  const lastContent = lastMessage?.content;
  const lastIsStreaming = lastMessage?.isStreaming;

  useEffect(() => {
    if (messages.length > 0 && isNearBottomRef.current) {
      const timer = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [messages.length, lastContent, lastIsStreaming]);

  // Fade FAB in/out whenever visibility toggles
  useEffect(() => {
    fabOpacity.value = withTiming(showScrollButton ? 1 : 0, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });
  }, [showScrollButton, fabOpacity]);

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
    return <TypingIndicator />;
  }, [messages]);

  if (messages.length === 0) {
    return <ChatEmptyState onPairDesktop={onPairDesktop} />;
  }

  return (
    <View style={styles.container}>
      <FlashList
        ref={listRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingVertical: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distanceFromBottom =
            contentSize.height - contentOffset.y - layoutMeasurement.height;
          const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
          isNearBottomRef.current = nearBottom;
          setShowScrollButton(!nearBottom);
        }}
        scrollEventThrottle={100}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2dd4bf" />
          ) : undefined
        }
        ListFooterComponent={typingFooter}
      />

      {/* Scroll-to-bottom FAB — matches Claude iOS floating chevron */}
      <Animated.View
        style={[styles.fab, fabStyle]}
        pointerEvents={showScrollButton ? 'auto' : 'none'}
      >
        <Pressable
          onPress={scrollToBottom}
          style={({ pressed }) => [styles.fabButton, pressed && styles.fabButtonPressed]}
          accessibilityLabel="Scroll to bottom"
          accessibilityRole="button"
        >
          <ChevronDown size={20} color="#ffffff" strokeWidth={2.5} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  fabButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabButtonPressed: {
    opacity: 0.8,
  },
});

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
