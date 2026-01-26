'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  MoreHorizontal,
  Edit2,
  Trash2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useChatStore, type Conversation } from '@/stores/chatStore';
import { groupConversationsByDate } from '@/lib/hooks/useConversations';

interface ChatSidebarProps {
  conversations: Conversation[];
  isLoading?: boolean;
  onCreateNew: () => Promise<void>;
  onLoadConversation: (id: string) => Promise<void>;
  onUpdateConversation: (id: string, updates: { title: string }) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
  className?: string;
}

export const ChatSidebar = memo(function ChatSidebar({
  conversations,
  isLoading = false,
  onCreateNew,
  onLoadConversation,
  onUpdateConversation,
  onDeleteConversation,
  className = '',
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const sidebarCollapsed = useChatStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useChatStore((state) => state.toggleSidebar);

  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(query));
  }, [conversations, searchQuery]);

  // Group conversations by date
  const groupedConversations = useMemo(() => {
    return groupConversationsByDate(filteredConversations);
  }, [filteredConversations]);

  // Handle create new
  const handleCreateNew = useCallback(async () => {
    setIsCreating(true);
    try {
      await onCreateNew();
    } finally {
      setIsCreating(false);
    }
  }, [onCreateNew]);

  // Handle rename
  const handleStartRename = useCallback((conversation: Conversation) => {
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
    setActiveMenuId(null);
  }, []);

  const handleSaveRename = useCallback(async () => {
    if (!editingId || !editingTitle.trim()) return;
    await onUpdateConversation(editingId, { title: editingTitle.trim() });
    setEditingId(null);
    setEditingTitle('');
  }, [editingId, editingTitle, onUpdateConversation]);

  const handleCancelRename = useCallback(() => {
    setEditingId(null);
    setEditingTitle('');
  }, []);

  // Handle delete
  const handleDelete = useCallback(
    async (id: string) => {
      setActiveMenuId(null);
      await onDeleteConversation(id);
    },
    [onDeleteConversation],
  );

  // Collapsed sidebar
  if (sidebarCollapsed) {
    return (
      <div
        className={clsx(
          'flex flex-col items-center py-4 w-12',
          'bg-white dark:bg-charcoal-900',
          'border-r border-gray-200 dark:border-gray-800',
          className,
        )}
      >
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          title="Expand sidebar"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <button
          onClick={handleCreateNew}
          disabled={isCreating}
          className="mt-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          title="New conversation"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'flex flex-col w-64 lg:w-72',
        'bg-white dark:bg-charcoal-900',
        'border-r border-gray-200 dark:border-gray-800',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Conversations</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCreateNew}
            disabled={isCreating}
            className={clsx(
              'p-1.5 rounded-lg transition-colors',
              'hover:bg-gray-100 dark:hover:bg-gray-800',
              'text-gray-500 dark:text-gray-400',
              isCreating && 'opacity-50 cursor-wait',
            )}
            title="New conversation"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={clsx(
              'w-full pl-9 pr-3 py-2 text-sm rounded-lg',
              'bg-gray-100 dark:bg-gray-800',
              'border border-transparent',
              'focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50',
              'placeholder-gray-400 dark:placeholder-gray-500',
              'text-gray-900 dark:text-gray-100',
              'transition-colors',
            )}
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-blue-500" />
          </div>
        ) : Object.keys(groupedConversations).length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          Object.entries(groupedConversations).map(([group, convs]) => (
            <div key={group} className="mb-4">
              <p className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {group}
              </p>
              {convs.map((conversation) => {
                const isActive = conversation.id === activeConversationId;
                const isEditing = editingId === conversation.id;
                const isMenuOpen = activeMenuId === conversation.id;

                return (
                  <div
                    key={conversation.id}
                    className={clsx(
                      'group relative flex items-center gap-2 px-2 py-2 rounded-lg',
                      'transition-colors duration-150',
                      isActive
                        ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300',
                    )}
                  >
                    <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-50" />

                    {isEditing ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename();
                            if (e.key === 'Escape') handleCancelRename();
                          }}
                          className={clsx(
                            'flex-1 min-w-0 px-1 py-0.5 text-sm rounded',
                            'bg-white dark:bg-gray-700',
                            'border border-blue-500',
                            'focus:outline-none',
                          )}
                          autoFocus
                        />
                        <button
                          onClick={handleSaveRename}
                          className="p-0.5 text-green-500 hover:text-green-600"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleCancelRename}
                          className="p-0.5 text-gray-400 hover:text-gray-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => onLoadConversation(conversation.id)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className="text-sm font-medium truncate">{conversation.title}</p>
                        </button>

                        {/* Actions menu button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(isMenuOpen ? null : conversation.id);
                          }}
                          className={clsx(
                            'p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity',
                            'hover:bg-gray-200 dark:hover:bg-gray-700',
                            isMenuOpen && 'opacity-100',
                          )}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {/* Dropdown menu */}
                        {isMenuOpen && (
                          <div
                            className={clsx(
                              'absolute right-0 top-full mt-1 z-50',
                              'min-w-[140px] py-1',
                              'bg-white dark:bg-gray-800',
                              'border border-gray-200 dark:border-gray-700',
                              'rounded-lg shadow-lg',
                              'animate-in fade-in slide-in-from-top-1 duration-150',
                            )}
                          >
                            <button
                              onClick={() => handleStartRename(conversation)}
                              className={clsx(
                                'w-full flex items-center gap-2 px-3 py-2 text-sm',
                                'hover:bg-gray-100 dark:hover:bg-gray-700',
                                'text-gray-700 dark:text-gray-300',
                              )}
                            >
                              <Edit2 className="w-4 h-4" />
                              Rename
                            </button>
                            <button
                              onClick={() => handleDelete(conversation.id)}
                              className={clsx(
                                'w-full flex items-center gap-2 px-3 py-2 text-sm',
                                'hover:bg-red-50 dark:hover:bg-red-900/30',
                                'text-red-600 dark:text-red-400',
                              )}
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
});

export default ChatSidebar;
