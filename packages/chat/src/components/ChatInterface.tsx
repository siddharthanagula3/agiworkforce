import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import type { ChatRuntime } from '../lib/runtime';
import type { ChatMessage } from '../lib/types';
import type { ChipType } from './QuickChips';
import { Sidebar } from './Sidebar';
import { EmptyState } from './EmptyState';
import { ChatInput } from './ChatInput';
import { QuickChips } from './QuickChips';
import { Disclaimer } from './Disclaimer';
import { MessageList } from './MessageList';
import { ConversationHeader } from './ConversationHeader';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import { useChat } from '../hooks/useChat';
import { useTheme } from '../hooks/useTheme';
import { useKeyboard } from '../hooks/useKeyboard';
import { useArtifact } from '../hooks/useArtifact';
import { SettingsModal } from './SettingsModal';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// ErrorBoundary — catches render errors in the chat content area
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ChatErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console in development; in production this would go to an error service
    if (process.env['NODE_ENV'] !== 'production') {
      console.error('[ChatInterface] render error:', error, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-medium text-[var(--chat-text-primary)]">
            Something went wrong in the chat.
          </p>
          <p className="text-xs text-[var(--chat-text-muted)]">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="rounded-lg px-3 py-1.5 text-xs bg-[var(--chat-surface-hover)] hover:bg-[var(--chat-accent-primary)]/10 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Runtime context — lets deeply nested components access the runtime without prop drilling
const RuntimeContext = createContext<ChatRuntime | null>(null);

export function useRuntime(): ChatRuntime | null {
  return useContext(RuntimeContext);
}

export interface ChatInterfaceProps {
  runtime: ChatRuntime | null;
  className?: string;
  /**
   * When true the chat package manages theme on document.documentElement.
   * Default false — host app is expected to set data-theme-managed on <html>
   * or manage theme itself.
   */
  manageTheme?: boolean;
  /**
   * When false global keyboard shortcuts (Cmd+K, Cmd+,, Cmd+[) are not registered.
   * Default true.
   */
  enableShortcuts?: boolean;
  /** Called when the user clicks the "+" attachment button */
  onPlusClick?: () => void;
  /** Called when the user clicks the model selector */
  onModelSelectorClick?: () => void;
  /** Called when the user clicks the voice/mic button */
  onVoiceClick?: () => void;
  /** Called when the user navigates to a sidebar view (customize, projects, skills, connectors) */
  onNavigateView?: (view: string) => void;
}

export function ChatInterface({
  runtime,
  className,
  manageTheme = false,
  enableShortcuts = true,
  onPlusClick: onPlusClickProp,
  onModelSelectorClick: onModelSelectorClickProp,
  onVoiceClick: onVoiceClickProp,
  onNavigateView,
}: ChatInterfaceProps) {
  // Side-effect hooks — theme management is opt-in; shortcuts are opt-out
  useTheme();
  useKeyboard({ enabled: enableShortcuts });

  // Signal to useTheme that the host app manages the theme when manageTheme is false
  // We do this by setting/removing the sentinel attribute on mount.
  // Using a layout effect would flash; instead we rely on the attribute being set
  // BEFORE the component mounts by the host app (the preferred contract), with this
  // block acting as a safety net that keeps things consistent across re-renders.
  if (typeof document !== 'undefined') {
    if (!manageTheme) {
      document.documentElement.setAttribute('data-theme-managed', '');
    } else {
      document.documentElement.removeAttribute('data-theme-managed');
    }
  }

  // Chat logic
  const { sendMessage, stopGeneration } = useChat(runtime);

  // Artifact panel state (single source — must not be called in child components separately)
  const { isOpen: artifactOpen, panelWidth: artifactPanelWidth } = useArtifact();

  // Store state
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  // FIX: Stable empty array reference to prevent React 19 useSyncExternalStore
  // infinite loop — [] !== [] on consecutive getSnapshot calls.
  const emptyMessages = useRef<ChatMessage[]>([]).current;
  const messages = useChatStore((s) =>
    currentConversationId ? (s.messages[currentConversationId] ?? emptyMessages) : emptyMessages,
  );
  const activeView = useUIStore((s) => s.activeView);

  const hasMessages = messages.length > 0;

  // Determine disclaimer variant based on the most recent assistant message
  const disclaimerVariant = useMemo((): 'default' | 'citations' | 'code' => {
    if (!hasMessages) return 'default';
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant?.citations?.length) return 'citations';
    return 'default';
  }, [messages, hasMessages]);

  // Handlers — all stable via useCallback
  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content);
    },
    [sendMessage],
  );

  const setDraftContent = useChatStore((s) => s.setDraftContent);
  const setActiveView = useUIStore((s) => s.setActiveView);

  const handleChipClick = useCallback(
    (chip: ChipType) => {
      const prompts: Record<ChipType, string> = {
        code: 'Help me write code for ',
        write: 'Help me write ',
        research: 'Research this topic in depth: ',
        skills: '',
        web: 'Search the web for ',
      };
      if (chip === 'skills') {
        if (onNavigateView) {
          onNavigateView('skills');
        } else {
          setActiveView('skills');
        }
        return;
      }
      setDraftContent(prompts[chip] ?? '');
    },
    [setDraftContent, setActiveView, onNavigateView],
  );

  const handlePlusClick = useCallback(() => {
    onPlusClickProp?.();
  }, [onPlusClickProp]);

  const handleModelSelectorClick = useCallback(() => {
    onModelSelectorClickProp?.();
  }, [onModelSelectorClickProp]);

  const handleVoiceClick = useCallback(() => {
    onVoiceClickProp?.();
  }, [onVoiceClickProp]);

  // Notify host app when a non-chat view is selected so it can render the content
  const handleViewNavigation = useCallback(
    (view: string) => {
      if (onNavigateView) {
        onNavigateView(view);
      }
    },
    [onNavigateView],
  );

  // When a non-chat view is active and host app handles navigation, redirect
  // then immediately reset to chat so the placeholder doesn't linger.
  useEffect(() => {
    if (activeView !== 'chat' && activeView !== 'project-detail' && onNavigateView) {
      handleViewNavigation(activeView);
      // Reset back to chat — the host app is now showing its own UI (e.g. settings dialog)
      setActiveView('chat');
    }
    // Only run when activeView changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  // Main content: either a placeholder view or the full chat layout
  const renderMainContent = () => {
    // Non-chat views: if host handles them via onNavigateView, show a brief loading state
    // while the host responds. If no host handler, show placeholder.
    if (
      activeView === 'customize' ||
      activeView === 'projects' ||
      activeView === 'project-detail' ||
      activeView === 'skills' ||
      activeView === 'connectors'
    ) {
      const labels: Record<string, string> = {
        customize: 'Customize Hub',
        projects: 'Projects',
        'project-detail': 'Project',
        skills: 'Skills',
        connectors: 'Connectors',
      };
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-[var(--chat-text-muted)]">
          <span>{labels[activeView] ?? activeView}</span>
          <button
            type="button"
            onClick={() => setActiveView('chat')}
            className="px-3 py-1.5 rounded-lg text-xs bg-[var(--chat-surface-hover)] hover:bg-[var(--chat-accent-primary)]/10 transition-colors"
          >
            Back to Chat
          </button>
        </div>
      );
    }

    // Default: chat view
    return (
      <div className="flex h-full flex-col">
        {/* Header — only rendered when a conversation with messages is active */}
        {hasMessages && currentConversationId && <ConversationHeader />}

        {/* Content area — grows to fill remaining vertical space, hides overflow for
            MessageList's own internal scroll container */}
        <div className="flex-1 overflow-hidden">
          {hasMessages && currentConversationId ? (
            <MessageList conversationId={currentConversationId} />
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Input area — ALWAYS at bottom in natural document flow.
            Never position:fixed. Never teleported. */}
        <div className="shrink-0 px-4 pb-2">
          {!hasMessages && <QuickChips onChipClick={handleChipClick} />}
          <ChatInput
            onSend={handleSend}
            onStop={stopGeneration}
            onPlusClick={handlePlusClick}
            onModelSelectorClick={handleModelSelectorClick}
            onVoiceClick={handleVoiceClick}
            hasMessages={hasMessages}
            disabled={!runtime}
            disabledMessage="Connect to start chatting"
          />
          <Disclaimer variant={disclaimerVariant} />
        </div>
      </div>
    );
  };

  return (
    <RuntimeContext.Provider value={runtime}>
      <div
        className={cn(
          'flex h-full w-full overflow-hidden',
          'bg-[var(--chat-bg)] text-[var(--chat-fg)]',
          className,
        )}
      >
        {/* Left: collapsible sidebar */}
        <Sidebar />

        {/* Center: main content — wrapped in ErrorBoundary to catch render errors */}
        <main className="flex flex-1 min-w-0 flex-col overflow-hidden">
          <ChatErrorBoundary>{renderMainContent()}</ChatErrorBoundary>
        </main>

        {/* Right: artifact panel — only mounted when open (Phase 3) */}
        {artifactOpen && (
          <div
            className="shrink-0 border-l border-[var(--chat-border)] bg-[var(--chat-surface-base)]"
            style={{ width: artifactPanelWidth }}
          >
            <div className="flex h-full items-center justify-center text-sm text-[var(--chat-text-muted)]">
              Artifact Panel (Phase 3)
            </div>
          </div>
        )}
      </div>

      {/* Settings modal — shared across desktop & web */}
      <SettingsModal />
    </RuntimeContext.Provider>
  );
}
