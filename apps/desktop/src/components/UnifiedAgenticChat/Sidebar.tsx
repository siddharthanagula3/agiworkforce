import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Download,
  FileText,
  FolderOpen,
  HelpCircle,
  History,
  Layers,
  Link2,
  MessageSquare,
  Pin,
  PinOff,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCallback, useEffect, useMemo, useState, memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../../lib/utils';
import {
  useChatStore,
  selectConversations,
  selectActiveConversationId,
  selectActiveView,
  type ConversationSummary,
} from '../../stores/chat/chatStore';
import { useProjectStore, selectActiveProjects } from '../../stores/projectStore';
import { supabaseAuth } from '../../services/supabaseAuth';
import { resetInFlightChatState } from '../../lib/newChatReset';
import { UserProfile } from '../Layout/UserProfile';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ResizeHandle } from '../ui/ResizeHandle';
import { ScrollArea } from '../ui/ScrollArea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/AlertDialog';
import { useSimpleModeStore, selectIsSimpleMode } from '../../stores/ui';
import { SimpleModeToggle } from '../SimpleMode';
import { ShareConversationDialog } from './ShareConversationDialog';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '../../lib/tauri-mock';

interface SidebarProps {
  className?: string;
  onOpenCustomInstructions?: (conversationId: string) => void;
  onNewChat?: () => void | Promise<void>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobile?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  width?: number;
  onResize?: (width: number) => void;
  onOpenResearch?: () => void;
  onOpenRewind?: () => void;
  onOpenCollaboration?: () => void;
  onToggleMediaLab?: () => void;
  canAccessMediaLab?: boolean;
}

type TemporalGroup = 'today' | 'yesterday' | 'thisWeek' | 'last7Days' | 'last30Days' | 'older';

/**
 * Memoized conversation item component to prevent unnecessary re-renders.
 * PERFORMANCE OPTIMIZATION: Each conversation item in the sidebar can trigger
 * re-renders when the parent state changes. By memoizing this component,
 * we only re-render when the specific conversation data changes.
 */
interface ConversationItemProps {
  conv: ConversationSummary;
  isActive: boolean;
  isKeyboardFocused: boolean;
  isSimpleMode: boolean;
  showArchived: boolean;
  editingId: string | null;
  editingTitle: string;
  onSelect: (id: string) => void;
  onStartEdit: (conv: ConversationSummary) => void;
  onEditTitleChange: (title: string) => void;
  onRename: (id: string) => void;
  onCancelEdit: () => void;
  onOpenCustomInstructions?: (id: string) => void;
  onTogglePin: (id: string) => void;
  onShare: (id: string, title: string) => void;
  onExport: (id: string, title: string) => void;
  onExportPdf: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string, title: string) => void;
}

const ConversationItem = memo<ConversationItemProps>(
  ({
    conv,
    isActive,
    isKeyboardFocused,
    isSimpleMode,
    showArchived,
    editingId,
    editingTitle,
    onSelect,
    onStartEdit,
    onEditTitleChange,
    onRename,
    onCancelEdit,
    onOpenCustomInstructions,
    onTogglePin,
    onShare,
    onExport,
    onExportPdf,
    onArchive,
    onRestore,
    onDelete,
  }) => {
    const isEditing = editingId === conv.id;

    return (
      <div
        className={cn(
          'group relative rounded-lg transition-all mb-1',
          isActive ? 'bg-teal-100 dark:bg-teal-900/30' : 'hover:bg-[hsl(var(--accent))]',
          isKeyboardFocused && 'ring-2 ring-teal-500 ring-offset-2',
        )}
      >
        {isEditing ? (
          <Input
            autoFocus
            value={editingTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            onBlur={() => onRename(conv.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRename(conv.id);
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="w-full px-3 py-2 text-sm"
          />
        ) : (
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(conv.id)}
              onDoubleClick={() => onStartEdit(conv)}
              className="flex-1 text-left px-3 py-2 overflow-hidden"
            >
              <div className="font-medium text-sm truncate">{conv.title || 'Untitled'}</div>
              {conv.lastMessage && (
                <div className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                  {conv.lastMessage}
                </div>
              )}
            </button>

            {/* Conversation action buttons - simplified in simple mode */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 pr-2">
              {/* Only show delete in simple mode, show all actions in advanced mode */}
              {!isSimpleMode && (
                <>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCustomInstructions?.(conv.id);
                    }}
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-6 w-6 text-[hsl(var(--muted-foreground))] hover:text-amber-500',
                      conv.customInstructions && 'text-amber-500',
                    )}
                    title={
                      conv.customInstructions
                        ? 'Edit custom instructions'
                        : 'Add custom instructions'
                    }
                  >
                    <Sparkles className="h-3 w-3" />
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin(conv.id);
                    }}
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-[hsl(var(--muted-foreground))] hover:text-teal-500"
                    title={conv.pinned ? 'Unpin' : 'Pin'}
                  >
                    {conv.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onShare(conv.id, conv.title || 'Untitled');
                    }}
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-[hsl(var(--muted-foreground))] hover:text-teal-500"
                    title="Share conversation"
                  >
                    <Link2 className="h-3 w-3" />
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onExport(conv.id, conv.title || 'Untitled');
                    }}
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-[hsl(var(--muted-foreground))] hover:text-blue-500"
                    title="Export to Markdown"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onExportPdf(conv.id, conv.title || 'Untitled');
                    }}
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-[hsl(var(--muted-foreground))] hover:text-red-500"
                    title="Export as PDF"
                  >
                    <FileText className="h-3 w-3" />
                  </Button>
                  {showArchived ? (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestore(conv.id);
                      }}
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-[hsl(var(--muted-foreground))] hover:text-emerald-500"
                      title="Restore from archive"
                    >
                      <ArchiveRestore className="h-3 w-3" />
                    </Button>
                  ) : (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchive(conv.id);
                      }}
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-[hsl(var(--muted-foreground))] hover:text-amber-500"
                      title="Archive"
                    >
                      <Archive className="h-3 w-3" />
                    </Button>
                  )}
                </>
              )}
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id, conv.title || 'Untitled');
                }}
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-[hsl(var(--muted-foreground))] hover:text-red-500"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  },
);

ConversationItem.displayName = 'ConversationItem';

const TEMPORAL_LABELS: Record<TemporalGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  last7Days: 'Last 7 Days',
  last30Days: 'Last 30 Days',
  older: 'Older',
};

function getTemporalGroup(date: Date): TemporalGroup {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay());
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
  onOpenCustomInstructions,
  onNewChat,
  collapsed = false,
  onToggleCollapse,
  isMobile = false,
  onCollapsedChange = () => {},
  width = 260,
  onResize,
  onOpenResearch,
  onOpenRewind,
  onOpenCollaboration,
  onToggleMediaLab,
  canAccessMediaLab,
}: SidebarProps) {
  // Platform-aware modifier key: ⌘ on Mac, Ctrl on Windows/Linux
  const modKeySymbol =
    typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';

  // Migration: All store hooks now use useChatStore (modular store) instead of useUnifiedChatStore
  // Using exported selectors for optimal re-render performance
  const conversations = useChatStore(selectConversations);
  const activeConversationId = useChatStore(selectActiveConversationId);
  const activeView = useChatStore(selectActiveView);

  // Simple mode state - hide advanced features
  const isSimpleMode = useSimpleModeStore(selectIsSimpleMode);

  // Conversation actions - renamed selectConversation to avoid conflict with selector
  const selectConversationFn = useChatStore((state) => state.selectConversation);
  const renameConversation = useChatStore((state) => state.renameConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const togglePinnedConversation = useChatStore((state) => state.togglePinnedConversation);
  const archiveConversation = useChatStore((state) => state.archiveConversation);
  const restoreConversation = useChatStore((state) => state.restoreConversation);
  const exportConversationToMarkdown = useChatStore((state) => state.exportConversationToMarkdown);
  const createConversation = useChatStore((state) => state.createConversation);
  const setActiveView = useChatStore((state) => state.setActiveView);
  const ensureActiveConversation = useChatStore((state) => state.ensureActiveConversation);
  const getConversationStats = useChatStore((state) => state.getConversationStats);

  // Message loading functions
  const messagesByConversation = useChatStore((state) => state.messagesByConversation);
  const loadConversationMessages = useChatStore((state) => state.loadConversationMessages);

  // Get stats for active conversation
  const stats = useMemo(() => {
    if (!activeConversationId) return null;
    return getConversationStats(activeConversationId);
  }, [activeConversationId, getConversationStats]);

  const handleExportConversation = useCallback(
    (id: string, title: string) => {
      const markdown = exportConversationToMarkdown(id);
      if (!markdown) {
        toast.error('No messages to export');
        return;
      }

      // Create and trigger download
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_conversation.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success('Conversation exported');
    },
    [exportConversationToMarkdown],
  );

  const handleExportPdf = useCallback(async (id: string, title: string) => {
    try {
      const safeName = title
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 60);
      const filePath = await save({
        defaultPath: `${safeName || 'conversation'}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (filePath) {
        await invoke<string>('conversation_export_pdf', {
          conversationId: id,
          outputPath: filePath,
        });
        toast.success('Conversation exported as PDF');
      }
    } catch {
      toast.error('Failed to export conversation as PDF');
    }
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<TemporalGroup>>(
    new Set(['today', 'yesterday', 'thisWeek']),
  );
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{
    open: boolean;
    conversationId: string;
    conversationTitle: string;
  }>({ open: false, conversationId: '', conversationTitle: '' });
  const [shareDialog, setShareDialog] = useState<{
    open: boolean;
    conversationId: string;
    conversationTitle: string;
  }>({ open: false, conversationId: '', conversationTitle: '' });

  // Get projects for filtering - use useShallow to prevent re-renders from array reference changes
  const projects = useProjectStore(useShallow(selectActiveProjects));
  const activeProjectId = useProjectStore((state) => state.activeProjectId);

  // Sync with active project from project store
  useEffect(() => {
    if (activeProjectId && !selectedProjectFilter) {
      setSelectedProjectFilter(activeProjectId);
    }
  }, [activeProjectId, selectedProjectFilter]);

  // Get archived conversations - filter directly from conversations array
  // to avoid dependency on store function which may cause re-render loops
  const archivedConversations = useMemo(
    () => conversations.filter((c) => c.archived === true),
    [conversations],
  );

  // Run once on mount - ensureActiveConversation is a stable store function
  useEffect(() => {
    ensureActiveConversation();
  }, [ensureActiveConversation]);

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    // Filter out archived conversations from main list (unless showing archived)
    let baseList = showArchived
      ? conversations.filter((c) => c.archived === true)
      : conversations.filter((c) => !c.archived);

    // Filter by project if selected
    if (selectedProjectFilter) {
      baseList = baseList.filter((c) => c.projectId === selectedProjectFilter);
    }

    if (!term) return baseList;
    return baseList.filter((conv) => {
      const haystack = `${conv.title ?? ''} ${conv.lastMessage ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [conversations, searchQuery, showArchived, selectedProjectFilter]);

  // Get selected project details
  const selectedProject = useMemo(
    () => (selectedProjectFilter ? projects.find((p) => p.id === selectedProjectFilter) : null),
    [projects, selectedProjectFilter],
  );

  const pinnedConversations = useMemo(
    () =>
      filtered
        .filter((c) => c.pinned)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [filtered],
  );

  const unpinnedConversations = useMemo(() => filtered.filter((c) => !c.pinned), [filtered]);

  const groupedConversations = useMemo(() => {
    const groups = new Map<TemporalGroup, ConversationSummary[]>();

    unpinnedConversations.forEach((conv) => {
      const group = getTemporalGroup(new Date(conv.updatedAt));
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)?.push(conv);
    });

    groups.forEach((convs) => {
      convs.sort((a, b) => {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    });

    return groups;
  }, [unpinnedConversations]);

  const visibleConversations = useMemo(() => {
    const visible: ConversationSummary[] = [...pinnedConversations];
    Array.from(groupedConversations.entries()).forEach(([group, convs]) => {
      if (expandedGroups.has(group)) {
        visible.push(...convs);
      }
    });
    return visible;
  }, [groupedConversations, expandedGroups, pinnedConversations]);

  const handleNewChat = useCallback(async () => {
    if (onNewChat) {
      await onNewChat();
    } else {
      await resetInFlightChatState();
      createConversation('New chat');
    }
    setActiveView('chat');
    if (isMobile && onCollapsedChange) {
      onCollapsedChange(true);
    }
  }, [createConversation, isMobile, onCollapsedChange, onNewChat, setActiveView]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      selectConversationFn(id);
      setActiveView('chat');
      if (isMobile && onCollapsedChange) {
        onCollapsedChange(true);
      }

      // Check if messages need to be loaded from the backend
      // selectConversation sets isLoadingMessages=true when cache is empty
      const cachedMessages = messagesByConversation[id];
      if (!cachedMessages || cachedMessages.length === 0) {
        // Get user ID for the API call
        const userId = supabaseAuth.getUser()?.id;
        if (userId) {
          // Load messages from backend asynchronously
          loadConversationMessages(id, userId).catch((error) => {
            console.error('[Sidebar] Failed to load conversation messages:', error);
            toast.error('Failed to load conversation messages');
          });
        } else {
          // BUG-342: Surface an error instead of silently skipping
          console.warn('[Sidebar] Cannot load messages: user not authenticated');
          toast.error('Please sign in to load conversation messages');
        }
      }
    },
    [
      selectConversationFn,
      setActiveView,
      isMobile,
      onCollapsedChange,
      messagesByConversation,
      loadConversationMessages,
    ],
  );

  const handleRename = useCallback(
    (id: string) => {
      if (editingId !== id) return;
      if (!editingTitle.trim()) {
        setEditingId(null);
        setEditingTitle('');
        return;
      }
      renameConversation(id, editingTitle);
      setEditingId(null);
      setEditingTitle('');
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

  const openDeleteConfirmDialog = useCallback((id: string, title: string) => {
    setDeleteConfirmDialog({ open: true, conversationId: id, conversationTitle: title });
  }, []);

  const handleConfirmDelete = useCallback(() => {
    const { conversationId } = deleteConfirmDialog;
    setDeleteConfirmDialog((prev) => ({ ...prev, open: false }));
    if (conversationId) {
      deleteConversation(conversationId);
    }
  }, [deleteConfirmDialog, deleteConversation]);

  // Stable callback handlers for ConversationItem to prevent re-renders
  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingTitle('');
  }, []);

  const handleShare = useCallback((id: string, title: string) => {
    setShareDialog({ open: true, conversationId: id, conversationTitle: title });
  }, []);

  const handleArchive = useCallback(
    (id: string) => {
      archiveConversation(id);
      toast.success('Conversation archived');
    },
    [archiveConversation],
  );

  const handleRestore = useCallback(
    (id: string) => {
      restoreConversation(id);
      toast.success('Conversation restored');
    },
    [restoreConversation],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard: don't steal keystrokes from text inputs or editable elements
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Handle Escape - close search and reset state
      if (e.key === 'Escape') {
        setShowSearch(false);
        setSearchQuery('');
        setFocusedIndex(-1);
        return;
      }

      // Skip arrow navigation if editing or in search mode
      if (editingId || showSearch) return;

      // Handle arrow navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev + 1;
          return next >= visibleConversations.length ? 0 : next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? visibleConversations.length - 1 : next;
        });
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault();
        const conversation = visibleConversations[focusedIndex];
        if (conversation) {
          handleSelectConversation(conversation.id);
          setFocusedIndex(-1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingId, showSearch, focusedIndex, visibleConversations, handleSelectConversation]);

  // Render conversation item using the memoized component
  const renderConversationItem = useCallback(
    (conv: ConversationSummary, isKeyboardFocused: boolean) => (
      <ConversationItem
        key={conv.id}
        conv={conv}
        isActive={conv.id === activeConversationId}
        isKeyboardFocused={isKeyboardFocused}
        isSimpleMode={isSimpleMode}
        showArchived={showArchived}
        editingId={editingId}
        editingTitle={editingTitle}
        onSelect={handleSelectConversation}
        onStartEdit={startEditing}
        onEditTitleChange={setEditingTitle}
        onRename={handleRename}
        onCancelEdit={handleCancelEdit}
        onOpenCustomInstructions={onOpenCustomInstructions}
        onTogglePin={togglePinnedConversation}
        onShare={handleShare}
        onExport={handleExportConversation}
        onExportPdf={handleExportPdf}
        onArchive={handleArchive}
        onRestore={handleRestore}
        onDelete={openDeleteConfirmDialog}
      />
    ),
    [
      activeConversationId,
      isSimpleMode,
      showArchived,
      editingId,
      editingTitle,
      handleSelectConversation,
      startEditing,
      handleRename,
      handleCancelEdit,
      onOpenCustomInstructions,
      togglePinnedConversation,
      handleShare,
      handleExportConversation,
      handleExportPdf,
      handleArchive,
      handleRestore,
      openDeleteConfirmDialog,
    ],
  );

  if (collapsed) {
    return (
      <div className="w-16 flex flex-col bg-[hsl(var(--card))] border-r border-[hsl(var(--border))] transition-all duration-300 ease-in-out">
        <div className="p-3 flex flex-col items-center gap-4">
          <Button
            onClick={onToggleCollapse}
            variant="ghost"
            size="icon"
            className="text-[hsl(var(--muted-foreground))]"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleNewChat}
            variant="ghost"
            size="icon"
            className="text-[hsl(var(--muted-foreground))]"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => {
              if (onToggleCollapse) onToggleCollapse();
              setShowSearch(true);
            }}
            variant="ghost"
            size="icon"
            className="text-[hsl(var(--muted-foreground))]"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirmDialog.open}
        onOpenChange={(open) => setDeleteConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete &quot;
              {deleteConfirmDialog.conversationTitle}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share Conversation Dialog */}
      <ShareConversationDialog
        conversationId={shareDialog.conversationId}
        conversationTitle={shareDialog.conversationTitle}
        isOpen={shareDialog.open}
        onClose={() => setShareDialog((prev) => ({ ...prev, open: false }))}
      />

      {}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs"
            onClick={() => setShowSearch(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[hsl(var(--card))] rounded-xl shadow-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[hsl(var(--border))]">
                  <Search className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
                  <Input
                    autoFocus
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 border-0 bg-transparent focus:ring-0"
                  />
                  <kbd className="px-2 py-1 text-xs bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] rounded">
                    ESC
                  </kbd>
                </div>
                <ScrollArea className="max-h-96">
                  <div className="p-2">
                    {filtered.slice(0, 10).map((conv) => (
                      <button
                        type="button"
                        key={conv.id}
                        onClick={() => {
                          selectConversationFn(conv.id);
                          setActiveView('chat');
                          setShowSearch(false);
                          setSearchQuery('');
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg transition-colors',
                          conv.id === activeConversationId
                            ? 'bg-primary/10'
                            : 'hover:bg-[hsl(var(--accent))]',
                        )}
                      >
                        <div className="font-medium text-sm">{conv.title}</div>
                        {conv.lastMessage && (
                          <div className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-1">
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
          'flex flex-col bg-[hsl(var(--card))] border-r border-[hsl(var(--border))] transition-all duration-300 ease-in-out relative',
          className,
        )}
        style={{ width: width }}
      >
        {onResize && !collapsed && (
          <ResizeHandle
            width={width}
            onResize={onResize}
            direction="right"
            minWidth={200}
            maxWidth={400}
          />
        )}
        {}
        <div className="p-4 border-b border-[hsl(var(--border))]">
          <div className="flex items-center justify-between mb-3">
            <Button
              onClick={onToggleCollapse}
              variant="ghost"
              size="icon"
              className="text-[hsl(var(--muted-foreground))]"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleNewChat}
              className="flex items-center gap-2 bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-[hsl(var(--muted))] rounded-lg text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
          >
            <Search className="h-4 w-4" />
            <span>Search</span>
            <div className="ml-auto flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 text-xs bg-[hsl(var(--card))] rounded">
                {modKeySymbol}
              </kbd>
              <kbd className="px-1.5 py-0.5 text-xs bg-[hsl(var(--card))] rounded">K</kbd>
            </div>
          </button>
        </div>

        {/* Navigation - hide projects section in simple mode */}
        {!collapsed && !isSimpleMode && (
          <div className="px-3 py-2 space-y-1 overflow-y-auto max-h-[40vh] scrollbar-thin">
            <button
              type="button"
              onClick={() => onOpenResearch?.()}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-muted-foreground hover:bg-surface-hover"
            >
              <span className="w-5 h-5 flex items-center justify-center rounded bg-blue-400/20 text-blue-400">
                <BookOpen className="w-3.5 h-3.5" />
              </span>
              Deep Research
            </button>

            <button
              type="button"
              onClick={() => onOpenRewind?.()}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-muted-foreground hover:bg-surface-hover"
            >
              <span className="w-5 h-5 flex items-center justify-center rounded bg-violet-400/20 text-violet-400">
                <History className="w-3.5 h-3.5" />
              </span>
              Rewind Timeline
            </button>

            <button
              type="button"
              onClick={() => onOpenCollaboration?.()}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-muted-foreground hover:bg-surface-hover"
            >
              <span className="w-5 h-5 flex items-center justify-center rounded bg-purple-400/20 text-purple-400">
                <Users className="w-3.5 h-3.5" />
              </span>
              Agent Swarm
            </button>

            {canAccessMediaLab && (
              <button
                type="button"
                onClick={() => onToggleMediaLab?.()}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-muted-foreground hover:bg-surface-hover"
              >
                <span className="w-5 h-5 flex items-center justify-center rounded bg-amber-400/20 text-amber-400">
                  <Wand2 className="w-3.5 h-3.5" />
                </span>
                Media Lab Pro+
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveView('projects')}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                activeView === 'projects'
                  ? 'bg-surface-hover text-foreground'
                  : 'text-muted-foreground hover:bg-surface-hover',
              )}
            >
              <span className="w-5 h-5 flex items-center justify-center rounded bg-teal-400/20 text-teal-400">
                <Layers className="w-3.5 h-3.5" />
              </span>
              Projects
            </button>

            <button
              type="button"
              onClick={() => setActiveView('help')}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                activeView === 'help'
                  ? 'bg-surface-hover text-foreground'
                  : 'text-muted-foreground hover:bg-surface-hover',
              )}
            >
              <span className="w-5 h-5 flex items-center justify-center rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                <HelpCircle className="w-3.5 h-3.5" />
              </span>
              Help
            </button>

            {/* Project filter dropdown */}
            {projects.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                      selectedProjectFilter
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'text-muted-foreground hover:bg-surface-hover',
                    )}
                  >
                    <span
                      className={cn(
                        'w-5 h-5 flex items-center justify-center rounded',
                        selectedProjectFilter
                          ? 'text-blue-500'
                          : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
                      )}
                      style={
                        selectedProject?.color
                          ? {
                              backgroundColor: `${selectedProject.color}20`,
                              color: selectedProject.color,
                            }
                          : undefined
                      }
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </span>
                    <span className="flex-1 text-left truncate">
                      {selectedProject?.name || 'Filter by Project'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-56 bg-[hsl(var(--popover))] border-[hsl(var(--border))]"
                >
                  <DropdownMenuItem
                    onClick={() => setSelectedProjectFilter(null)}
                    className={cn(
                      'text-[hsl(var(--popover-foreground))]',
                      !selectedProjectFilter && 'bg-[hsl(var(--accent))]',
                    )}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    All Conversations
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-[hsl(var(--border))]" />
                  {projects.map((project) => (
                    <DropdownMenuItem
                      key={project.id}
                      onClick={() => setSelectedProjectFilter(project.id)}
                      className={cn(
                        'text-[hsl(var(--popover-foreground))]',
                        selectedProjectFilter === project.id && 'bg-[hsl(var(--accent))]',
                      )}
                    >
                      <span
                        className="w-4 h-4 rounded mr-2 flex items-center justify-center"
                        style={{ backgroundColor: project.color || '#3b82f6' }}
                      >
                        <Layers className="w-2.5 h-2.5 text-white" />
                      </span>
                      <span className="truncate">{project.name}</span>
                      <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">
                        {conversations.filter((c) => c.projectId === project.id).length}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Clear project filter indicator */}
            {selectedProjectFilter && (
              <button
                type="button"
                onClick={() => setSelectedProjectFilter(null)}
                className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              >
                <X className="w-3 h-3" />
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* Archive toggle - hidden in simple mode */}
        {!collapsed && !isSimpleMode && archivedConversations.length > 0 && (
          <div className="px-3 py-1">
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                showArchived
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground hover:bg-surface-hover',
              )}
            >
              <span
                className={cn(
                  'w-5 h-5 flex items-center justify-center rounded',
                  showArchived
                    ? 'bg-amber-400/20 text-amber-500'
                    : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
                )}
              >
                <Archive className="w-3.5 h-3.5" />
              </span>
              <span>Archived</span>
              <span className="ml-auto text-xs bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] px-1.5 py-0.5 rounded-full">
                {archivedConversations.length}
              </span>
            </button>
          </div>
        )}

        {}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {}
            {pinnedConversations.length > 0 && (
              <div className="mb-6">
                <div className="px-3 mb-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider flex items-center gap-1">
                  <Pin className="w-3 h-3" /> Pinned
                </div>
                {pinnedConversations.map((conv) => {
                  const globalIndex = visibleConversations.findIndex((c) => c.id === conv.id);
                  return renderConversationItem(conv, globalIndex === focusedIndex);
                })}
              </div>
            )}

            {}
            {Array.from(groupedConversations.entries()).map(([group, convs]) => (
              <div key={group} className="mb-4">
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={expandedGroups.has(group)}
                  aria-controls={`conversation-group-${group}`}
                  className="w-full flex items-center gap-2 px-2 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
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
                  <span className="ml-auto text-[hsl(var(--muted-foreground))]">
                    ({convs.length})
                  </span>
                </button>

                <AnimatePresence>
                  {expandedGroups.has(group) && (
                    <motion.div
                      id={`conversation-group-${group}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mt-1 space-y-1"
                    >
                      {convs.map((conv) => {
                        const globalIndex = visibleConversations.findIndex((c) => c.id === conv.id);
                        return renderConversationItem(conv, globalIndex === focusedIndex);
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Conversation Stats - hidden in simple mode */}
        {!collapsed && !isSimpleMode && stats && stats.messageCount > 0 && (
          <div className="border-t border-[hsl(var(--border))] px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
              <span className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
                Stats
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
                <MessageSquare className="h-3 w-3" />
                <span>{stats.messageCount} messages</span>
              </div>
              {stats.totalTokens > 0 && (
                <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
                  <Zap className="h-3 w-3" />
                  <span>{(stats.totalTokens / 1000).toFixed(1)}k tokens</span>
                </div>
              )}
              {stats.totalCost > 0 && (
                <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))] col-span-2">
                  <Coins className="h-3 w-3" />
                  <span>${stats.totalCost.toFixed(4)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Simple Mode Toggle - shown at the bottom */}
        {!collapsed && (
          <div className="border-t border-[hsl(var(--border))] px-4 py-3">
            <SimpleModeToggle />
          </div>
        )}

        {}
        <div className="mt-auto border-t border-[hsl(var(--border))] p-4">
          <UserProfile collapsed={collapsed} />
        </div>
      </div>
    </>
  );
}

export default Sidebar;
