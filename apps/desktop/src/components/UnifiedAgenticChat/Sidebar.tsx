import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Trash2,
  Calendar,
  Clock,
  Settings,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useUnifiedChatStore, type ConversationSummary } from '../../stores/unifiedChatStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  className?: string;
  onOpenSettings?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

type TemporalGroup = 'today' | 'yesterday' | 'thisWeek' | 'last7Days' | 'last30Days' | 'older';

const TEMPORAL_LABELS: Record<TemporalGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  last7Days: 'Last 7 Days',
  last30Days: 'Last 30 Days',
  older: 'Older',
};

// Helper function to get temporal group
function getTemporalGroup(date: Date): TemporalGroup {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay()); // Start of week (Sunday)
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const conversationDate = new Date(date);

  if (conversationDate >= today) {
    return 'today';
  } else if (conversationDate >= yesterday && conversationDate < today) {
    return 'yesterday';
  } else if (conversationDate >= thisWeekStart && conversationDate < yesterday) {
    return 'thisWeek';
  } else if (conversationDate >= sevenDaysAgo) {
    return 'last7Days';
  } else if (conversationDate >= thirtyDaysAgo) {
    return 'last30Days';
  } else {
    return 'older';
  }
}

export function Sidebar({
  className,
  onOpenSettings,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const {
    conversations,
    activeConversationId,
    createConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
  } = useUnifiedChatStore();
  const ensureActiveConversation = useUnifiedChatStore((state) => state.ensureActiveConversation);

  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<TemporalGroup>>(
    new Set(['today', 'yesterday', 'thisWeek']),
  );

  useEffect(() => {
    ensureActiveConversation();
  }, [ensureActiveConversation]);

  // Filter conversations based on search
  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conv) => {
      const haystack = `${conv.title ?? ''} ${conv.lastMessage ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [conversations, searchQuery]);

  // Group conversations by time
  const groupedConversations = useMemo(() => {
    const groups = new Map<TemporalGroup, ConversationSummary[]>();

    filtered.forEach((conv) => {
      const group = getTemporalGroup(new Date(conv.updatedAt));
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)?.push(conv);
    });

    // Sort conversations within each group
    groups.forEach((convs) => {
      convs.sort((a, b) => {
        // Pinned first
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        // Then by date
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    });

    return groups;
  }, [filtered]);

  const handleCreateConversation = useCallback(() => {
    createConversation('New chat');
  }, [createConversation]);

  const handleRename = useCallback(
    (id: string) => {
      if (editingTitle.trim() && editingId === id) {
        renameConversation(id, editingTitle);
        setEditingId(null);
        setEditingTitle('');
      }
    },
    [editingId, editingTitle, renameConversation],
  );

  const startEditing = useCallback((conv: ConversationSummary) => {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  }, []);

  const toggleGroup = useCallback((group: TemporalGroup) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }, []);

  // Handle Cmd+K search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
        setSearchQuery('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (collapsed) {
    return (
      <div className="w-16 flex flex-col bg-white dark:bg-charcoal-900 border-r border-gray-200 dark:border-gray-800">
        <div className="p-3 flex flex-col items-center gap-4">
          <Button
            onClick={onToggleCollapse}
            variant="ghost"
            size="icon"
            className="text-gray-600 dark:text-gray-400"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleCreateConversation}
            variant="ghost"
            size="icon"
            className="text-gray-600 dark:text-gray-400"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => setShowSearch(!showSearch)}
            variant="ghost"
            size="icon"
            className="text-gray-600 dark:text-gray-400"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Command Palette / Search Modal */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSearch(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white dark:bg-charcoal-800 rounded-xl shadow-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                  <Search className="h-5 w-5 text-gray-500" />
                  <Input
                    autoFocus
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 border-0 bg-transparent focus:ring-0"
                  />
                  <kbd className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded">ESC</kbd>
                </div>
                <ScrollArea className="max-h-96">
                  <div className="p-2">
                    {filtered.slice(0, 10).map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          selectConversation(conv.id);
                          setShowSearch(false);
                          setSearchQuery('');
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg transition-colors',
                          conv.id === activeConversationId
                            ? 'bg-teal-100 dark:bg-teal-900/30'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800',
                        )}
                      >
                        <div className="font-medium text-sm">{conv.title}</div>
                        {conv.lastMessage && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                            {conv.lastMessage}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={cn(
          'w-64 flex flex-col bg-white dark:bg-charcoal-900 border-r border-gray-200 dark:border-gray-800',
          className,
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <Button
              onClick={onToggleCollapse}
              variant="ghost"
              size="icon"
              className="text-gray-600 dark:text-gray-400"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleCreateConversation}
              variant="default"
              className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
          </div>
          <button
            onClick={() => setShowSearch(true)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Search className="h-4 w-4" />
            <span>Search</span>
            <div className="ml-auto flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 text-xs bg-white dark:bg-gray-900 rounded">⌘</kbd>
              <kbd className="px-1.5 py-0.5 text-xs bg-white dark:bg-gray-900 rounded">K</kbd>
            </div>
          </button>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {Array.from(groupedConversations.entries()).map(([group, convs]) => (
              <div key={group} className="mb-4">
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center gap-2 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 transition-transform',
                      expandedGroups.has(group) && 'rotate-90',
                    )}
                  />
                  <span className="flex items-center gap-1">
                    {group === 'today' && <Calendar className="h-3 w-3" />}
                    {group === 'yesterday' && <Clock className="h-3 w-3" />}
                    {TEMPORAL_LABELS[group]}
                  </span>
                  <span className="ml-auto text-gray-400">({convs.length})</span>
                </button>

                <AnimatePresence>
                  {expandedGroups.has(group) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mt-1 space-y-1"
                    >
                      {convs.map((conv) => (
                        <div
                          key={conv.id}
                          className={cn(
                            'group relative rounded-lg transition-all',
                            conv.id === activeConversationId
                              ? 'bg-teal-100 dark:bg-teal-900/30'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-800',
                          )}
                        >
                          {editingId === conv.id ? (
                            <Input
                              autoFocus
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onBlur={() => handleRename(conv.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRename(conv.id);
                                if (e.key === 'Escape') {
                                  setEditingId(null);
                                  setEditingTitle('');
                                }
                              }}
                              className="w-full px-3 py-2 text-sm"
                            />
                          ) : (
                            <button
                              onClick={() => selectConversation(conv.id)}
                              onDoubleClick={() => startEditing(conv)}
                              className="w-full text-left px-3 py-2"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate">{conv.title}</div>
                                  {conv.lastMessage && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                      {conv.lastMessage}
                                    </div>
                                  )}
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteConversation(conv.id);
                                    }}
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </button>
                          )}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Profile Section */}
        <div className="mt-auto border-t border-gray-200 dark:border-gray-800 p-4">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500 text-white text-sm font-medium">
              U
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium">You</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Pro Plan</div>
            </div>
            <Settings className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>
    </>
  );
}

export default Sidebar;
