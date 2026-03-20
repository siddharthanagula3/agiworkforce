import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../../lib/utils';
import { useUnifiedChatStore, uuidToDbId } from '../../stores/unifiedChatStore';
import { useBillingStore } from '../../stores/auth';
import { useArtifactStore } from '../../stores/artifactStore';
import { resetInFlightChatState } from '../../lib/newChatReset';
import { CustomInstructionsDialog } from '../CustomInstructions';
import { FeedbackDialog } from '../Feedback';
import { ArtifactPanel } from '../Artifacts/ArtifactPanel';
import { ResizeHandle } from '../ui/ResizeHandle';
import { DynamicSidecar } from './DynamicSidecar';
import { KeyboardShortcutsOverlay } from './KeyboardShortcutsOverlay';
import { Sidebar } from './Sidebar';
import { MemoryPanel } from '../MemoryPanel';
import { AgentTaskPanel } from '../AGI/AgentTaskPanel';
import { CanvasContainer } from '../Canvas/CanvasContainer';
import { McpAppGallery } from '../MCP/McpAppGallery';
import { ResearchPanel } from '../Research/ResearchPanel';
import RewindTimeline from './RewindTimeline';
import { toast } from 'sonner';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';
import MCPWorkspace from '../MCP/MCPWorkspace';
import { MCPBundleBrowser } from '../MCP/MCPBundleBrowser';

// Lazy load MediaLab for code splitting
const MediaLab = lazy(() => import('./MediaLab').then((m) => ({ default: m.MediaLab })));

interface AppLayoutProps {
  children: React.ReactNode;
}

const ARTIFACT_PANEL_DEFAULT_WIDTH = 400;
const ARTIFACT_PANEL_MIN_WIDTH = 280;
const ARTIFACT_PANEL_MAX_WIDTH = 900;

export function AppLayout({ children }: AppLayoutProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const shortcutsDialogOpen = useSettingsDialogStore((s) => s.shortcutsOpen);
  const setShortcutsDialogOpen = useCallback((open: boolean) => {
    if (open) useSettingsDialogStore.getState().openShortcuts();
    else useSettingsDialogStore.getState().closeShortcuts();
  }, []);
  const [customInstructionsOpen, setCustomInstructionsOpen] = useState(false);
  const [customInstructionsConversationId, setCustomInstructionsConversationId] = useState<
    string | undefined
  >(undefined);
  const closeArtifactPanel = useArtifactStore((state) => state.closePanel);
  const openArtifactPanel = useArtifactStore((state) => state.openPanel);
  const artifactPanelOpen = useArtifactStore((state) => state.panelOpen);
  // Derived from artifactStore.panelOpen — the canonical source of truth.
  const isArtifactPanelOpen = artifactPanelOpen;
  const setIsArtifactPanelOpen = useCallback(
    (open: boolean) => {
      if (open) openArtifactPanel();
      else closeArtifactPanel();
    },
    [openArtifactPanel, closeArtifactPanel],
  );
  const [artifactPanelWidthState, setArtifactPanelWidthState] = useState(
    ARTIFACT_PANEL_DEFAULT_WIDTH,
  );
  const [isMediaLabOpen, setIsMediaLabOpen] = useState(false);
  // Unified right panel: only one can be open at a time (besides artifacts)
  type RightPanel =
    | 'memory'
    | 'tasks'
    | 'canvas'
    | 'mcp-apps'
    | 'research'
    | 'rewind'
    | 'mcp-workspace'
    | 'mcp-bundles'
    | null;
  const [activeRightPanel, setActiveRightPanel] = useState<RightPanel>(null);
  const RIGHT_PANEL_WIDTH = 420;

  const planName = useBillingStore(
    (state) => state.subscription?.plan_name?.toLowerCase() ?? 'free',
  );
  const canAccessMediaLab = useMemo(
    () => ['pro', 'max', 'enterprise'].some((tier) => planName.includes(tier)),
    [planName],
  );

  const handleOpenCustomInstructions = useCallback((conversationId: string) => {
    setCustomInstructionsConversationId(conversationId);
    setCustomInstructionsOpen(true);
  }, []);

  // Use useShallow to prevent re-renders from object reference changes
  const sidecarState = useUnifiedChatStore(useShallow((state) => state.sidecar));
  const sidecarWidth = useUnifiedChatStore((state) => state.sidecarWidth);
  const setSidecarWidth = useUnifiedChatStore((state) => state.setSidecarWidth);
  const closeSidecar = useUnifiedChatStore((state) => state.closeSidecar);
  const sidebarWidth = useUnifiedChatStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUnifiedChatStore((state) => state.setSidebarWidth);
  const sidebarCollapsed = useUnifiedChatStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUnifiedChatStore((state) => state.setSidebarCollapsed);
  const sidecarOpen = sidecarState.isOpen;

  const openRightPanel = useCallback(
    (panel: NonNullable<RightPanel>) => {
      setActiveRightPanel(panel);
      setIsArtifactPanelOpen(false);
      closeSidecar();
    },
    [setIsArtifactPanelOpen, closeSidecar],
  );

  const [isResizing, setIsResizing] = useState(false);

  const messages = useUnifiedChatStore((state) => state.messages);
  const isStreaming = useUnifiedChatStore((state) => state.isStreaming);
  const activeConversationId = useUnifiedChatStore((state) => state.activeConversationId);
  const createConversation = useUnifiedChatStore((state) => state.createConversation);
  const activeConversationDbId = useMemo(
    () => (activeConversationId ? uuidToDbId(activeConversationId) : undefined),
    [activeConversationId],
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wasRightPanelVisibleRef = useRef(false);

  const handleNewChat = useCallback(async () => {
    setIsArtifactPanelOpen(false);
    await resetInFlightChatState();
    createConversation('New chat');
  }, [setIsArtifactPanelOpen, createConversation]);

  const handleToggleMediaLab = useCallback(() => {
    if (!canAccessMediaLab) {
      toast.error('Media Lab requires Pro, Max, or Enterprise.');
      return;
    }

    setIsMediaLabOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsArtifactPanelOpen(false);
        closeSidecar();
      }
      return next;
    });
  }, [canAccessMediaLab, closeSidecar, setIsArtifactPanelOpen]);

  useEffect(() => {
    if (!canAccessMediaLab && isMediaLabOpen) {
      setIsMediaLabOpen(false);
    }
  }, [canAccessMediaLab, isMediaLabOpen]);

  useEffect(() => {
    const isRightPanelVisible = sidecarOpen || isArtifactPanelOpen || activeRightPanel !== null;
    const justOpenedRightPanel = isRightPanelVisible && !wasRightPanelVisibleRef.current;

    if (justOpenedRightPanel && !sidebarCollapsed) {
      setSidebarCollapsed(true);
    }

    wasRightPanelVisibleRef.current = isRightPanelVisible;
  }, [activeRightPanel, isArtifactPanelOpen, setSidebarCollapsed, sidebarCollapsed, sidecarOpen]);

  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const lastContentLengthRef = useRef(0);
  const artifactPanelWidth = isArtifactPanelOpen ? artifactPanelWidthState : 0;
  const unifiedRightPanelWidth = activeRightPanel ? RIGHT_PANEL_WIDTH : 0;
  const rightPanelOffset =
    (sidecarOpen ? sidecarWidth : 0) + artifactPanelWidth + unifiedRightPanelWidth;

  const lastMessage = messages[messages.length - 1];
  const lastMessageContent = lastMessage?.content || '';

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setUserScrolledUp(!isNearBottom);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setUserScrolledUp(false);
    }
  }, [messages.length]);

  useEffect(() => {
    if (userScrolledUp) return;

    const shouldScroll =
      messages.length > 0 ||
      isStreaming ||
      lastMessageContent.length > lastContentLengthRef.current;

    if (shouldScroll) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }

    lastContentLengthRef.current = lastMessageContent.length;
  }, [messages.length, isStreaming, lastMessageContent, userScrolledUp]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      if (isMeta && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setSidebarCollapsed(!sidebarCollapsed);
      }

      if (isMeta && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleNewChat();
      }

      if (isMeta && e.key === '/') {
        e.preventDefault();
        setShortcutsDialogOpen(!shortcutsDialogOpen);
      }

      if (isMeta && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        useUnifiedChatStore.getState().toggleMessageTimestamps();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleNewChat,
    setSidebarCollapsed,
    sidebarCollapsed,
    setShortcutsDialogOpen,
    shortcutsDialogOpen,
  ]);

  return (
    <div
      className="relative flex h-full w-full overflow-hidden bg-[hsl(var(--background))] font-sans text-[hsl(var(--foreground))] antialiased"
      style={{ '--agi-right-panel-offset': `${rightPanelOffset}px` } as React.CSSProperties}
    >
      {}
      {messages.length === 0 && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-terra-cotta-500/5" />
        </div>
      )}

      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onNewChat={handleNewChat}
        onOpenCustomInstructions={handleOpenCustomInstructions}
        onToggleMediaLab={handleToggleMediaLab}
        onOpenResearch={() => openRightPanel('research')}
        onOpenRewind={() => openRightPanel('rewind')}
        canAccessMediaLab={canAccessMediaLab}
        width={sidebarCollapsed ? 64 : sidebarWidth}
        onResize={setSidebarWidth}
        onToggleArtifacts={() => setIsArtifactPanelOpen(!isArtifactPanelOpen)}
        artifactPanelOpen={isArtifactPanelOpen}
        onOpenMcpWorkspace={() => openRightPanel('mcp-workspace')}
        onOpenMcpBundles={() => openRightPanel('mcp-bundles')}
        onOpenCanvas={() => openRightPanel('canvas')}
      />

      {}
      <main
        className={cn(
          'flex flex-1 min-h-0 flex-col overflow-hidden ease-in-out',
          !isResizing && 'transition-all duration-300',
        )}
        style={{ marginRight: rightPanelOffset }}
      >
        {}
        <div className="relative flex h-full flex-col">
          {}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pb-40 scroll-smooth">
            <div className="mx-auto w-full max-w-5xl px-4 py-6">
              {children}
              {}
              <div ref={messagesEndRef} className="h-px" />
            </div>
          </div>
        </div>
      </main>

      {}
      {sidecarOpen && (
        <div
          className={cn(
            'bg-white dark:bg-[#0b0c14] border-l border-gray-200 dark:border-white/10 shadow-2xl z-20 flex flex-col ease-in-out',
            !isResizing && 'transition-[width] duration-300',
          )}
          style={{ width: sidecarWidth, position: 'absolute', top: 0, right: 0, bottom: 0 }}
        >
          <ResizeHandle
            width={sidecarWidth}
            onResize={setSidecarWidth}
            isResizing={setIsResizing}
            direction="left"
            minWidth={300}
            maxWidth={1000}
            className="z-50"
          />
          <DynamicSidecar
            panelType={sidecarState.activeMode}
            payload={sidecarState.context as Record<string, unknown> | undefined}
            contextId={sidecarState.contextId}
            onClose={() => useUnifiedChatStore.getState().closeSidecar()}
          />
        </div>
      )}

      {/* Dialogs */}
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <KeyboardShortcutsOverlay
        open={shortcutsDialogOpen}
        onClose={() => setShortcutsDialogOpen(false)}
        onOpenSettings={() => useSettingsDialogStore.getState().openSettings('keybindings')}
      />
      <CustomInstructionsDialog
        open={customInstructionsOpen}
        onOpenChange={setCustomInstructionsOpen}
        conversationId={customInstructionsConversationId}
      />

      {/* Artifact Panel */}
      {isArtifactPanelOpen && (
        <div
          className={cn(
            'bg-white dark:bg-[#0b0c14] border-l border-gray-200 dark:border-white/10 shadow-2xl z-30 flex flex-col ease-in-out',
            !isResizing && 'transition-[width] duration-300',
          )}
          style={{
            width: artifactPanelWidthState,
            position: 'absolute',
            top: 0,
            right: sidecarOpen ? sidecarWidth : 0,
            bottom: 0,
          }}
        >
          <ResizeHandle
            direction="left"
            width={artifactPanelWidthState}
            minWidth={ARTIFACT_PANEL_MIN_WIDTH}
            maxWidth={ARTIFACT_PANEL_MAX_WIDTH}
            onResize={setArtifactPanelWidthState}
            isResizing={setIsResizing}
          />
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            }
          >
            <ArtifactPanel
              conversationId={activeConversationDbId}
              onClose={() => setIsArtifactPanelOpen(false)}
            />
          </Suspense>
        </div>
      )}

      {/* Unified Right Panel (Memory, Tasks, Canvas, MCP Apps, Research) */}
      {activeRightPanel && (
        <div
          className={cn(
            'bg-white dark:bg-[#0b0c14] border-l border-gray-200 dark:border-white/10 shadow-2xl z-20 flex flex-col ease-in-out',
            !isResizing && 'transition-[width] duration-300',
          )}
          style={{
            width: RIGHT_PANEL_WIDTH,
            position: 'absolute',
            top: 0,
            right: (sidecarOpen ? sidecarWidth : 0) + artifactPanelWidth,
            bottom: 0,
          }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 shrink-0">
            <h2 className="text-sm font-semibold text-white capitalize">
              {activeRightPanel === 'mcp-apps'
                ? 'MCP Apps'
                : activeRightPanel === 'research'
                  ? 'Deep Research'
                  : activeRightPanel === 'rewind'
                    ? 'Rewind Timeline'
                    : activeRightPanel === 'mcp-workspace'
                      ? 'MCP Workspace'
                      : activeRightPanel === 'mcp-bundles'
                        ? 'Tool Registry'
                        : activeRightPanel}
            </h2>
            <button
              type="button"
              onClick={() => setActiveRightPanel(null)}
              aria-label="Close panel"
              className="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            {activeRightPanel === 'memory' && (
              <MemoryPanel isOpen onClose={() => setActiveRightPanel(null)} embedded />
            )}
            {activeRightPanel === 'tasks' && <AgentTaskPanel />}
            {activeRightPanel === 'canvas' && (
              <CanvasContainer onClose={() => setActiveRightPanel(null)} />
            )}
            {activeRightPanel === 'mcp-apps' && (
              <McpAppGallery onClose={() => setActiveRightPanel(null)} />
            )}
            {activeRightPanel === 'research' && <ResearchPanel className="h-full" />}
            {activeRightPanel === 'rewind' && <RewindTimeline />}
            {activeRightPanel === 'mcp-workspace' && <MCPWorkspace />}
            {activeRightPanel === 'mcp-bundles' && <MCPBundleBrowser />}
          </div>
        </div>
      )}

      {/* MediaLab Panel */}
      {isMediaLabOpen && (
        <div className="absolute inset-0 z-40 flex flex-col bg-[#090b15]">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            }
          >
            <MediaLab onClose={() => setIsMediaLabOpen(false)} />
          </Suspense>
        </div>
      )}

      {}
    </div>
  );
}

export default AppLayout;
