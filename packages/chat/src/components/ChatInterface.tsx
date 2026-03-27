import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useState,
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { Search, X } from 'lucide-react';
import type { ChatRuntime } from '../lib/runtime';
import type { Artifact, ChatMessage } from '../lib/types';
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
import { ArtifactPanel } from './ArtifactPanel';
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

// ---------------------------------------------------------------------------
// SearchOverlay — lightweight search modal triggered by Cmd+F / sidebar Search
// ---------------------------------------------------------------------------

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const conversations = useChatStore((s) => s.conversations);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return conversations
      .filter((c) => !c.archived && c.title.toLowerCase().includes(q))
      .slice(0, 20);
  }, [conversations, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      // Focus after animation frame so the input is mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey, { capture: true });
    return () => window.removeEventListener('keydown', handleKey, { capture: true });
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      aria-modal="true"
      role="dialog"
      aria-label="Search conversations"
    >
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative z-10 w-full max-w-lg overflow-hidden rounded-xl',
          'bg-[var(--chat-surface-base)] border border-[var(--chat-border)]',
          'shadow-xl',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2.5 border-b border-[var(--chat-border)] px-3.5 py-3">
          <Search size={15} className="shrink-0 text-[var(--chat-text-muted)]" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations..."
            className={cn(
              'flex-1 bg-transparent text-sm text-[var(--chat-text-primary)]',
              'placeholder:text-[var(--chat-text-muted)]',
              'focus:outline-none',
            )}
          />
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--chat-text-muted)] hover:text-[var(--chat-text-primary)] transition-colors"
            aria-label="Close search"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-1.5">
          {query.trim() && results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--chat-text-muted)]">
              No conversations found.
            </p>
          )}
          {!query.trim() && (
            <p className="px-4 py-6 text-center text-sm text-[var(--chat-text-muted)]">
              Type to search your conversations.
            </p>
          )}
          {results.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => {
                setActiveConversation(conv.id);
                onClose();
              }}
              className={cn(
                'flex w-full items-center gap-3 px-3.5 py-2 text-sm text-left',
                'text-[var(--chat-text-primary)] transition-colors',
                'hover:bg-[var(--chat-surface-hover)]',
              )}
            >
              <span className="flex-1 truncate">{conv.title}</span>
              <span className="shrink-0 text-[11px] text-[var(--chat-text-muted)]">
                {new Date(conv.updatedAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
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
  /** External addMessage function (from the host app's chat store). */
  onAddMessage?: (msg: { role: string; content: string; id?: string }) => void;
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
  onAddMessage,
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
  const { sendMessage, stopGeneration } = useChat(runtime, onAddMessage);

  // Artifact panel state (single source — must not be called in child components separately)
  const {
    isOpen: artifactOpen,
    panelWidth: artifactPanelWidth,
    activeArtifact,
    viewMode: artifactViewMode,
    openArtifact,
    closeArtifact,
    setViewMode: setArtifactViewMode,
  } = useArtifact();

  // Store state
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const emptyMessages = useRef<ChatMessage[]>([]).current;
  const messages = useChatStore((s) =>
    activeConversationId
      ? (s.messagesByConversation[activeConversationId] ?? emptyMessages)
      : emptyMessages,
  );
  const activeView = useUIStore((s) => s.activeView);
  const searchModalOpen = useUIStore((s) => s.searchModalOpen);
  const toggleSearchModal = useUIStore((s) => s.toggleSearchModal);

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

  const handleArtifactClick = useCallback(
    (artifact: Artifact) => {
      openArtifact(artifact);
    },
    [openArtifact],
  );

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
        {hasMessages && activeConversationId && <ConversationHeader />}

        {/* Content area — grows to fill remaining vertical space, hides overflow for
            MessageList's own internal scroll container */}
        <div className="flex-1 overflow-hidden">
          {hasMessages && activeConversationId ? (
            <MessageList
              conversationId={activeConversationId}
              onArtifactClick={handleArtifactClick}
            />
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
            <ArtifactPanel
              artifact={activeArtifact}
              viewMode={artifactViewMode}
              onViewModeChange={setArtifactViewMode}
              onClose={closeArtifact}
            />
          </div>
        )}
      </div>

      {/* Search overlay — triggered by sidebar Search button or Cmd+F */}
      <SearchOverlay open={searchModalOpen} onClose={toggleSearchModal} />

      {/* Settings modal — shared across desktop & web */}
      <SettingsModal />
    </RuntimeContext.Provider>
  );
}
