import { useEffect, useMemo } from 'react';
import { MessageList } from './MessageList';
import { InputComposer } from './InputComposer';
import { TokenCounter } from './TokenCounter';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { estimateTokens } from '../../utils/tokenCount';
import { getModelContextWindow } from '../../constants/llm';
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

  const llmConfig = useSettingsStore((state) => state.llmConfig);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Get model-specific context window size
  const maxContextTokens = useMemo(() => {
    const selectedModel = llmConfig.defaultModels[llmConfig.defaultProvider];
    if (selectedModel) {
      return getModelContextWindow(selectedModel);
    }
    return llmConfig.maxTokens; // Fallback to settings
  }, [llmConfig.defaultProvider, llmConfig.defaultModels, llmConfig.maxTokens]);

  // Calculate current token count from conversation messages
  const currentTokenCount = useMemo(() => {
    return messages.reduce((total, msg) => {
      // Use stored token count if available, otherwise estimate
      if (msg.tokens !== undefined && msg.tokens !== null) {
        return total + msg.tokens;
      }
      // Estimate based on content length
      const isCode = msg.role === 'assistant'; // Assistant often includes code
      return total + estimateTokens(msg.content, isCode);
    }, 0);
  }, [messages]);

  const handleSendMessage = async (
    content: string,
    attachments?: File[],
    captures?: CaptureResult[],
    routing?: ChatRoutingPreferences,
    contextItems?: unknown[],
  ) => {
    await sendMessage(content, attachments, captures, routing, contextItems);
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
    <div className={cn('flex h-full flex-col min-h-0 min-w-0', className)}>
      <div className="flex-1 overflow-hidden min-h-0">
        <MessageList
          messages={messagesUI}
          loading={loading}
          conversationId={activeConversationId}
          onRegenerateMessage={handleRegenerateMessage}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
        />
      </div>

      {/* Token Counter - show when there are messages */}
      {messages.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <TokenCounter
            currentTokens={currentTokenCount}
            maxTokens={maxContextTokens}
            compact={true}
            showDetails={true}
          />
        </div>
      )}

      <InputComposer
        onSend={handleSendMessage}
        disabled={loading}
        isSending={loading}
        {...(activeConversationId != null ? { conversationId: activeConversationId } : {})}
      />
    </div>
  );
}
