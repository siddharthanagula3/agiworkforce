// Updated Nov 16, 2025: Added React.memo for performance optimization
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { MessageBubble } from './MessageBubble';
import { Search, Download, Trash2 } from 'lucide-react';

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

  const listRef = useRef<List>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Filter messages by search query
  const filteredMessages = React.useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const query = searchQuery.toLowerCase();
    return messages.filter((msg) => msg.content.toLowerCase().includes(query));
  }, [messages, searchQuery]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollToItem(filteredMessages.length - 1, 'end');
    }
  }, [filteredMessages.length, autoScroll]);

  // Estimate row height (used for virtual scrolling)
  const getItemSize = (index: number) => {
    const message = filteredMessages[index];
    if (!message) return 100; // Fallback height
    // Rough estimation based on content length
    const baseHeight = 100;
    const contentHeight = Math.min(message.content.length / 2, 500);
    const attachmentHeight = (message.attachments?.length || 0) * 40;
    return baseHeight + contentHeight + attachmentHeight;
  };

  // Updated Nov 16, 2025: Wrapped handlers in useCallback to prevent re-renders
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

  // Updated Nov 16, 2025: Memoized Row component to prevent unnecessary re-renders
  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const message = filteredMessages[index];
      if (!message) return null;

      return (
        <div style={style}>
          <MessageBubble
            message={message}
            showAvatar={true}
            showTimestamp={true}
            enableActions={true}
            onEdit={(content) => onMessageEdit?.(message.id, content)}
            onDelete={() => onMessageDelete?.(message.id)}
            onRegenerate={() => onMessageRegenerate?.(message.id)}
          />
        </div>
      );
    },
    [filteredMessages, onMessageEdit, onMessageDelete, onMessageRegenerate],
  );

  // Empty state
  if (filteredMessages.length === 0 && !searchQuery) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-center ${className}`}>
        <div className="max-w-md space-y-4">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
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

  // No search results
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
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
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

      {/* Search Bar */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
      )}

      {/* Message List (Virtual) */}
      <div className="flex-1 overflow-hidden">
        <AutoSizer>
          {({ height, width }) => (
            <List
              ref={listRef}
              height={height}
              itemCount={filteredMessages.length}
              itemSize={getItemSize}
              width={width}
              overscanCount={5}
            >
              {Row}
            </List>
          )}
        </AutoSizer>
      </div>

      {/* Streaming Indicator */}
      {isStreaming && (
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
          <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
            Assistant is typing...
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMessageList;
