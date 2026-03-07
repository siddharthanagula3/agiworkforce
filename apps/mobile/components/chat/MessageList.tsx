import { useRef, useEffect, useCallback } from 'react';
import { FlashList } from '@shopify/flash-list';
import { View, RefreshControl } from 'react-native';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '@/types/chat';

interface MessageListProps {
  messages: ChatMessage[];
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string, reason?: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

/**
 * Performant message list using FlashList.
 * Auto-scrolls to bottom on new messages and during streaming.
 */
export function MessageList({
  messages,
  onApprove,
  onReject,
  onRefresh,
  refreshing = false,
}: MessageListProps) {
  const listRef = useRef<FlashList<ChatMessage>>(null);

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
      <MessageBubble message={item} onApprove={onApprove} onReject={onReject} />
    ),
    [onApprove, onReject],
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
    return <View className="flex-1" />;
  }

  return (
    <FlashList
      ref={listRef}
      data={messages}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      estimatedItemSize={100}
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
