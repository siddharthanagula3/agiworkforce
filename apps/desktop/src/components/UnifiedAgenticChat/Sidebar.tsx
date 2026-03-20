import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  ArchiveRestore,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Download,
  FileText,
  FlaskConical,
  FolderOpen,
  Image,
  Layers,
  Link2,
  MessageSquare,
  PenTool,
  Pin,
  PinOff,
  Plus,
  Search,
  Sparkles,
  TerminalSquare,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
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
import { NotificationCenter } from '../Notifications';
import { ShareConversationDialog } from './ShareConversationDialog';
import { SidebarFeaturesPopover } from './SidebarFeaturesPopover';
import { TransferDialog } from './TransferDialog';
import { IncognitoToggle } from './IncognitoToggle';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke, isTauri } from '../../lib/tauri-mock';
import { useBillingUsageStore, selectBudgetPercentage } from '../../stores/billingUsage';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';
import { useAppModeStore, selectMode } from '../../stores/appModeStore';

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
  onToggleArtifacts?: () => void;
  artifactPanelOpen?: boolean;
  onOpenMcpWorkspace?: () => void;
  onOpenMcpBundles?: () => void;
  onOpenCanvas?: () => void;
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
  /** Project name for attribution badge — undefined when no project assigned */
  projectName?: string;
  onSelect: (id: string) => void;
  onStartEdit: (conv: ConversationSummary) => void;
  onEditTitleChange: (title: string) => void;
  onRename: (id: string) => void;
  onCancelEdit: () => void;
  onOpenCustomInstructions?: (id: string) => void;
  onTogglePin: (id: string) => void;
  onShare: (id: string, title: string) => void;
  onTransfer: (id: string, title: string) => void;
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
    projectName,
    onSelect,
    onStartEdit,
    onEditTitleChange,
    onRename,
    onCancelEdit,
    onOpenCustomInstructions,
    onTogglePin,
    onShare,
    onTransfer,
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
          conv.incognito && 'ring-1 ring-purple-500/20',
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
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 text-left px-3 py-2 overflow-hidden"
            >
              <div className="font-medium text-sm truncate">{conv.title || 'Untitled'}</div>
              {conv.lastMessage && (
                <div className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                  {conv.lastMessage}
                </div>
              )}
              {/* Project attribution badge — shown when conversation belongs to a project */}
              {projectName && (
                <div className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))] truncate">
                  in{' '}
                  <span className="font-medium text-[hsl(var(--foreground))]/60">
                    {projectName}
                  </span>
                </div>
              )}
            </button>

            {/* Conversation action buttons - simplified in simple mode */}
            <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center gap-0.5 pr-2">
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
                      onTransfer(conv.id, conv.title || 'Untitled');
                    }}
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-[hsl(var(--muted-foreground))] hover:text-blue-500"
                    title="Transfer conversation"
                  >
                    <Cloud className="h-3 w-3" />
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
  onToggleArtifacts,
  artifactPanelOpen = false,
  onOpenMcpWorkspace,
  onOpenMcpBundles,
  onOpenCanvas,
}: SidebarProps) {
  // Platform-aware modifier key: ⌘ on Mac, Ctrl on Windows/Linux
  const modKeySymbol =
    typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';

  // Local/Cloud mode — drives the indicator pill in the footer
  const mode = useAppModeStore(selectMode);
  const setMode = useAppModeStore((s) => s.setMode);

  // Usage data for the sidebar widget (only shown when > 50%)
  const budgetPct = useBillingUsageStore(selectBudgetPercentage);
  const budgetEnabled = useBillingUsageStore((s) => s.budget.enabled);
  const openSettings = useSettingsDialogStore((s) => s.openSettings);
  const clampedBudgetPct = Math.min(Math.max(budgetPct, 0), 100);
  const showUsageWidget = budgetEnabled && clampedBudgetPct > 50;

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
  // Message loading functions
  const messagesByConversation = useChatStore((state) => state.messagesByConversation);
  const loadConversationMessages = useChatStore((state) => state.loadConversationMessages);

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

  const [isIncognito, setIsIncognito] = useState(false);
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

  const [featuresPopoverOpen, setFeaturesPopoverOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<{
    id: string;
    title: string;
    localDbId?: number;
  } | null>(null);

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

  // Build a lookup map: projectId → project name, for O(1) attribution badge lookup
  const projectNameById = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    projects.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [projects]);

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
      createConversation('New chat', isIncognito ? { incognito: true } : undefined);
    }
    setActiveView('chat');
    if (isMobile && onCollapsedChange) {
      onCollapsedChange(true);
    }
  }, [createConversation, isIncognito, isMobile, onCollapsedChange, onNewChat, setActiveView]);

  // Track the latest conversation selection to avoid race conditions when
  // the user rapidly clicks different conversations.  Only the most recent
  // selection should apply its loaded messages.
  const latestSelectionRef = useRef<string | null>(null);

  const handleSelectConversation = useCallback(
    (id: string) => {
      // Mark this as the latest selection — any in-flight load for a
      // previously-selected conversation will bail out via the stale check.
      latestSelectionRef.current = id;

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
          loadConversationMessages(id, userId)
            .then(() => {
              // If the user clicked a different conversation while this was
              // loading, discard the result to prevent stale data overwriting
              // the newer selection.
              if (latestSelectionRef.current !== id) {
                return; // stale — a newer selection superseded this one
              }
            })
            .catch((error) => {
              if (latestSelectionRef.current !== id) return; // stale
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

  const handleTransfer = useCallback((id: string, title: string) => {
    setTransferTarget({ id, title });
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
        projectName={conv.projectId ? projectNameById.get(conv.projectId) : undefined}
        onSelect={handleSelectConversation}
        onStartEdit={startEditing}
        onEditTitleChange={setEditingTitle}
        onRename={handleRename}
        onCancelEdit={handleCancelEdit}
        onOpenCustomInstructions={onOpenCustomInstructions}
        onTogglePin={togglePinnedConversation}
        onShare={handleShare}
        onTransfer={handleTransfer}
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
      projectNameById,
      handleSelectConversation,
      startEditing,
      handleRename,
      handleCancelEdit,
      onOpenCustomInstructions,
      togglePinnedConversation,
      handleShare,
      handleTransfer,
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
            aria-label="Expand sidebar"
            className="text-[hsl(var(--muted-foreground))]"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleNewChat}
            variant="ghost"
            size="icon"
            aria-label="New chat"
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
            aria-label="Search conversations"
            className="text-[hsl(var(--muted-foreground))]"
          >
            <Search className="h-4 w-4" />
          </Button>
          {/* Mode dot — collapsed state shows only the colored dot */}
          <div
            title={mode === 'local' ? 'Local mode' : 'Cloud mode'}
            className={cn(
              'w-2 h-2 rounded-full',
              mode === 'local' ? 'bg-emerald-400' : 'bg-blue-400',
            )}
          />
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

      {/* Transfer Conversation Dialog */}
      {transferTarget && (
        <TransferDialog
          conversationId={transferTarget.id}
          conversationTitle={transferTarget.title}
          direction={mode === 'local' ? 'local_to_cloud' : 'cloud_to_local'}
          localDbId={transferTarget.localDbId}
          onClose={() => setTransferTarget(null)}
        />
      )}

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
                    className="flex-1 border-0 bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
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
          isIncognito && 'border-purple-500/30',
          className,
        )}
        style={{ width: width }}
      >
        {/* Incognito mode subtle top stripe */}
        {isIncognito && (
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-purple-500/60 to-transparent pointer-events-none z-10" />
        )}
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
            <div className="flex items-center gap-1.5">
              <IncognitoToggle
                isIncognito={isIncognito}
                onToggle={() => setIsIncognito((prev) => !prev)}
              />
              <Button
                onClick={handleNewChat}
                className={cn(
                  'flex items-center gap-2 transition-colors',
                  isIncognito
                    ? 'bg-purple-500/15 hover:bg-purple-500/25 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/30'
                    : 'bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]',
                )}
              >
                <Plus className="h-4 w-4" />
                New Chat
              </Button>
            </div>
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

        {/* Features section: 4 promoted direct links + More popover */}
        {!collapsed && !isSimpleMode && (
          <div className="px-2 py-1.5 border-b border-[hsl(var(--border))]">
            {[
              {
                id: 'research',
                label: 'Research',
                icon: FlaskConical,
                onClick: onOpenResearch,
                isActive: false,
              },
              // Terminal only shown in desktop mode
              ...(isTauri
                ? [
                    {
                      id: 'terminal',
                      label: 'Terminal',
                      icon: TerminalSquare,
                      onClick: () => setActiveView('terminal'),
                      isActive: activeView === 'terminal',
                    },
                  ]
                : []),
              {
                id: 'canvas',
                label: 'Canvas',
                icon: PenTool,
                onClick: onOpenCanvas,
                isActive: false,
              },
              // MCP Tools only shown in desktop mode (requires local MCP servers)
              ...(isTauri
                ? [
                    {
                      id: 'mcp-tools',
                      label: 'MCP Tools',
                      icon: Wrench,
                      onClick: onOpenMcpWorkspace,
                      isActive: false,
                    },
                  ]
                : []),
              {
                id: 'images',
                label: 'Images',
                icon: Image,
                onClick: () => setActiveView('images'),
                isActive: activeView === 'images',
              },
              {
                id: 'skills',
                label: 'Skills',
                icon: Sparkles,
                onClick: () => setActiveView('skills'),
                isActive: activeView === 'skills',
              },
              {
                id: 'schedules',
                label: 'Schedules',
                icon: Clock,
                onClick: () => setActiveView('schedules'),
                isActive: activeView === 'schedules',
              },
            ].map(({ id, label, icon: Icon, onClick, isActive }) => (
              <button
                key={id}
                type="button"
                onClick={onClick}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden',
                  isActive
                    ? 'bg-white/10 text-[hsl(var(--foreground))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-white/5 hover:text-[hsl(var(--foreground))]',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
            <SidebarFeaturesPopover
              activeView={activeView}
              artifactPanelOpen={artifactPanelOpen}
              canAccessMediaLab={canAccessMediaLab ?? false}
              onSetActiveView={setActiveView}
              onOpenResearch={onOpenResearch}
              onOpenRewind={onOpenRewind}
              onOpenCollaboration={onOpenCollaboration}
              onToggleMediaLab={onToggleMediaLab}
              onToggleArtifacts={onToggleArtifacts}
              onOpenMcpWorkspace={onOpenMcpWorkspace}
              onOpenMcpBundles={onOpenMcpBundles}
              open={featuresPopoverOpen}
              onOpenChange={setFeaturesPopoverOpen}
              triggerAsRow
            />
          </div>
        )}

        {/* Compact filter bar: project filter + archive toggle */}
        {!collapsed && !isSimpleMode && (
          <div className="px-3 py-2 flex items-center gap-1">
            {/* Project filter dropdown */}
            {projects.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors',
                      selectedProjectFilter
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'text-muted-foreground hover:bg-surface-hover',
                    )}
                  >
                    <span
                      className={cn(
                        'w-4 h-4 flex items-center justify-center rounded',
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
                      <FolderOpen className="w-3 h-3" />
                    </span>
                    <span className="truncate max-w-[100px]">{selectedProject?.name || 'All'}</span>
                    <ChevronDown className="w-3 h-3 text-[hsl(var(--muted-foreground))]" />
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

            {/* Clear project filter */}
            {selectedProjectFilter && (
              <Button
                onClick={() => setSelectedProjectFilter(null)}
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                title="Clear filter"
              >
                <X className="w-3 h-3" />
              </Button>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Archive toggle (icon button) */}
            {archivedConversations.length > 0 && (
              <Button
                onClick={() => setShowArchived(!showArchived)}
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7',
                  showArchived
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-[hsl(var(--muted-foreground))]',
                )}
                title={showArchived ? 'Show active' : `Archived (${archivedConversations.length})`}
              >
                <Archive className="w-3.5 h-3.5" />
              </Button>
            )}
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

        {/* Bottom bar: usage widget (when > 50%) + SimpleModeToggle + UserProfile + NotificationCenter */}
        <div className="mt-auto border-t border-[hsl(var(--border))] px-3 py-2.5 space-y-2">
          {/* Sidebar usage widget — only visible when budget is enabled and > 50% used */}
          {!collapsed && showUsageWidget && (
            <button
              type="button"
              onClick={() => openSettings('account')}
              title={`${Math.round(clampedBudgetPct)}% of token budget used — click to manage`}
              className="w-full group flex items-center gap-2 px-1 py-1 rounded-md hover:bg-white/5 transition-colors"
            >
              <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    clampedBudgetPct >= 95
                      ? 'bg-red-500'
                      : clampedBudgetPct >= 80
                        ? 'bg-amber-500'
                        : 'bg-blue-500',
                  )}
                  style={{ width: `${clampedBudgetPct}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
                {Math.round(clampedBudgetPct)}%
              </span>
            </button>
          )}
          <div className="flex items-center gap-1.5">
            {!collapsed && <SimpleModeToggle compact />}
            <div className="flex-1 min-w-0">
              <UserProfile collapsed={collapsed} />
            </div>
            {/* Mode toggle pill — expanded state (hidden in web mode, always cloud) */}
            {!collapsed && isTauri && (
              <button
                type="button"
                onClick={() => setMode(mode === 'local' ? 'cloud' : 'local')}
                title={mode === 'local' ? 'Switch to Cloud mode' : 'Switch to Local mode'}
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider shrink-0 transition-colors cursor-pointer',
                  mode === 'local'
                    ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                    : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
                )}
              >
                {mode === 'local' ? 'Local' : 'Cloud'}
              </button>
            )}
            {!collapsed && <NotificationCenter className="shrink-0" />}
          </div>
        </div>
      </div>
    </>
  );
}
