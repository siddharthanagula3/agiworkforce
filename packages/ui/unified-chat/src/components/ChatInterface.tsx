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
import { HostBridgeContext, type ChatHostBridge, useHostBridge } from '../lib/hostBridge';
import type { ChatRuntime } from '../lib/runtime';
import type { Artifact, ChatMessage } from '../lib/types';
import type { ChipType, QuickChipAvailability } from './QuickChips';
import { Sidebar } from './Sidebar';
import { EmptyState } from './EmptyState';
import { ChatInput, type ChatInputProjectPicker, type ChatWorkScope } from './ChatInput';
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
import type { WritingStyle } from '../lib/writingStyle';
import { syncPackageStoreFromHost, useHostBridgeSync } from '../hooks/useHostBridgeSync';
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
  const hostBridge = useHostBridge();

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
                if (hostBridge?.selectConversation) {
                  hostBridge.selectConversation(conv.id);
                  syncPackageStoreFromHost(hostBridge);
                } else {
                  setActiveConversation(conv.id);
                }
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
   * Host-issued send request for global launchers such as Desktop Quick Query.
   * The opaque id provides exactly-once consumption across React re-renders;
   * requests wait for the current stream to settle and still pass through the
   * same shared model admission, optimistic transcript, and runtime pipeline
   * as composer submissions.
   */
  /**
   * One-shot attachment injection forwarded to the composer, keyed by `id`.
   * The desktop cloud folder sheet uses this to hand over files it has already
   * put through the consent ceremony.
   */
  pendingAttachments?: { id: string; files: File[] } | null;
  externalSendRequest?: {
    id: string;
    content: string;
  } | null;
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
  /**
   * When false, the package does not mount its fallback search overlay.
   * Desktop hosts use their own Cmd+K search modal to avoid duplicate dialogs.
   */
  enableSearchOverlay?: boolean;
  /**
   * AUDIT-FIX CMP-29: `onPlusClick` and `onVoiceClick` are gone. `ChatInput`
   * (this package) owns the "+" attachment menu and the mic itself, so the two
   * callbacks were forwarded into props that were destructured and never
   * referenced — dead in every host that wired them. Hosts that need to react
   * to attachments should use the runtime/store, not a click ping.
   */
  /** Called when the user clicks the model selector */
  onModelSelectorClick?: () => void;
  /** When false, the model selector does not fall back to cloud catalog rows if host models are empty. */
  allowModelFallbackModels?: boolean;
  /**
   * Called when the user picks "Select folder" from the composer's attachment
   * menu. Only reachable when the host surface exposes `canUseWorkingDirectory`
   * (desktop) — the native dialog + backend sync are the host's responsibility.
   */
  onSelectFolder?: () => void;
  /** Opens a host-owned desktop workflow recorder when the surface supports it. */
  onRecordSkill?: () => void;
  /** Display label for the currently scoped project folder, if any. */
  currentFolderLabel?: string | null;
  /** Clears the host's scoped local folder (project/folder mutual exclusion). */
  onClearFolder?: () => void;
  /**
   * Chat | AGI Work toggle + "Project or folder" picker for the composer.
   * Forwarded to ChatInput; absent = no toggle rendered (mobile).
   */
  projectPicker?: ChatInputProjectPicker;
  /** Managed-account entitlement for AGI Work; ordinary project chat remains available when false. */
  canUseAgiWork?: boolean;
  /** Host/account overrides layered over runtime quick-action capabilities. */
  quickChipAvailability?: QuickChipAvailability;
  /** Called when the user navigates to a sidebar view (customize, projects, skills, connectors) */
  onNavigateView?: (view: string) => void;
  /** Explicit host-owned bridge for conversation selection and persistence. */
  hostBridge?: ChatHostBridge | null;
  /** Legacy fallback for mirroring messages into a host store. */
  onAddMessage?: (msg: { role: string; content: string; id?: string }) => void;
  /**
   * When provided, replaces the default `Sidebar` block. Host apps can use
   * this to inject a surface-specific sidebar shell while keeping streaming
   * and host-bridge wiring identical.
   */
  sidebarSlot?: ReactNode;
  /**
   * When provided, replaces the default `EmptyState + QuickChips` block that
   * renders when the conversation has no messages.
   */
  emptyStateSlot?: ReactNode;
  /**
   * When provided, replaces the default `ChatInput + QuickChips + Disclaimer`
   * composer block at the bottom of the chat. Host apps using this slot are
   * responsible for invoking `runtime.sendMessage` themselves (typically via
   * the exported `useChat` hook).
   */
  composerSlot?: ReactNode;
  /**
   * Forwarded to `ArtifactPanel`. `'split'` keeps the artifact panel docked
   * beside the chat (current behavior). `'fullscreen'` hides the chat column
   * while the artifact is open. Default `'split'`.
   */
  artifactMode?: 'split' | 'fullscreen';
  /**
   * When true (default), assistant messages render a `ProvenanceFooter`
   * below them showing model id + latency + token counts. Pass `false` to
   * suppress on hosts that don't want the footer.
   */
  showProvenanceFooter?: boolean;
}

export function ChatInterface({
  runtime,
  className,
  externalSendRequest = null,
  pendingAttachments = null,
  manageTheme = false,
  enableShortcuts = true,
  enableSearchOverlay = true,
  onModelSelectorClick: onModelSelectorClickProp,
  allowModelFallbackModels = true,
  onSelectFolder: onSelectFolderProp,
  onRecordSkill,
  currentFolderLabel = null,
  onClearFolder,
  projectPicker,
  canUseAgiWork = true,
  quickChipAvailability,
  onNavigateView,
  hostBridge = null,
  onAddMessage,
  sidebarSlot,
  emptyStateSlot,
  composerSlot,
  artifactMode = 'split',
  showProvenanceFooter = true,
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
  useHostBridgeSync(hostBridge);
  const {
    sendMessage,
    stopGeneration,
    continueGeneration,
    resolveToolApproval,
    isStreaming,
    isApprovalTurnLive,
  } = useChat(runtime, {
    hostBridge,
    externalAddMessage: onAddMessage,
  });

  // Tool-approval round-trip: only wired when the runtime actually implements
  // it (cloud SSE runtimes) — omitted entirely otherwise so awaiting_approval
  // cards render read-only instead of a button that would silently no-op.
  const handleToolApprove = useCallback(
    (messageId: string, toolCallId: string) =>
      resolveToolApproval(messageId, toolCallId, 'approved'),
    [resolveToolApproval],
  );
  const handleToolReject = useCallback(
    (messageId: string, toolCallId: string) =>
      resolveToolApproval(messageId, toolCallId, 'rejected'),
    [resolveToolApproval],
  );

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
  const loadedConversationIdsRef = useRef(new Set<string>());
  const [messageLoadAttempt, setMessageLoadAttempt] = useState(0);
  const [messageLoadState, setMessageLoadState] = useState<
    { status: 'idle' | 'loading' } | { status: 'error'; message: string }
  >({ status: 'idle' });
  const activeView = useUIStore((s) => s.activeView);
  const searchModalOpen = useUIStore((s) => s.searchModalOpen);
  const toggleSearchModal = useUIStore((s) => s.toggleSearchModal);

  const hasMessages = messages.length > 0;

  useEffect(() => {
    loadedConversationIdsRef.current.clear();
    setMessageLoadState({ status: 'idle' });
  }, [runtime]);

  useEffect(() => {
    if (!activeConversationId || !runtime || isStreaming) {
      setMessageLoadState({ status: 'idle' });
      return;
    }

    const loadMessages = runtime.loadMessages ?? runtime.getMessages;
    if (!loadMessages) return;
    const cached = useChatStore.getState().messagesByConversation[activeConversationId];
    if ((cached?.length ?? 0) > 0) {
      loadedConversationIdsRef.current.add(activeConversationId);
      setMessageLoadState({ status: 'idle' });
      return;
    }
    if (loadedConversationIdsRef.current.has(activeConversationId)) return;

    let cancelled = false;
    setMessageLoadState({ status: 'loading' });
    void loadMessages
      .call(runtime, activeConversationId)
      .then((loaded) => {
        if (cancelled) return;
        useChatStore.getState().setMessages(activeConversationId, loaded);
        loadedConversationIdsRef.current.add(activeConversationId);
        setMessageLoadState({ status: 'idle' });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMessageLoadState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not load this conversation.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeConversationId, runtime, isStreaming, messageLoadAttempt]);

  // Determine disclaimer variant based on the most recent assistant message
  const disclaimerVariant = useMemo((): 'default' | 'citations' | 'code' => {
    if (!hasMessages) return 'default';
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant?.citations?.length) return 'citations';
    return 'default';
  }, [messages, hasMessages]);

  // Handlers — all stable via useCallback
  const handleSend = useCallback(
    (
      content: string,
      agentMode?: string,
      effort?: string,
      attachments?: File[],
      research?: boolean,
      writingStyle?: WritingStyle,
      workScope?: ChatWorkScope,
    ) => {
      sendMessage(
        content,
        agentMode,
        effort,
        attachments,
        research,
        writingStyle,
        workScope?.workMode,
        workScope?.projectId,
      );
    },
    [sendMessage],
  );
  const consumedExternalSendIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !externalSendRequest ||
      !externalSendRequest.content.trim() ||
      isStreaming ||
      consumedExternalSendIdRef.current === externalSendRequest.id
    ) {
      return;
    }
    consumedExternalSendIdRef.current = externalSendRequest.id;
    handleSend(externalSendRequest.content.trim());
  }, [externalSendRequest, handleSend, isStreaming]);

  const setDraftContent = useChatStore((s) => s.setDraftContent);
  const setActiveView = useUIStore((s) => s.setActiveView);

  const handleChipClick = useCallback(
    (chip: ChipType) => {
      const prompts: Partial<Record<ChipType, string>> = {
        code: 'Help me write code for ',
        write: 'Help me write ',
        research: 'Research this topic in depth: ',
        image: 'Create an image of ',
        video: 'Create a video of ',
        computer: 'Use computer to ',
        learn: 'Explain this to me: ',
        life: 'Help me with ',
        web: 'Search the web for ',
      };
      setDraftContent(prompts[chip] ?? '');
    },
    [setDraftContent],
  );

  const handleModelSelectorClick = useCallback(() => {
    onModelSelectorClickProp?.();
  }, [onModelSelectorClickProp]);

  const handleSelectFolder = useCallback(() => {
    onSelectFolderProp?.();
  }, [onSelectFolderProp]);

  const handleArtifactClick = useCallback(
    (artifact: Artifact) => {
      openArtifact(artifact);
    },
    [openArtifact],
  );

  // Version history for the panel's version stepper. Keyed on the real
  // artifact id (stripping any `::v<n>` pseudo-suffix — see
  // ChatRuntime.getArtifactVersions) so this only refetches when the user
  // switches to a different artifact, not on every local content tweak.
  const [activeArtifactVersions, setActiveArtifactVersions] = useState<Artifact[]>([]);
  const activeArtifactRealId = activeArtifact ? activeArtifact.id.split('::v')[0] : null;

  useEffect(() => {
    let cancelled = false;
    if (!activeArtifact) {
      setActiveArtifactVersions([]);
      return undefined;
    }
    if (!runtime?.getArtifactVersions) {
      setActiveArtifactVersions([activeArtifact]);
      return undefined;
    }
    runtime
      .getArtifactVersions(activeArtifact)
      .then((versions) => {
        if (!cancelled)
          setActiveArtifactVersions(versions.length > 0 ? versions : [activeArtifact]);
      })
      .catch(() => {
        if (!cancelled) setActiveArtifactVersions([activeArtifact]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeArtifactRealId, runtime]);

  const handleSelectArtifactVersion = useCallback(
    (version: Artifact) => {
      openArtifact(version, artifactViewMode);
    },
    [openArtifact, artifactViewMode],
  );

  // Edit-in-place persistence for ArtifactPanel. Always resolves edits
  // against the real artifact id (stripping any `::v<n>` version suffix),
  // matching the backend's rollback() semantics: saving while viewing a
  // historical version creates a new version with that content.
  const handleSaveArtifactEdit = useCallback(
    async (artifactId: string, content: string) => {
      const realId = artifactId.split('::v')[0] ?? artifactId;
      let savedContent = content;

      if (runtime?.updateArtifact) {
        try {
          const result = await runtime.updateArtifact(artifactId, content);
          savedContent = result.content;
        } catch (err) {
          console.error('[ChatInterface] Failed to persist artifact edit:', err);
          // Fall through — still reflect the edit locally so the user's
          // draft isn't silently discarded.
        }
      }

      if (activeConversationId) {
        const store = useChatStore.getState();
        const msgs = store.messagesByConversation[activeConversationId] ?? [];
        const owner = msgs.find((m) => m.artifacts?.some((a) => a.id === realId));
        if (owner) {
          const updatedArtifacts = (owner.artifacts ?? []).map((a) =>
            a.id === realId ? { ...a, content: savedContent } : a,
          );
          store.updateMessage(activeConversationId, owner.id, { artifacts: updatedArtifacts });
        }
      }

      if (activeArtifact) {
        const updated: Artifact = { ...activeArtifact, id: realId, content: savedContent };
        openArtifact(updated, artifactViewMode);
        if (runtime?.getArtifactVersions) {
          try {
            const versions = await runtime.getArtifactVersions(updated);
            setActiveArtifactVersions(versions.length > 0 ? versions : [updated]);
          } catch {
            // Non-fatal — the stepper just won't refresh with the new version.
          }
        }
      }
    },
    [runtime, activeConversationId, activeArtifact, artifactViewMode, openArtifact],
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
          {messageLoadState.status === 'loading' && activeConversationId ? (
            <div
              className="flex h-full items-center justify-center text-sm text-[var(--chat-text-muted)]"
              role="status"
            >
              Loading conversation…
            </div>
          ) : messageLoadState.status === 'error' && activeConversationId ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-medium text-[var(--chat-text-primary)]">
                Could not load this conversation
              </p>
              <p className="max-w-md text-xs text-[var(--chat-text-muted)]">
                {messageLoadState.message}
              </p>
              <button
                type="button"
                onClick={() => setMessageLoadAttempt((attempt) => attempt + 1)}
                className="rounded-lg bg-[var(--chat-surface-hover)] px-3 py-1.5 text-xs text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-accent-primary)]/10"
              >
                Try again
              </button>
            </div>
          ) : hasMessages && activeConversationId ? (
            <MessageList
              conversationId={activeConversationId}
              onArtifactClick={handleArtifactClick}
              showProvenanceFooter={showProvenanceFooter}
              onContinueGeneration={
                runtime?.supportsContinueGeneration ? continueGeneration : undefined
              }
              onToolApprove={runtime?.resolveToolApproval ? handleToolApprove : undefined}
              onToolReject={runtime?.resolveToolApproval ? handleToolReject : undefined}
              approvalTurnExpired={runtime?.resolveToolApproval ? !isApprovalTurnLive : undefined}
            />
          ) : emptyStateSlot !== undefined ? (
            emptyStateSlot
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Input area — ALWAYS at bottom in natural document flow.
            Never position:fixed. Never teleported. */}
        <div className="shrink-0 px-4 pb-2">
          {composerSlot !== undefined ? (
            composerSlot
          ) : (
            <>
              <ChatInput
                onSend={handleSend}
                onStop={stopGeneration}
                onModelSelectorClick={handleModelSelectorClick}
                allowModelFallbackModels={allowModelFallbackModels}
                supportsAgentControl={runtime?.supportsAgentControl !== false}
                onSelectFolder={onSelectFolderProp ? handleSelectFolder : undefined}
                onRecordSkill={onRecordSkill}
                currentFolderLabel={currentFolderLabel}
                onClearFolder={onClearFolder}
                projectPicker={projectPicker}
                canUseAgiWork={canUseAgiWork}
                isStreamingOverride={isStreaming}
                hasMessages={hasMessages}
                disabled={!runtime}
                disabledMessage="Connect to start chatting"
                conversationId={activeConversationId}
                projectId={projectPicker?.activeProjectId ?? null}
                supportsCodeExecution={runtime?.supportsCodeExecution ?? false}
                supportsResearch={runtime?.supportsResearch ?? false}
                attachmentPolicy={runtime?.attachmentPolicy}
                pendingAttachments={pendingAttachments}
              />
              {/* Sample-prompt mode chips below the composer (claude.ai parity —
                  ref: claude_reference/015). This is a composer-area element shown
                  whenever the chat is empty; it's independent of `emptyStateSlot`,
                  which owns the content area above (the branded greeting). */}
              {!hasMessages && (
                <QuickChips
                  onChipClick={handleChipClick}
                  availability={{
                    research: quickChipAvailability?.research ?? runtime?.supportsResearch,
                    image: quickChipAvailability?.image ?? runtime?.supportsImageGeneration,
                    video: quickChipAvailability?.video ?? runtime?.supportsVideoGeneration,
                    computer: quickChipAvailability?.computer ?? runtime?.supportsComputerUse,
                  }}
                />
              )}
              <Disclaimer variant={disclaimerVariant} />
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <RuntimeContext.Provider value={runtime}>
      <HostBridgeContext.Provider value={hostBridge}>
        <div
          className={cn(
            'flex h-full w-full overflow-hidden',
            'bg-[var(--chat-bg)] text-[var(--chat-fg)]',
            className,
          )}
        >
          {/* Left: collapsible sidebar */}
          {sidebarSlot !== undefined ? sidebarSlot : <Sidebar />}

          {/* Center: main content — wrapped in ErrorBoundary to catch render errors.
              Hidden when an artifact is open in fullscreen mode. */}
          {!(artifactOpen && artifactMode === 'fullscreen') && (
            <main className="flex flex-1 min-w-0 flex-col overflow-hidden">
              <ChatErrorBoundary>{renderMainContent()}</ChatErrorBoundary>
            </main>
          )}

          {/* Right: artifact panel — only mounted when open (Phase 3).
              In fullscreen mode the panel fills the remaining width. */}
          {artifactOpen && (
            <div
              className={cn(
                'border-l border-[var(--chat-border)] bg-[var(--chat-surface-base)]',
                artifactMode === 'fullscreen' ? 'flex-1' : 'shrink-0',
              )}
              style={artifactMode === 'split' ? { width: artifactPanelWidth } : undefined}
            >
              <ArtifactPanel
                artifact={activeArtifact}
                viewMode={artifactViewMode}
                onViewModeChange={setArtifactViewMode}
                onClose={closeArtifact}
                versions={activeArtifactVersions}
                onSelectVersion={handleSelectArtifactVersion}
                onSaveEdit={handleSaveArtifactEdit}
              />
            </div>
          )}
        </div>

        {/* Search overlay — fallback only. Desktop mounts its own Cmd+K modal. */}
        {enableSearchOverlay && (
          <SearchOverlay open={searchModalOpen} onClose={toggleSearchModal} />
        )}

        {/* Settings modal — shared across desktop & web */}
        <SettingsModal />
      </HostBridgeContext.Provider>
    </RuntimeContext.Provider>
  );
}
