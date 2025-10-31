import { useEffect } from 'react';
import { MessageList } from './MessageList';
import { InputComposer } from './InputComposer';
import { useChatStore } from '../../stores/chatStore';
import { cn } from '../../lib/utils';
import type { CaptureResult } from '../../hooks/useScreenCapture';
import type { ChatRoutingPreferences } from '../../types/chat';
import type { Message as MessagePresentation } from './Message';

interface ChatInterfaceProps {
  className?: string;
}

export function ChatInterface({ className }: ChatInterfaceProps) {
  const {
    messages,
    loading,
    loadConversations,
    sendMessage,
    activeConversationId,
    editMessage,
    deleteMessage,
  } = useChatStore();

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleSendMessage = async (
    content: string,
    attachments?: File[],
    captures?: CaptureResult[],
    routing?: ChatRoutingPreferences
  ) => {
    await sendMessage(content, attachments, captures, routing);
  };

  // Convert backend data to UI format for components
  const messagesUI = messages.map((msg) => ({
    id: msg.id.toString(),
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    tokens: msg.tokens,
    cost: msg.cost,
    sourceId: msg.id,
  }));

  const handleRegenerateMessage = async (targetMessage: MessagePresentation) => {
    const sourceId = targetMessage.sourceId ?? Number.parseInt(targetMessage.id, 10);
    if (Number.isNaN(sourceId)) {
      return;
    }

    const targetIndex = messages.findIndex((msg) => msg.id === sourceId);
    if (targetIndex === -1) {
      return;
    }

    const previousUserMessage = [...messages.slice(0, targetIndex)]
      .reverse()
      .find((msg) => msg.role === 'user');

    if (!previousUserMessage) {
      console.warn('[ChatInterface] Unable to find user message to regenerate from.');
      return;
    }

    await sendMessage(previousUserMessage.content);
  };

  const handleEditMessage = async (targetMessage: MessagePresentation, content: string) => {
    const sourceId = targetMessage.sourceId ?? Number.parseInt(targetMessage.id, 10);
    if (Number.isNaN(sourceId)) {
      return;
    }

    await editMessage(sourceId, content);
  };

  const handleDeleteMessage = async (targetMessage: MessagePresentation) => {
    const sourceId = targetMessage.sourceId ?? Number.parseInt(targetMessage.id, 10);
    if (Number.isNaN(sourceId)) {
      return;
    }

    await deleteMessage(sourceId);
  };

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex-1 overflow-hidden">
        <MessageList
          messages={messagesUI}
          loading={loading}
          conversationId={activeConversationId}
          onRegenerateMessage={handleRegenerateMessage}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
        />
      </div>
      <InputComposer
        onSend={handleSendMessage}
        disabled={loading}
        isSending={loading}
        {...(activeConversationId != null ? { conversationId: activeConversationId } : {})}
      />
    </div>
  );
}
