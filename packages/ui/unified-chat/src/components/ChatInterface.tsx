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
import { useUiTranslation } from '@agiworkforce/ui';
import { HostBridgeContext, type ChatHostBridge, useHostBridge } from '../lib/hostBridge';
import type { ChatRuntime, LocalToolScope } from '../lib/runtime';
import type {
  Artifact,
  ChatMessage,
  DeriveMessageArtifacts,
  MessageArtifactProjection,
} from '../lib/types';

import { Sidebar } from './Sidebar';
import { EmptyState } from './EmptyState';
import {
  ChatInput,
  type ChatComposerEditorMode,
  type ChatInputProjectPicker,
  type ChatWorkScope,
  type ComposerSkillSuggestion,
  type ComposerVoiceController,
} from './ChatInput';
import type { MentionSkill } from './SkillMentionPicker';

import type { ManagedUsageWarning } from '@agiworkforce/types';
import { UsageWarningBanner } from './UsageWarningBanner';
import { Disclaimer } from './Disclaimer';
import { MessageList } from './MessageList';
import { ConversationHeader, type ConversationHeaderProps } from './ConversationHeader';
import { ConversationStatsPanel } from './ConversationStatsPanel';
import { GoalHandoffChip } from './GoalHandoffChip';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import { useChat } from '../hooks/useChat';
import { useTheme } from '../hooks/useTheme';
import { useKeyboard } from '../hooks/useKeyboard';
import { useArtifact } from '../hooks/useArtifact';
import { useArtifactStore } from '../stores/artifactStore';
import type { WritingStyle } from '../lib/writingStyle';
import { syncPackageStoreFromHost, useHostBridgeSync } from '../hooks/useHostBridgeSync';
import { SettingsModal } from './SettingsModal';
import { ArtifactPanel } from './ArtifactPanel';
import { RewindTimeline } from './RewindTimeline';
import { useAgentControlStore } from '../stores/agentControlStore';
import { cn } from '../lib/utils';

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

const RuntimeContext = createContext<ChatRuntime | null>(null);

export function useRuntime(): ChatRuntime | null {
  return useContext(RuntimeContext);
}

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const { t } = useUiTranslation('chat');
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
      aria-label={t('interface.searchConversations', 'Search conversations')}
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
            placeholder={t('sidebar.searchConversations', 'Search conversations...')}
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
            aria-label={t('stream.closeSearch', 'Close search')}
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-1.5">
          {query.trim() && results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--chat-text-muted)]">
              {t('interface.noConversationsFound', 'No conversations found.')}
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
              <span className="shrink-0 text-[12px] text-[var(--chat-text-muted)]">
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
  pendingAttachments?: { id: string; files: File[] } | null;
  attachmentContextKey?: string;
  voiceInputController?: ComposerVoiceController;
  externalSendRequest?: {
    id: string;
    content: string;
  } | null;
  manageTheme?: boolean;
  enableShortcuts?: boolean;
  enableSearchOverlay?: boolean;
  onModelSelectorClick?: () => void;
  allowModelFallbackModels?: boolean;
  onSelectFolder?: () => void;
  onRecordSkill?: () => void;
  currentFolderLabel?: string | null;
  onClearFolder?: () => void;
  projectPicker?: ChatInputProjectPicker;
  canUseAgiWork?: boolean;
  agiWorkUnavailableReason?: string;
  composerHostControls?: ReactNode;
  usageWarning?: ManagedUsageWarning | null;
  onUpgradeUsage?: () => void;
  onDismissUsageWarning?: () => void;
  composerSendShortcut?: 'enter' | 'mod-enter';
  composerEditorMode?: ChatComposerEditorMode;
  skills?: MentionSkill[];
  suggestSkills?: (content: string) => Promise<ComposerSkillSuggestion[]>;
  onNavigateView?: (view: string) => void;
  hostBridge?: ChatHostBridge | null;
  onAddMessage?: (msg: { role: string; content: string; id?: string }) => void;
  sidebarSlot?: ReactNode;
  emptyStateSlot?: ReactNode;
  /**
   * When provided, replaces the default `ChatInput + Disclaimer`
   * composer block at the bottom of the chat. Host apps using this slot are
   * responsible for invoking `runtime.sendMessage` themselves (typically via
   * the exported `useChat` hook).
   */
  composerSlot?: ReactNode;
  artifactMode?: 'split' | 'fullscreen';
  /**
   * Conversation-scoped header actions. Forwarded to {@link ConversationHeader};
   * an action with no handler is not rendered, so a host never shows a control
   * it cannot perform. Desktop supplies rename/share; web keeps its own richer
   * page header and passes none of these.
   */
  conversationActions?: ConversationHeaderProps;
  onSubmitGoal?: (goal: string) => void | Promise<void>;
  deriveMessageArtifacts?: DeriveMessageArtifacts;
  showProvenanceFooter?: boolean;
}

export function ChatInterface({
  runtime,
  className,
  externalSendRequest = null,
  pendingAttachments = null,
  attachmentContextKey,
  voiceInputController,
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
  agiWorkUnavailableReason,
  composerHostControls,
  usageWarning,
  onUpgradeUsage,
  onDismissUsageWarning,
  composerSendShortcut,
  composerEditorMode,
  skills = [],
  suggestSkills,
  onNavigateView,
  hostBridge = null,
  onAddMessage,
  sidebarSlot,
  emptyStateSlot,
  composerSlot,
  artifactMode = 'split',
  conversationActions,
  onSubmitGoal,
  deriveMessageArtifacts,
  showProvenanceFooter = true,
}: ChatInterfaceProps) {
  const { t } = useUiTranslation('chat');

  useTheme();
  useKeyboard({ enabled: enableShortcuts });

  // block acting as a safety net that keeps things consistent across re-renders.
  if (typeof document !== 'undefined') {
    if (!manageTheme) {
      document.documentElement.setAttribute('data-theme-managed', '');
    } else {
      document.documentElement.removeAttribute('data-theme-managed');
    }
  }

  useHostBridgeSync(hostBridge);
  const {
    sendMessage,
    stopGeneration,
    continueGeneration,
    regenerate,
    editAndResend,
    resolveToolApproval,
    isStreaming,
    isApprovalTurnLive,
  } = useChat(runtime, {
    hostBridge,
    externalAddMessage: onAddMessage,
  });

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

  const {
    isOpen: artifactOpen,
    panelWidth: artifactPanelWidth,
    activeArtifact,
    viewMode: artifactViewMode,
    openArtifact,
    closeArtifact,
    setViewMode: setArtifactViewMode,
  } = useArtifact();

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
  const [rewindTimelineOpen, setRewindTimelineOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);

  const slashCommandHost = useMemo(() => {
    if (!hostBridge?.createConversation) return undefined;
    return {
      togglePlanMode: () => {
        let conversationId = useChatStore.getState().activeConversationId;
        if (!conversationId) {
          conversationId = hostBridge.createConversation?.('New chat') ?? null;
          if (conversationId) {
            hostBridge.selectConversation?.(conversationId);
            syncPackageStoreFromHost(hostBridge);
          }
        }
        if (!conversationId) return;
        const projectId = projectPicker?.activeProjectId ?? null;
        const agentControl = useAgentControlStore.getState();
        const currentMode = agentControl.resolve(conversationId, projectId).mode;
        agentControl.setMode(conversationId, currentMode === 'plan' ? 'ask' : 'plan');
      },
      ...(hostBridge.fetchCodingCheckpoints && hostBridge.rewindCodingCheckpoint
        ? {
            openRewindTimeline: () => setRewindTimelineOpen(true),
          }
        : {}),
    };
  }, [hostBridge, projectPicker?.activeProjectId]);

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

  const disclaimerVariant = useMemo((): 'default' | 'citations' | 'code' => {
    if (!hasMessages) return 'default';
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant?.citations?.length) return 'citations';
    return 'default';
  }, [messages, hasMessages]);

  const handleSend = useCallback(
    (
      content: string,
      agentMode?: string,
      effort?: string,
      attachments?: File[],
      research?: boolean,
      writingStyle?: WritingStyle,
      workScope?: ChatWorkScope,
      skillName?: string,
      localToolScope?: LocalToolScope,
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
        undefined,
        skillName,
        localToolScope,
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

  const setActiveView = useUIStore((s) => s.setActiveView);

  const handleSelectFolder = useCallback(() => {
    onSelectFolderProp?.();
  }, [onSelectFolderProp]);

  const handleArtifactClick = useCallback(
    (artifact: Artifact) => {
      openArtifact(artifact);
    },
    [openArtifact],
  );

  const artifactProjections = useMemo(() => {
    if (!deriveMessageArtifacts || !activeConversationId) return null;
    const projections = new Map<string, MessageArtifactProjection>();
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      const projection = deriveMessageArtifacts(message, { conversationId: activeConversationId });
      if (projection) projections.set(message.id, projection);
    }
    return projections;
  }, [messages, deriveMessageArtifacts, activeConversationId]);

  const conversationArtifacts = useMemo(() => {
    const seen = new Set<string>();
    const collected: Artifact[] = [];
    for (const message of messages) {
      const fromMessage = artifactProjections?.get(message.id)?.artifacts ?? message.artifacts;
      for (const artifact of fromMessage ?? []) {
        if (seen.has(artifact.id)) continue;
        seen.add(artifact.id);
        collected.push(artifact);
      }
    }
    return collected;
  }, [messages, artifactProjections]);

  useEffect(() => {
    if (!activeConversationId) return;
    useArtifactStore.getState().setArtifacts(activeConversationId, conversationArtifacts);
  }, [activeConversationId, conversationArtifacts]);

  const handleToggleArtifacts = useCallback(() => {
    if (artifactOpen) {
      closeArtifact();
      return;
    }
    const latest = conversationArtifacts[conversationArtifacts.length - 1];
    if (latest) openArtifact(latest);
  }, [artifactOpen, closeArtifact, conversationArtifacts, openArtifact]);

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
          } catch (err) {
            console.error('[ChatInterface] Failed to load artifact versions:', err);
          }
        }
      }
    },
    [runtime, activeConversationId, activeArtifact, artifactViewMode, openArtifact],
  );

  const handleViewNavigation = useCallback(
    (view: string) => {
      if (onNavigateView) {
        onNavigateView(view);
      }
    },
    [onNavigateView],
  );

  useEffect(() => {
    if (activeView !== 'chat' && activeView !== 'project-detail' && onNavigateView) {
      handleViewNavigation(activeView);
      setActiveView('chat');
    }
    // Only run when activeView changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  const renderMainContent = () => {
    if (
      activeView === 'customize' ||
      activeView === 'projects' ||
      activeView === 'project-detail' ||
      activeView === 'skills' ||
      activeView === 'connectors'
    ) {
      const labels: Record<string, string> = {
        customize: t('interface.customizeHub', 'Customize Hub'),
        projects: t('sidebar.projects', 'Projects'),
        'project-detail': t('composer.project', 'Project'),
        skills: t('sidebar.skills', 'Skills'),
        connectors: t('interface.connectors', 'Connectors'),
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

    return (
      <div className={cn('relative flex h-full flex-col', !hasMessages && 'justify-center')}>
        {/* Header, only rendered when a conversation with messages is active */}
        {hasMessages && activeConversationId && (
          <ConversationHeader
            {...conversationActions}
            onToggleArtifacts={
              conversationActions?.onToggleArtifacts ??
              (conversationArtifacts.length > 0 ? handleToggleArtifacts : undefined)
            }
            artifactsOpen={conversationActions?.artifactsOpen ?? artifactOpen}
            artifactCount={conversationActions?.artifactCount ?? conversationArtifacts.length}
            onToggleStats={
              conversationActions?.onToggleStats ?? (() => setStatsOpen((open) => !open))
            }
            statsOpen={conversationActions?.statsOpen ?? statsOpen}
          />
        )}
        {hasMessages && statsOpen ? <ConversationStatsPanel messages={messages} /> : null}
        {hasMessages && onSubmitGoal ? (
          <GoalHandoffChip messages={messages} onSubmitGoal={onSubmitGoal} />
        ) : null}

        {/* Content area, grows to fill remaining vertical space, hides overflow for
            MessageList's own internal scroll container */}
        <div className={hasMessages ? 'flex-1 overflow-hidden' : 'shrink-0'}>
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
                {t('interface.conversationLoadFailed', 'Could not load this conversation')}
              </p>
              <p className="max-w-md text-xs text-[var(--chat-text-muted)]">
                {messageLoadState.message}
              </p>
              <button
                type="button"
                onClick={() => setMessageLoadAttempt((attempt) => attempt + 1)}
                className="rounded-lg bg-[var(--chat-surface-hover)] px-3 py-1.5 text-xs text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-accent-primary)]/10"
              >
                {t('interface.tryAgain', 'Try again')}
              </button>
            </div>
          ) : hasMessages && activeConversationId ? (
            <MessageList
              conversationId={activeConversationId}
              onArtifactClick={handleArtifactClick}
              artifactProjections={artifactProjections}
              showProvenanceFooter={showProvenanceFooter}
              onContinueGeneration={
                runtime?.supportsContinueGeneration ? continueGeneration : undefined
              }
              onRegenerateMessage={runtime?.deleteMessages ? regenerate : undefined}
              onEditMessage={runtime?.deleteMessages ? editAndResend : undefined}
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

        {/* Input area, ALWAYS at bottom in natural document flow.
            Never position:fixed. Never teleported. */}
        <div className="shrink-0 px-4 pb-2">
          {/*
            Running-low warning, attached ABOVE the composer.
            Usage was previously visible only in Settings, so the first signal a
            user got was a refused message mid-task. This sits where they are
            already looking and where both reference products put it; a toast
            would disappear and a settings meter is somewhere the user is not.
            Rendered outside the composerSlot branch so a host supplying its own
            composer still gets the warning.
          */}
          <UsageWarningBanner
            warning={usageWarning ?? null}
            {...(onUpgradeUsage ? { onUpgrade: onUpgradeUsage } : {})}
            {...(onDismissUsageWarning ? { onDismiss: onDismissUsageWarning } : {})}
          />
          {composerSlot !== undefined ? (
            composerSlot
          ) : (
            <>
              <ChatInput
                onSend={handleSend}
                onStop={stopGeneration}
                onModelSelectorClick={onModelSelectorClickProp}
                allowModelFallbackModels={allowModelFallbackModels}
                supportsAgentControl={runtime?.supportsAgentControl !== false}
                supportsReasoningEffort={
                  runtime?.supportsReasoningEffort ?? runtime?.supportsAgentControl !== false
                }
                hostControls={composerHostControls}
                sendShortcut={composerSendShortcut}
                composerEditorMode={composerEditorMode}
                skills={skills}
                suggestSkills={suggestSkills}
                onSelectFolder={onSelectFolderProp ? handleSelectFolder : undefined}
                onRecordSkill={onRecordSkill}
                currentFolderLabel={currentFolderLabel}
                onClearFolder={onClearFolder}
                projectPicker={projectPicker}
                canUseAgiWork={canUseAgiWork}
                agiWorkUnavailableReason={agiWorkUnavailableReason}
                isStreamingOverride={isStreaming}
                hasMessages={hasMessages}
                disabled={!runtime}
                disabledMessage="Connect to start chatting"
                conversationId={activeConversationId}
                projectId={projectPicker?.activeProjectId ?? null}
                supportsCodeExecution={runtime?.supportsCodeExecution ?? false}
                supportsResearch={runtime?.supportsResearch ?? false}
                supportsImageGeneration={runtime?.supportsImageGeneration ?? false}
                supportsVideoGeneration={runtime?.supportsVideoGeneration ?? false}
                supportsExplicitLocalWebSearch={runtime?.supportsExplicitLocalWebSearch ?? false}
                attachmentPolicy={runtime?.attachmentPolicy}
                pendingAttachments={pendingAttachments}
                attachmentContextKey={attachmentContextKey}
                voiceInputController={voiceInputController}
                slashCommandHost={slashCommandHost}
              />
              {/* The sample-prompt mode chips that used to sit here were removed
                  on every surface (founder 2026-08-06), web, desktop, and
                  mobile. The empty state is the branded greeting in
                  `emptyStateSlot` and nothing else. */}
              <Disclaimer variant={disclaimerVariant} />
            </>
          )}
        </div>

        {rewindTimelineOpen &&
          activeConversationId &&
          hostBridge?.fetchCodingCheckpoints &&
          hostBridge.rewindCodingCheckpoint && (
            <div className="absolute inset-0 z-50 flex justify-end bg-black/35">
              <section
                className="flex h-full w-full max-w-sm flex-col border-l border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] shadow-2xl"
                aria-label={t('interface.rewindCheckpoints', 'Rewind checkpoints')}
              >
                <header className="flex items-center justify-between border-b border-[var(--chat-border)] px-4 py-3">
                  <h2 className="text-sm font-semibold text-[var(--chat-text-primary)]">
                    {t('interface.rewindCheckpoints', 'Rewind checkpoints')}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setRewindTimelineOpen(false)}
                    className="rounded p-1 text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
                    aria-label={t('interface.closeRewindCheckpoints', 'Close rewind checkpoints')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </header>
                <div className="min-h-0 flex-1">
                  <RewindTimeline
                    conversationId={activeConversationId}
                    fetchCheckpoints={hostBridge.fetchCodingCheckpoints}
                    rewindCheckpoint={hostBridge.rewindCodingCheckpoint}
                  />
                </div>
              </section>
            </div>
          )}
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

          {/* Center: main content, wrapped in ErrorBoundary to catch render errors.
              Hidden when an artifact is open in fullscreen mode. */}
          {!(artifactOpen && artifactMode === 'fullscreen') && (
            <main className="flex flex-1 min-w-0 flex-col overflow-hidden">
              <ChatErrorBoundary>{renderMainContent()}</ChatErrorBoundary>
            </main>
          )}

          {/* Right: artifact panel, only mounted when open (Phase 3).
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

        {/* Search overlay, fallback only. Desktop mounts its own Cmd+K modal. */}
        {enableSearchOverlay && (
          <SearchOverlay open={searchModalOpen} onClose={toggleSearchModal} />
        )}

        {/* Settings modal, shared across desktop & web */}
        <SettingsModal />
      </HostBridgeContext.Provider>
    </RuntimeContext.Provider>
  );
}
