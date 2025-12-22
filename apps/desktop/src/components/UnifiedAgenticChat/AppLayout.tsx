import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { FeedbackDialog } from '../feedback';
import { ResizeHandle } from '../ui/ResizeHandle';
import { CommandPalette } from './CommandPalette';
import { DynamicSidecar } from './DynamicSidecar';
import { Sidebar } from './Sidebar';
// import { SidecarPanel } from './SidecarPanel';

interface AppLayoutProps {
  children: React.ReactNode;
  onOpenSettings?: () => void;
  onOpenWorkspace?: () => void;
  onOpenMediaLab?: () => void;
}

export function AppLayout({
  children,
  onOpenSettings,
  onOpenWorkspace,
  onOpenMediaLab,
}: AppLayoutProps) {
  // const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Moved to store
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const sidecarState = useUnifiedChatStore((state) => state.sidecar);
  const sidecarWidth = useUnifiedChatStore((state) => state.sidecarWidth);
  const setSidecarWidth = useUnifiedChatStore((state) => state.setSidecarWidth);
  const sidebarWidth = useUnifiedChatStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUnifiedChatStore((state) => state.setSidebarWidth);
  const sidebarCollapsed = useUnifiedChatStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUnifiedChatStore((state) => state.setSidebarCollapsed);

  const [isResizing, setIsResizing] = useState(false);

  const messages = useUnifiedChatStore((state) => state.messages);
  const isStreaming = useUnifiedChatStore((state) => state.isStreaming);
  const createConversation = useUnifiedChatStore((state) => state.createConversation);

  // Ref for auto-scrolling
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Handle New Chat Action
  const handleNewChat = useCallback(() => {
    createConversation('New chat');
  }, [createConversation]);

  // Track whether user has scrolled up (to pause auto-scroll)
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const lastContentLengthRef = useRef(0);

  // Get the last message content for streaming detection
  const lastMessage = messages[messages.length - 1];
  const lastMessageContent = lastMessage?.content || '';

  // Detect user scroll to pause auto-scroll when they scroll up
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

  // Reset user scroll when sending a new message
  useEffect(() => {
    if (messages.length > 0) {
      setUserScrolledUp(false);
    }
  }, [messages.length]);

  // Auto-scroll to bottom when new messages arrive or during streaming
  useEffect(() => {
    // Skip auto-scroll if user has scrolled up manually
    if (userScrolledUp) return;

    const shouldScroll =
      messages.length > 0 ||
      isStreaming ||
      lastMessageContent.length > lastContentLengthRef.current;

    if (shouldScroll) {
      // Use requestAnimationFrame for smooth scrolling
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }

    lastContentLengthRef.current = lastMessageContent.length;
  }, [messages.length, isStreaming, lastMessageContent, userScrolledUp]);

  // Global Shortcuts (Cmd+K, Cmd+Shift+O, Cmd+Shift+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Cmd+K: Toggle Command Palette
      if (isMeta && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }

      // Cmd+Shift+S: Toggle Sidebar
      if (isMeta && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setSidebarCollapsed(!sidebarCollapsed);
      }

      // Cmd+Shift+O: New Chat
      if (isMeta && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleNewChat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewChat, setCommandPaletteOpen, setSidebarCollapsed, sidebarCollapsed]);

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-cream-50 dark:bg-charcoal-900 font-sans text-gray-900 dark:text-gray-100 antialiased">
      {/* Background gradient for empty state */}
      {messages.length === 0 && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-terra-cotta-500/5" />
        </div>
      )}

      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onOpenSettings={onOpenSettings}
        onOpenFeedback={() => setFeedbackOpen(true)}
        onOpenWorkspace={onOpenWorkspace}
        onOpenMediaLab={onOpenMediaLab}
        width={sidebarCollapsed ? 64 : sidebarWidth}
        onResize={setSidebarWidth}
      />

      {/* Main Content Area */}
      <main
        className={cn(
          'flex flex-1 min-h-0 flex-col overflow-hidden ease-in-out',
          !isResizing && 'transition-all duration-300',
        )}
        style={{ marginRight: sidecarState.isOpen ? sidecarWidth : 0 }}
      >
        {/* Content Container */}
        <div className="relative flex h-full flex-col">
          {/* Message Area */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pb-32 scroll-smooth">
            <div className="mx-auto w-full max-w-5xl px-4 py-6">
              {children}
              {/* Scroll anchor for auto-scroll */}
              <div ref={messagesEndRef} className="h-px" />
            </div>
          </div>
        </div>
      </main>

      {/* Sidecar Panel - Absolute position to sit within the layout container (below titlebar) */}
      {sidecarState.isOpen && (
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
            payload={sidecarState.context}
            onClose={() => useUnifiedChatStore.getState().closeSidecar()}
          />
        </div>
      )}

      {/* Feedback Dialog */}
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      {/* Command Palette (Cmd+K) */}
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />

      {/* Gradient Overlay for depth at bottom */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-cream-50 via-cream-50/80 to-transparent dark:from-charcoal-900 dark:via-charcoal-900/80 pointer-events-none z-10" />
    </div>
  );
}

export default AppLayout;
