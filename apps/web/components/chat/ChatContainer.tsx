'use client';

import React, { useCallback, useEffect, memo } from 'react';
import { clsx } from 'clsx';
import { Toaster, toast } from 'sonner';

import { useChatStore, type Attachment } from '@/stores/chatStore';
import { useChatStream } from '@/lib/hooks/useChatStream';
import { useConversations } from '@/lib/hooks/useConversations';

import { ChatSidebar } from './ChatSidebar';
import { ChatStream } from './ChatStream';
import { ChatInputArea } from './ChatInputArea';
import { ModelSelector } from './ModelSelector';

interface ChatContainerProps {
  className?: string;
}

export const ChatContainer = memo(function ChatContainer({ className = '' }: ChatContainerProps) {
  // Hooks
  const { sendMessage, stopGeneration, isStreaming } = useChatStream();
  const {
    conversations,
    activeConversationId,
    isLoading: isLoadingConversations,
    error: conversationsError,
    createConversation,
    loadConversation,
    updateConversation,
    deleteConversation,
  } = useConversations();

  // Store state
  const isLoading = useChatStore((state) => state.isLoading);
  const error = useChatStore((state) => state.error);
  const setDraftContent = useChatStore((state) => state.setDraftContent);

  // Show errors as toasts
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
    if (conversationsError) {
      toast.error(conversationsError);
    }
  }, [error, conversationsError]);

  // Handle send message
  const handleSendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      // Create conversation if none exists
      if (!activeConversationId) {
        const conversation = await createConversation(content.slice(0, 50));
        if (!conversation) {
          toast.error('Failed to create conversation');
          return;
        }
      }

      // Send the message
      await sendMessage(content, { attachments });
    },
    [activeConversationId, createConversation, sendMessage],
  );

  // Handle suggestion click from empty state
  const handleSuggestionClick = useCallback(
    (prompt: string) => {
      setDraftContent(prompt);
    },
    [setDraftContent],
  );

  // Handle create new conversation
  const handleCreateNew = useCallback(async () => {
    await createConversation();
  }, [createConversation]);

  // Handle load conversation
  const handleLoadConversation = useCallback(
    async (id: string) => {
      if (id !== activeConversationId) {
        await loadConversation(id);
      }
    },
    [activeConversationId, loadConversation],
  );

  // Handle rename conversation
  const handleRenameConversation = useCallback(
    async (id: string, updates: { title: string }) => {
      const success = await updateConversation(id, updates);
      if (success) {
        toast.success('Conversation renamed');
      }
    },
    [updateConversation],
  );

  // Handle delete conversation
  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const success = await deleteConversation(id);
      if (success) {
        toast.success('Conversation deleted');
      }
    },
    [deleteConversation],
  );

  return (
    <>
      <Toaster position="top-center" richColors closeButton />

      <div className={clsx('flex h-full', className)}>
        {/* Sidebar */}
        <ChatSidebar
          conversations={conversations}
          isLoading={isLoadingConversations}
          onCreateNew={handleCreateNew}
          onLoadConversation={handleLoadConversation}
          onUpdateConversation={handleRenameConversation}
          onDeleteConversation={handleDeleteConversation}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 bg-cream-50 dark:bg-charcoal-900">
          {/* Header with model selector */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-charcoal-900">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Chat</h1>
              {activeConversationId && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {conversations.find((c) => c.id === activeConversationId)?.title ||
                    'Conversation'}
                </span>
              )}
            </div>
            <ModelSelector />
          </div>

          {/* Chat stream */}
          <div className="flex-1 overflow-hidden">
            <ChatStream onSuggestionClick={handleSuggestionClick} />
          </div>

          {/* Input area */}
          <div className="px-4 pb-4 pt-2 bg-cream-50 dark:bg-charcoal-900">
            <div className="max-w-4xl mx-auto">
              <ChatInputArea
                onSend={handleSendMessage}
                onStopGeneration={stopGeneration}
                isStreaming={isStreaming}
                isLoading={isLoading}
                placeholder={
                  activeConversationId
                    ? 'Continue the conversation...'
                    : 'Start a new conversation...'
                }
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

export default ChatContainer;
