import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { MessageBubble } from './MessageBubble';
import { Search, Download, Trash2, Brain, Loader2 } from 'lucide-react';

export interface ChatMessageListProps {
  className?: string;
  onMessageEdit?: (id: string, content: string) => void;
  onMessageDelete?: (id: string) => void;
  onMessageRegenerate?: (id: string) => void;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  className = '',
  onMessageEdit,
  onMessageDelete,
  onMessageRegenerate,
}) => {
  const messages = useUnifiedChatStore((state) => state.messages);
  const isLoadingMessages = useUnifiedChatStore((state) => state.isLoadingMessages);
  const isStreaming = useUnifiedChatStore((state) => state.isStreaming);
  const exportConversation = useUnifiedChatStore((state) => state.exportConversation);
  const clearHistory = useUnifiedChatStore((state) => state.clearHistory);

  const listRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Debounce search to prevent performance issues during rapid typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // 300ms debounce
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredMessages = React.useMemo(() => {
    if (!messages || !Array.isArray(messages)) return [];

    if (!debouncedSearchQuery.trim()) return messages;

    // Limit search to last 1000 messages for performance with large histories
    const recentMessages = messages.slice(-1000);
    const query = debouncedSearchQuery.toLowerCase();

    return recentMessages.filter((msg) => {
      // Allow streaming messages even if content is empty (fixes hidden streaming messages)
      if (msg.metadata?.streaming) return true;

      // Filter non-streaming messages by content
      if (!msg.content || typeof msg.content !== 'string') return false;
      return msg.content.toLowerCase().includes(query);
    });
  }, [messages, debouncedSearchQuery]);

  // Compute a fingerprint of the last message content to detect streaming updates
  const lastMessageFingerprint = React.useMemo(() => {
    const lastMessage = filteredMessages[filteredMessages.length - 1];
    if (!lastMessage) return '';
    // Use content length as a lightweight fingerprint - changes during streaming
    return `${lastMessage.id}-${lastMessage.content?.length ?? 0}`;
  }, [filteredMessages]);

  // Auto-scroll to bottom when new messages arrive or content changes during streaming
  useEffect(() => {
    if (autoScroll && listRef.current && filteredMessages.length > 0) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filteredMessages.length, lastMessageFingerprint, isStreaming, autoScroll]);

  const handleExport = useCallback(async () => {
    try {
      const data = await exportConversation();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Failed to export conversation:', err);
    }
  }, [exportConversation]);

  const handleClearHistory = useCallback(() => {
    if (confirm('Are you sure you want to clear all messages? This cannot be undone.')) {
      clearHistory();
    }
  }, [clearHistory]);

  /**
   * PERFORMANCE OPTIMIZATION: Memoized callback factories
   * These return stable callback functions for each message ID,
   * preventing unnecessary re-renders of MessageBubble components.
   * Without this, new function references would be created on every render.
   */
  const handleMessageEdit = useCallback(
    (messageId: string) => (content: string) => {
      onMessageEdit?.(messageId, content);
    },
    [onMessageEdit],
  );

  const handleMessageDelete = useCallback(
    (messageId: string) => () => {
      onMessageDelete?.(messageId);
    },
    [onMessageDelete],
  );

  const handleMessageRegenerate = useCallback(
    (messageId: string) => () => {
      onMessageRegenerate?.(messageId);
    },
    [onMessageRegenerate],
  );

  // Show loading indicator while messages are being loaded
  if (isLoadingMessages) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-center ${className}`}>
        <Loader2 size={48} className="text-blue-500 animate-spin mb-4" />
        <p className="text-muted-foreground">Loading messages...</p>
      </div>
    );
  }

  // Only show empty/welcome state if not loading AND messages are empty
  if (filteredMessages.length === 0 && !searchQuery) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-center ${className}`}>
        <div className="max-w-md space-y-4">
          <div className="w-16 h-16 mx-auto bg-linear-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span className="text-3xl">🤖</span>
          </div>
          <h2 className="text-2xl font-semibold text-foreground">Welcome to AGI Workforce</h2>
          <p className="text-muted-foreground">
            Start a conversation by typing a message below. AGI Workforce can automate tasks, manage
            files, run terminal commands, and much more.
          </p>
          <div className="space-y-2 text-sm text-left">
            <p className="text-foreground font-medium">Try asking me to:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Analyze and refactor code</li>
              <li>Automate repetitive tasks</li>
              <li>Manage files and folders</li>
              <li>Run terminal commands</li>
              <li>Browse and extract web data</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (filteredMessages.length === 0 && searchQuery) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-center ${className}`}>
        <Search size={48} className="text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No messages found matching "{searchQuery}"</p>
        <button
          type="button"
          onClick={() => setSearchQuery('')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Clear Search
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 border-b border-border bg-card backdrop-blur-xs">
        <button
          type="button"
          onClick={() => setShowSearch(!showSearch)}
          className="p-2 hover:bg-accent rounded transition-colors"
          title="Search messages"
        >
          <Search size={16} className="text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="p-2 hover:bg-accent rounded transition-colors"
          title="Export conversation"
        >
          <Download size={16} className="text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={handleClearHistory}
          className="p-2 hover:bg-accent rounded transition-colors"
          title="Clear history"
        >
          <Trash2 size={16} className="text-muted-foreground" />
        </button>
        <div className="flex-1" />
        <span className="text-sm text-muted-foreground">
          {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}
        </span>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          Auto-scroll
        </label>
      </div>

      {}
      {showSearch && (
        <div className="sticky top-[52px] z-10 px-4 py-2 border-b border-border bg-card">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
      )}

      {/* Message list with memoized callbacks to prevent unnecessary re-renders */}
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        className="flex-1 overflow-y-auto px-4 py-2 space-y-2"
      >
        {filteredMessages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            showAvatar={true}
            showTimestamp={true}
            enableActions={true}
            onEdit={handleMessageEdit(message.id)}
            onDelete={handleMessageDelete(message.id)}
            onRegenerate={handleMessageRegenerate(message.id)}
          />
        ))}
      </div>

      {}
      {isStreaming && (
        <div className="px-4 py-2 border-t border-border bg-muted/40">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Brain size={14} className="animate-pulse text-muted-foreground" />
            Thinking...
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMessageList;
