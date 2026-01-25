import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { MessageBubble } from './MessageBubble';
import { Search, Download, Trash2, Brain } from 'lucide-react';

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
      if (!msg.content || typeof msg.content !== 'string') return false;
      return msg.content.toLowerCase().includes(query);
    });
  }, [messages, debouncedSearchQuery]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && listRef.current && filteredMessages.length > 0) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filteredMessages.length, autoScroll]);

  const handleExport = useCallback(async () => {
    try {
      const data = await exportConversation();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
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

  if (filteredMessages.length === 0 && !searchQuery) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-center ${className}`}>
        <div className="max-w-md space-y-4">
          <div className="w-16 h-16 mx-auto bg-linear-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span className="text-3xl">🤖</span>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Welcome to AGI Workforce
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Start a conversation by typing a message below. I can help you automate tasks, manage
            files, run terminal commands, and much more.
          </p>
          <div className="space-y-2 text-sm text-left">
            <p className="text-gray-700 dark:text-gray-300 font-medium">Try asking me to:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
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
        <Search size={48} className="text-gray-400 mb-4" />
        <p className="text-gray-600 dark:text-gray-400">
          No messages found matching "{searchQuery}"
        </p>
        <button
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
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-charcoal-900 backdrop-blur-sm">
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          title="Search messages"
        >
          <Search size={16} className="text-gray-600 dark:text-gray-400" />
        </button>
        <button
          onClick={handleExport}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          title="Export conversation"
        >
          <Download size={16} className="text-gray-600 dark:text-gray-400" />
        </button>
        <button
          onClick={handleClearHistory}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          title="Clear history"
        >
          <Trash2 size={16} className="text-gray-600 dark:text-gray-400" />
        </button>
        <div className="flex-1" />
        <span className="text-sm text-gray-500">
          {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}
        </span>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
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
        <div className="sticky top-[52px] z-10 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-charcoal-900">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
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
        <div className="px-4 py-2 border-t border-white/5 bg-zinc-800/40">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Brain size={14} className="animate-pulse text-zinc-500" />
            Thinking...
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMessageList;
