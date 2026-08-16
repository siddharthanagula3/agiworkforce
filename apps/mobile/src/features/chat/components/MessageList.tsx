import { useRef, useEffect, useCallback, useState } from 'react';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { View, RefreshControl, StyleSheet } from 'react-native';
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
import { ChatEmptyState } from './ChatEmptyState';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
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
  onQuoteReply?: (message: ChatMessage) => void;
  onReaction?: (messageId: string, reaction: 'thumbsUp' | 'thumbsDown' | null) => void;
  onPairDesktop?: () => void;
  onResolveToolApproval?: (
    messageId: string,
    toolCallId: string,
    decision: 'approved' | 'rejected',
  ) => void;
}

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
  onResolveToolApproval,
}: MessageListProps) {
  const colors = useThemeColors();
  const listRef = useRef<FlashListRef<ChatMessage>>(null);

  const isNearBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const fabOpacity = useSharedValue(0);
  const fabStyle = useAnimatedStyle(() => ({ opacity: fabOpacity.value }));

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

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

  useEffect(() => {
    fabOpacity.value = withTiming(showScrollButton ? 1 : 0, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });
  }, [showScrollButton, fabOpacity]);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <SwipeReplyWrapper message={item} onSwipeReply={onQuoteReply} colors={colors}>
        <MessageBubble
          message={item}
          onApprove={onApprove}
          onReject={onReject}
          onDeleteMessage={onDeleteMessage}
          onRetryMessage={onRetryMessage}
          onEditMessage={onEditMessage}
          onReaction={onReaction}
          onResolveToolApproval={onResolveToolApproval}
        />
      </SwipeReplyWrapper>
    ),
    [
      colors,
      onApprove,
      onReject,
      onDeleteMessage,
      onRetryMessage,
      onEditMessage,
      onQuoteReply,
      onReaction,
      onResolveToolApproval,
    ],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

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
          const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
          isNearBottomRef.current = nearBottom;
          setShowScrollButton(!nearBottom);
        }}
        scrollEventThrottle={100}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} />
          ) : undefined
        }
      />

      {/* Scroll-to-bottom floating chevron. */}
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0,
    shadowRadius: 4,
    elevation: 0,
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
