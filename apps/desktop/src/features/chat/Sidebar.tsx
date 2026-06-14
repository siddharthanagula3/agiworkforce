/**
 * Desktop Sidebar — wrapper around the shared @agiworkforce/ui <Sidebar>.
 *
 * This file owns all desktop-specific logic:
 *   - Store reads (chatStore / projectStore / billingUsageStore / appModeStore / simpleModeStore)
 *   - Desktop-only dialogs (ShareConversationDialog, AlertDialog for delete confirm)
 *   - Desktop footer chrome (UserProfile, SimpleModeToggle, mode pill)
 *   - Incognito toggle header slot
 *
 * Pure rendering is delegated to @agiworkforce/ui <Sidebar> — the same component
 * that the web surface mounts. Mapping: ConversationSummary → SidebarSession,
 * Project → SidebarProject.
 *
 * Trust-boundary affordances (TransferDialog, LocalByokHandoffDialog, export PDF/MD)
 * are preserved as dialog state + handlers here; they are desktop-only and will be
 * re-connected to a future shared sidebar extension point (e.g. a "More actions"
 * context menu) in a follow-up. They are NOT exposed through the shared component
 * so the web surface never sees them.
 *
 * SidebarFeaturesPopover is intentionally not re-mounted (removed from live sidebar —
 * features accessible via chat / Cmd+K, per comment at original Sidebar.tsx line 68).
 */
import type { ProjectAccentColor } from '@agiworkforce/types';
import {
  Sidebar as SharedSidebar,
  type SidebarSession,
  type SidebarProject,
} from '@agiworkforce/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  useChatStore,
  selectConversations,
  selectActiveConversationId,
  type ConversationSummary,
} from '../../stores/chat/chatStore';
import { useProjectStore, selectActiveProjects } from '../../stores/projectStore';
import { cloudAccountAuth } from '../../services/cloudAccountAuth';
import { resetInFlightChatState } from '../../lib/newChatReset';
import { UserProfile } from '@/features/layout/UserProfile';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { useSimpleModeStore, selectIsSimpleMode } from '../../stores/ui';
import { SimpleModeToggle } from '@/features/simple-mode';
import { ShareConversationDialog } from './ShareConversationDialog';
import { IncognitoToggle } from './IncognitoToggle';
import { isTauri } from '../../lib/tauri-mock';
import { useBillingUsageStore, selectBudgetPercentage } from '../../stores/billingUsage';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';
import { useAppModeStore, selectMode } from '../../stores/appModeStore';
import { openExternalUrl } from '../../utils/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/AlertDialog';

export interface SidebarProps {
  className?: string;
  onOpenCustomInstructions?: (conversationId: string) => void;
  onNewChat?: () => void | Promise<void>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobile?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  width?: number;
  onResize?: (width: number) => void;
  /** Unused legacy props — kept for backwards compat so AppLayout compiles. */
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

// ── Mapping helpers ──────────────────────────────────────────────────────────

function toSidebarSession(conv: ConversationSummary): SidebarSession {
  return {
    id: conv.id,
    title: conv.title || 'Untitled',
    updatedAt: conv.updatedAt,
    lastMessage: conv.lastMessage,
    pinned: conv.pinned,
    archived: conv.archived,
    projectId: conv.projectId,
    incognito: conv.incognito,
    hasCustomInstructions: Boolean(conv.customInstructions),
  };
}

function toSidebarProject(p: {
  id: string;
  name: string;
  color?: string;
  accentColor?: ProjectAccentColor | null;
  iconEmoji?: string | null;
  conversationIds?: string[];
}): SidebarProject {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    // ProjectAccentColor is a string-literal union — safe to widen to string
    accentColor: (p.accentColor as string | undefined) ?? undefined,
    iconEmoji: p.iconEmoji ?? undefined,
    conversationCount: p.conversationIds?.length,
  };
}

// ── Main component ───────────────────────────────────────────────────────────

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
  // Legacy props — accepted but not forwarded.
  onOpenResearch: _onOpenResearch,
  onOpenRewind: _onOpenRewind,
  onOpenCollaboration: _onOpenCollaboration,
  onToggleMediaLab: _onToggleMediaLab,
  canAccessMediaLab: _canAccessMediaLab,
  onToggleArtifacts: _onToggleArtifacts,
  artifactPanelOpen: _artifactPanelOpen = false,
  onOpenMcpWorkspace: _onOpenMcpWorkspace,
  onOpenMcpBundles: _onOpenMcpBundles,
  onOpenCanvas: _onOpenCanvas,
}: SidebarProps) {
  // ── Store reads ──────────────────────────────────────────────────────────
  const mode = useAppModeStore(selectMode);
  const setMode = useAppModeStore((s) => s.setMode);

  const budgetPct = useBillingUsageStore(selectBudgetPercentage);
  const budgetEnabled = useBillingUsageStore((s) => s.budget.enabled);
  const openSettings = useSettingsDialogStore((s) => s.openSettings);
  const clampedBudgetPct = Math.min(Math.max(budgetPct, 0), 100);
  const showUsageWidget = budgetEnabled && clampedBudgetPct > 50;

  const conversations = useChatStore(selectConversations);
  const activeConversationId = useChatStore(selectActiveConversationId);

  const isSimpleMode = useSimpleModeStore(selectIsSimpleMode);

  const selectConversationFn = useChatStore((state) => state.selectConversation);
  const renameConversation = useChatStore((state) => state.renameConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const togglePinnedConversation = useChatStore((state) => state.togglePinnedConversation);
  const archiveConversation = useChatStore((state) => state.archiveConversation);
  const restoreConversation = useChatStore((state) => state.restoreConversation);
  const createConversation = useChatStore((state) => state.createConversation);
  const setActiveView = useChatStore((state) => state.setActiveView);
  const ensureActiveConversation = useChatStore((state) => state.ensureActiveConversation);
  const messagesByConversation = useChatStore((state) => state.messagesByConversation);
  const loadConversationMessages = useChatStore((state) => state.loadConversationMessages);

  const projects = useProjectStore(useShallow(selectActiveProjects));
  const activeProjectId = useProjectStore((state) => state.activeProjectId);

  // ── Local UI state ───────────────────────────────────────────────────────
  const [isIncognito, setIsIncognito] = useState(false);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string | null>(null);

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

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    ensureActiveConversation();
  }, [ensureActiveConversation]);

  useEffect(() => {
    if (activeProjectId && !selectedProjectFilter) {
      setSelectedProjectFilter(activeProjectId);
    }
  }, [activeProjectId, selectedProjectFilter]);

  // ── Handlers ─────────────────────────────────────────────────────────────

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

  // Use a ref-style object so handleSelect doesn't close over a stale value
  // while still being stable across renders.
  const latestSelectedIdRef = useMemo(() => ({ current: null as string | null }), []);

  const handleSelect = useCallback(
    (id: string) => {
      latestSelectedIdRef.current = id;
      selectConversationFn(id);
      setActiveView('chat');
      if (isMobile && onCollapsedChange) {
        onCollapsedChange(true);
      }

      const cachedMessages = messagesByConversation[id];
      if (!cachedMessages || cachedMessages.length === 0) {
        const userId = cloudAccountAuth.getUser()?.id;
        if (userId) {
          loadConversationMessages(id, userId)
            .then(() => {
              // Discard result if user selected a different conversation while loading.
              if (latestSelectedIdRef.current !== id) return;
            })
            .catch((error) => {
              if (latestSelectedIdRef.current !== id) return;
              console.error('[Sidebar] Failed to load conversation messages:', error);
              toast.error('Failed to load conversation messages');
            });
        } else {
          console.warn('[Sidebar] Cannot load messages: user not authenticated');
          toast.error('Please sign in to load conversation messages');
        }
      }
    },
    [
      latestSelectedIdRef,
      selectConversationFn,
      setActiveView,
      isMobile,
      onCollapsedChange,
      messagesByConversation,
      loadConversationMessages,
    ],
  );

  const handleRename = useCallback(
    (id: string, title: string) => {
      if (!title.trim()) return;
      renameConversation(id, title);
    },
    [renameConversation],
  );

  const handleDelete = useCallback((id: string) => {
    const conv = useChatStore.getState().conversations.find((c) => c.id === id);
    const title = conv?.title || 'Untitled';
    setDeleteConfirmDialog({ open: true, conversationId: id, conversationTitle: title });
  }, []);

  const handleConfirmDelete = useCallback(() => {
    const { conversationId } = deleteConfirmDialog;
    setDeleteConfirmDialog((prev) => ({ ...prev, open: false }));
    if (conversationId) {
      deleteConversation(conversationId);
    }
  }, [deleteConfirmDialog, deleteConversation]);

  const handleTogglePin = useCallback(
    (id: string) => {
      togglePinnedConversation(id);
    },
    [togglePinnedConversation],
  );

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

  const handleShare = useCallback((id: string) => {
    const conv = useChatStore.getState().conversations.find((c) => c.id === id);
    const title = conv?.title || 'Untitled';
    setShareDialog({ open: true, conversationId: id, conversationTitle: title });
  }, []);

  const handleOpenProjects = useCallback(() => {
    setActiveView('projects');
  }, [setActiveView]);

  const handleOpenSkills = useCallback(() => {
    setActiveView('skills');
  }, [setActiveView]);

  const handleModeClick = useCallback(() => {
    if (mode === 'local') {
      void openExternalUrl('https://agiworkforce.com/waitlist');
    } else {
      setMode('local');
    }
  }, [mode, setMode]);

  const handleOpenUsage = useCallback(() => {
    openSettings('account');
  }, [openSettings]);

  // ── Data mapping ─────────────────────────────────────────────────────────
  const sessions = useMemo<SidebarSession[]>(
    () => conversations.map(toSidebarSession),
    [conversations],
  );

  const sidebarProjects = useMemo<SidebarProject[]>(
    () => projects.map(toSidebarProject),
    [projects],
  );

  // ── Footer slot (desktop-only chrome) ────────────────────────────────────
  const footerSlot = (
    <div className="flex items-center gap-1.5 overflow-hidden w-full">
      {!collapsed && <SimpleModeToggle compact />}
      <div className="flex-1 min-w-0 overflow-hidden">
        <UserProfile collapsed={collapsed} />
      </div>
    </div>
  );

  // ── Header slot (incognito toggle) ────────────────────────────────────────
  const headerSlot = (
    <IncognitoToggle isIncognito={isIncognito} onToggle={() => setIsIncognito((prev) => !prev)} />
  );

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

      {/* Resize handle — rendered outside SharedSidebar so it can overlap the border */}
      {onResize && !collapsed && (
        <div className="relative" style={{ width: 0, height: '100%' }}>
          <ResizeHandle
            width={width}
            onResize={onResize}
            direction="right"
            minWidth={200}
            maxWidth={400}
          />
        </div>
      )}

      {/* The shared pure-presentation sidebar */}
      <SharedSidebar
        className={cn(isIncognito && 'border-purple-500/30', className)}
        sessions={sessions}
        activeSessionId={activeConversationId ?? undefined}
        projects={sidebarProjects}
        selectedProjectFilter={selectedProjectFilter}
        collapsed={collapsed}
        width={width}
        isMobile={isMobile}
        isSimpleMode={isSimpleMode}
        mode={mode === 'local' ? 'local' : 'cloud'}
        budgetPercent={clampedBudgetPct}
        showUsageWidget={showUsageWidget}
        // handlers
        onNewChat={handleNewChat}
        onToggleCollapse={onToggleCollapse}
        onSelectProjectFilter={setSelectedProjectFilter}
        onOpenProjects={handleOpenProjects}
        onOpenSkills={handleOpenSkills}
        onModeClick={isTauri ? handleModeClick : undefined}
        onOpenUsage={handleOpenUsage}
        // per-session handlers
        onSelect={handleSelect}
        onRename={handleRename}
        onDelete={handleDelete}
        onTogglePin={handleTogglePin}
        onArchive={handleArchive}
        onRestore={handleRestore}
        onShare={handleShare}
        onOpenCustomInstructions={onOpenCustomInstructions}
        // slots
        headerSlot={headerSlot}
        footerSlot={footerSlot}
        navItems={isSimpleMode ? [] : undefined}
      />
    </>
  );
}
