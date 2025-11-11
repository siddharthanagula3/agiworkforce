import { useCallback, useEffect, useMemo } from 'react';
import { MessageList } from './MessageList';
import { InputComposer } from './InputComposer';
import { TokenCounter } from './TokenCounter';
import { BudgetAlertsPanel } from './BudgetAlertsPanel';
import { StatusBar } from '../Layout/StatusBar';
import { ProgressIndicator } from '../AGI/ProgressIndicator';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTokenBudgetStore, selectBudget } from '../../stores/tokenBudgetStore';
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
  const budget = useTokenBudgetStore(selectBudget);
  const addTokenUsage = useTokenBudgetStore((state) => state.addTokenUsage);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Track token usage in budget system when messages change
  useEffect(() => {
    if (budget.enabled && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.tokens) {
        addTokenUsage(lastMessage.tokens);
      }
    }
  }, [messages, budget.enabled, addTokenUsage]);

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

  const handleSendMessage = useCallback(
    async (
      content: string,
      attachments?: File[],
      captures?: CaptureResult[],
      routing?: ChatRoutingPreferences,
      contextItems?: unknown[],
    ) => {
      await sendMessage(content, attachments, captures, routing, contextItems);
    },
    [sendMessage],
  );

  // Convert backend data to UI format for components
  const messagesUI = useMemo(
    () =>
      messages.map((msg) => ({
        id: msg.id.toString(),
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        tokens: msg.tokens,
        cost: msg.cost,
        sourceId: msg.id,
      })),
    [messages],
  );

  const handleRegenerateMessage = useCallback(
    async (targetMessage: MessagePresentation) => {
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
    },
    [messages, sendMessage],
  );

  const handleEditMessage = useCallback(
    async (targetMessage: MessagePresentation, content: string) => {
      const sourceId = targetMessage.sourceId ?? Number.parseInt(targetMessage.id, 10);
      if (Number.isNaN(sourceId)) {
        return;
      }

      await editMessage(sourceId, content);
    },
    [editMessage],
  );

  const handleDeleteMessage = useCallback(
    async (targetMessage: MessagePresentation) => {
      const sourceId = targetMessage.sourceId ?? Number.parseInt(targetMessage.id, 10);
      if (Number.isNaN(sourceId)) {
        return;
      }

      await deleteMessage(sourceId);
    },
    [deleteMessage],
  );

  return (
    <div className={cn('flex h-full flex-col min-h-0 min-w-0', className)}>
      {/* Budget Alerts - show at top */}
      <BudgetAlertsPanel />

      {/* AGI Progress Indicator */}
      <div className="px-4 pt-2">
        <ProgressIndicator compact={false} autoHide={true} autoHideDelay={5000} />
      </div>

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
            budgetLimit={budget.enabled ? budget.limit : undefined}
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

      {/* Status Bar */}
      <StatusBar
        provider={llmConfig.defaultProvider}
        model={llmConfig.defaultModels[llmConfig.defaultProvider]}
        currentTokens={currentTokenCount}
        maxTokens={maxContextTokens}
        isSending={loading}
      />
    </div>
  );
}
