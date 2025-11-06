import { useState, useCallback } from 'react';
import { MessageList } from './MessageList';
import { InputComposer } from './InputComposer';
import { ConversationSidebar, Conversation } from './ConversationSidebar';
import { Message } from './Message';
import { cn } from '../../lib/utils';
import type { ChatRoutingPreferences } from '../../types/chat';

interface ChatInterfaceProps {
  className?: string;
}

export function ChatInterface({ className }: ChatInterfaceProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const handleNewConversation = useCallback(() => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: 'New Conversation',
      updatedAt: new Date(),
      messageCount: 0,
    };

    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    setMessages([]);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    // TODO: Load messages for this conversation
    setMessages([]);
  }, []);

  const handleSendMessage = useCallback(
    async (
      content: string,
      attachments?: File[],
      _captures?: unknown,
      _routing?: ChatRoutingPreferences,
    ) => {
      if (attachments?.length) {
        // Attachments handling will be implemented when backend wiring is ready
        console.info(`Received ${attachments.length} attachment(s) for processing.`);
      }
      if (!activeConversationId) {
        handleNewConversation();
      }

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);

      // TODO: Send message to backend/AI service
      // Simulate AI response
      setTimeout(() => {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            'This is a simulated response. Connect to your AI backend to get real responses.',
          timestamp: new Date(),
          tokens: 42,
          cost: 0.0001,
        };

        setMessages((prev) => [...prev, aiMessage]);
        setLoading(false);

        // Update conversation
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === activeConversationId
              ? {
                  ...conv,
                  lastMessage: content,
                  updatedAt: new Date(),
                  messageCount: conv.messageCount + 2,
                  title: conv.title === 'New Conversation' ? content.slice(0, 50) : conv.title,
                }
              : conv,
          ),
        );
      }, 1000);
    },
    [activeConversationId, handleNewConversation],
  );

  const handleDeleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((conv) => conv.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(undefined);
        setMessages([]);
      }
    },
    [activeConversationId],
  );

  const handleRenameConversation = useCallback((id: string) => {
    // TODO: Implement rename dialog
    const newTitle = prompt('Enter new title:');
    if (newTitle) {
      setConversations((prev) =>
        prev.map((conv) => (conv.id === id ? { ...conv, title: newTitle } : conv)),
      );
    }
  }, []);

  return (
    <div className={cn('flex h-full', className)}>
      {/* Sidebar */}
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        className="w-80"
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        <MessageList messages={messages} loading={loading} />
        <InputComposer onSend={handleSendMessage} disabled={loading} />
      </div>
    </div>
  );
}
