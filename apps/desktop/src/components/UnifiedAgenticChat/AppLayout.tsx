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
import { CommandPalette } from './CommandPalette';
import { DynamicSidecar } from './DynamicSidecar';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { Sidebar } from './Sidebar';
import { MemoryPanel } from '../MemoryPanel';
import { AgentTaskPanel } from '../AGI/AgentTaskPanel';
import { CanvasContainer } from '../Canvas/CanvasContainer';
import { McpAppGallery } from '../MCP/McpAppGallery';
import { ResearchPanel } from '../Research/ResearchPanel';
import { toast } from 'sonner';

// Lazy load MediaLab for code splitting
const MediaLab = lazy(() => import('./MediaLab').then((m) => ({ default: m.MediaLab })));

interface AppLayoutProps {
  children: React.ReactNode;
  onOpenSettings?: () => void;
}

const ARTIFACT_PANEL_WIDTH = 400;

export function AppLayout({ children, onOpenSettings }: AppLayoutProps) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);
  const [customInstructionsOpen, setCustomInstructionsOpen] = useState(false);
  const [customInstructionsConversationId, setCustomInstructionsConversationId] = useState<
    string | undefined
  >(undefined);
  const [isArtifactPanelOpen, setIsArtifactPanelOpen] = useState(false);
  const [isMediaLabOpen, setIsMediaLabOpen] = useState(false);
  const [isMemoryPanelOpen, setIsMemoryPanelOpen] = useState(false);
  const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(false);
  const [isCanvasPanelOpen, setIsCanvasPanelOpen] = useState(false);
  const [isMcpAppsPanelOpen, setIsMcpAppsPanelOpen] = useState(false);
  const [isResearchPanelOpen, setIsResearchPanelOpen] = useState(false);
  const openArtifactPanel = useArtifactStore((state) => state.openPanel);
  const closeArtifactPanel = useArtifactStore((state) => state.closePanel);
  const subscription = useBillingStore((state) => state.subscription);
  const planName = subscription?.plan_name?.toLowerCase() ?? 'free';
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
    closeArtifactPanel();
    setIsArtifactPanelOpen(false);
    await resetInFlightChatState();
    createConversation('New chat');
  }, [closeArtifactPanel, createConversation]);

  const handleToggleArtifactPanel = useCallback(() => {
    setIsArtifactPanelOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsMediaLabOpen(false);
        closeSidecar();
        openArtifactPanel();
      } else {
        closeArtifactPanel();
      }
      return next;
    });
  }, [closeArtifactPanel, closeSidecar, openArtifactPanel]);

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
  }, [canAccessMediaLab, closeSidecar]);

  useEffect(() => {
    if (!canAccessMediaLab && isMediaLabOpen) {
      setIsMediaLabOpen(false);
    }
  }, [canAccessMediaLab, isMediaLabOpen]);

  useEffect(() => {
    const isRightPanelVisible = sidecarOpen || isArtifactPanelOpen;
    const justOpenedRightPanel = isRightPanelVisible && !wasRightPanelVisibleRef.current;

    if (justOpenedRightPanel && !sidebarCollapsed) {
      setSidebarCollapsed(true);
    }

    wasRightPanelVisibleRef.current = isRightPanelVisible;
  }, [isArtifactPanelOpen, setSidebarCollapsed, sidebarCollapsed, sidecarOpen]);

  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const lastContentLengthRef = useRef(0);
  const artifactPanelWidth = isArtifactPanelOpen ? ARTIFACT_PANEL_WIDTH : 0;
  const rightPanelOffset = (sidecarOpen ? sidecarWidth : 0) + artifactPanelWidth;

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

      if (isMeta && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }

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
        setShortcutsDialogOpen((prev) => !prev);
      }

      if (isMeta && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        useUnifiedChatStore.getState().toggleMessageTimestamps();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewChat, setCommandPaletteOpen, setSidebarCollapsed, sidebarCollapsed]);

  return (
    <div
      className="relative flex h-full w-full overflow-hidden bg-cream-50 dark:bg-charcoal-900 font-sans text-gray-900 dark:text-gray-100 antialiased"
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
        onOpenSettings={onOpenSettings}
        onOpenFeedback={() => setFeedbackOpen(true)}
        onOpenCustomInstructions={handleOpenCustomInstructions}
        onToggleArtifactPanel={handleToggleArtifactPanel}
        onToggleMediaLab={handleToggleMediaLab}
        onOpenMemory={() => setIsMemoryPanelOpen(true)}
        onOpenTasks={() => setIsTaskPanelOpen(true)}
        onOpenCanvas={() => setIsCanvasPanelOpen(true)}
        onOpenResearch={() => setIsResearchPanelOpen(true)}
        onOpenMcpApps={() => setIsMcpAppsPanelOpen(true)}
        canAccessMediaLab={canAccessMediaLab}
        width={sidebarCollapsed ? 64 : sidebarWidth}
        onResize={setSidebarWidth}
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
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <KeyboardShortcutsDialog
        isOpen={shortcutsDialogOpen}
        onClose={() => setShortcutsDialogOpen(false)}
      />
      <CustomInstructionsDialog
        open={customInstructionsOpen}
        onOpenChange={setCustomInstructionsOpen}
        conversationId={customInstructionsConversationId}
      />

      {/* Memory Panel */}
      <MemoryPanel isOpen={isMemoryPanelOpen} onClose={() => setIsMemoryPanelOpen(false)} />

      {/* Artifact Panel */}
      {isArtifactPanelOpen && (
        <div
          className={cn(
            'bg-white dark:bg-[#0b0c14] border-l border-gray-200 dark:border-white/10 shadow-2xl z-20 flex flex-col ease-in-out',
            !isResizing && 'transition-[width] duration-300',
          )}
          style={{
            width: ARTIFACT_PANEL_WIDTH,
            position: 'absolute',
            top: 0,
            right: sidecarOpen ? sidecarWidth : 0,
            bottom: 0,
          }}
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            }
          >
            <ArtifactPanel
              conversationId={activeConversationDbId}
              onClose={() => {
                closeArtifactPanel();
                setIsArtifactPanelOpen(false);
              }}
            />
          </Suspense>
        </div>
      )}

      {/* Memory Panel */}
      <MemoryPanel isOpen={isMemoryPanelOpen} onClose={() => setIsMemoryPanelOpen(false)} />

      {/* Agent Task Panel */}
      {isTaskPanelOpen && (
        <div
          className="fixed inset-y-0 right-0 z-30 w-[400px] border-l border-white/10 bg-[#0b0c14] shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Agent Tasks</h2>
            <button
              type="button"
              onClick={() => setIsTaskPanelOpen(false)}
              className="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <AgentTaskPanel />
        </div>
      )}

      {/* Canvas / Code Execution Workspace */}
      {isCanvasPanelOpen && (
        <CanvasContainer
          onClose={() => setIsCanvasPanelOpen(false)}
        />
      )}

      {/* MCP Apps Panel */}
      {isMcpAppsPanelOpen && (
        <div className="fixed inset-y-0 right-0 z-30 w-[420px] border-l border-white/10 bg-zinc-950 shadow-2xl flex flex-col">
          <McpAppGallery onClose={() => setIsMcpAppsPanelOpen(false)} />
        </div>
      )}

      {/* Deep Research Panel */}
      {isResearchPanelOpen && (
        <div className="fixed inset-y-0 right-0 z-30 w-[480px] border-l border-white/10 bg-[#0b0c14] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/20">
                <svg className="h-3.5 w-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </span>
              <h2 className="text-sm font-semibold text-white">Deep Research</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsResearchPanelOpen(false)}
              className="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Close research panel"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ResearchPanel className="h-full" />
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
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-linear-to-t from-cream-50 via-cream-50/80 to-transparent dark:from-charcoal-900 dark:via-charcoal-900/80 pointer-events-none z-10" />
    </div>
  );
}

export default AppLayout;
