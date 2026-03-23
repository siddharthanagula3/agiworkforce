/**
 * Chat Store
 *
 * Manages conversation state, messages, and chat-related operations.
 * Split from unifiedChatStore for better modularity.
 *
 * Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(immer(...))))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Export selectors for all state slices
 * - subscribeWithSelector for granular subscriptions
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../../lib/tauri-mock';
import { getModelContextWindow } from '../../constants/llm';
import { safeGetJSON, safeSetJSON, storageFallback } from '../../utils/localStorage';
import { useAppModeStore } from '../appModeStore';
import {
  getCloudConversations,
  createCloudConversation,
  deleteCloudConversation,
  getCloudMessages,
} from '../../services/cloudChat';
import type {
  EnhancedMessage,
  ConversationSummary,
  PendingUserMessage,
  Citation,
  TokenUsage,
  FocusMode,
  ActiveView,
  ConversationMode,
  InlinePanel,
  InlinePanelContent,
  MessageReaction,
  BranchSummary,
} from './types';
import { DEFAULT_BRANCH_ID } from './types';

// Re-export types for backwards compatibility
export type {
  EnhancedMessage,
  ConversationSummary,
  PendingUserMessage,
  Citation,
  TokenUsage,
  FocusMode,
  ActiveView,
  ConversationMode,
  MessageMetadata,
  Attachment,
  Operation,
  MessageReaction,
  InlinePanel,
  InlinePanelContent,
  SlashCommandMetadata,
  BranchSummary,
} from './types';

function isCloudMode(): boolean {
  return useAppModeStore.getState().mode === 'cloud';
}

/**
 * Backend Conversation type from Tauri/SQLite
 * Maps to the Rust Conversation struct in data/db/models.rs
 */
interface BackendConversation {
  id: number;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/**
 * Converts a backend conversation from the Rust/SQLite layer to the frontend ConversationSummary.
 * Also registers the id mapping so messages can be loaded later.
 */
function convertBackendConversation(conv: BackendConversation): ConversationSummary {
  const uuid = dbIdToUuid(conv.id);
  return {
    id: uuid,
    title: conv.title,
    pinned: false,
    lastMessage: '',
    updatedAt: new Date(conv.updated_at),
  };
}

/**
 * Backend Message type from Tauri/SQLite
 * Maps to the Rust Message struct in data/db/models.rs
 */
interface BackendMessage {
  id: number;
  conversation_id: number;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens: number | null;
  cost: number | null;
  provider: string | null;
  model: string | null;
  created_at: string;
}

/**
 * Converts a backend message from the Rust/SQLite layer to the frontend EnhancedMessage format.
 * Maps snake_case fields to camelCase and transforms timestamps from ISO strings to Date objects.
 *
 * @param msg - The raw message from the Tauri backend (matches Rust Message struct)
 * @returns An EnhancedMessage suitable for React components and Zustand state
 */
function convertBackendMessage(msg: BackendMessage): EnhancedMessage {
  return {
    id: msg.id.toString(),
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.created_at),
    metadata: {
      model: msg.model ?? undefined,
      provider: msg.provider ?? undefined,
      cost: msg.cost ?? undefined,
      tokenCount: msg.tokens ?? undefined,
    },
  };
}

// ID mapping for conversation persistence
interface IdMapping {
  dbIdToUuid: Record<number, string>;
  uuidToDbId: Record<string, number>;
}

// STR-002 fix: Cap maximum mappings to prevent unbounded memory growth
const MAX_ID_MAPPINGS = 1000;

let idMappings: IdMapping = { dbIdToUuid: {}, uuidToDbId: {} };

if (typeof window !== 'undefined') {
  idMappings = safeGetJSON<IdMapping>('id-mappings', { dbIdToUuid: {}, uuidToDbId: {} });
}

let _persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistIdMappings() {
  if (typeof window === 'undefined') return;
  // Debounce: batch rapid-fire ID mappings (e.g. during streaming) into a single write
  if (_persistTimer !== null) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    const success = safeSetJSON('id-mappings', idMappings);
    if (!success) {
      console.warn('[ChatStore] Failed to persist ID mappings - using in-memory only');
    }
  }, 300);
}

/**
 * Prunes the ID mapping cache when it exceeds MAX_ID_MAPPINGS (1000 entries).
 * Removes the oldest entries (by database ID) to prevent unbounded memory growth.
 * Called automatically after each new mapping is created.
 *
 * @internal
 */
function pruneIdMappingsIfNeeded() {
  const dbIds = Object.keys(idMappings.dbIdToUuid).map(Number);
  if (dbIds.length <= MAX_ID_MAPPINGS) return;

  // Sort by dbId (ascending) and remove oldest entries
  dbIds.sort((a, b) => a - b);
  const toRemove = dbIds.slice(0, dbIds.length - MAX_ID_MAPPINGS);

  for (const dbId of toRemove) {
    const uuid = idMappings.dbIdToUuid[dbId];
    if (uuid) {
      delete idMappings.uuidToDbId[uuid];
    }
    delete idMappings.dbIdToUuid[dbId];
  }
}

/**
 * Converts a database ID to a UUID, creating a new mapping if one does not exist.
 * UUIDs are used in the frontend for React keys and URL routing while database IDs
 * are used for backend persistence.
 *
 * @param dbId - The numeric database ID from SQLite
 * @returns A UUID string, either existing or newly generated
 */
export function dbIdToUuid(dbId: number): string {
  if (!idMappings.dbIdToUuid[dbId]) {
    const uuid = crypto.randomUUID();
    idMappings.dbIdToUuid[dbId] = uuid;
    idMappings.uuidToDbId[uuid] = dbId;
    pruneIdMappingsIfNeeded();
    persistIdMappings();
  }
  return idMappings.dbIdToUuid[dbId]!;
}

/**
 * Looks up the database ID for a given UUID.
 * Returns undefined if no mapping exists (e.g., for new unsaved conversations).
 *
 * @param uuid - The frontend UUID to look up
 * @returns The corresponding database ID, or undefined if not found
 */
export function uuidToDbId(uuid: string): number | undefined {
  return idMappings.uuidToDbId[uuid];
}

/**
 * Clears all ID mappings from memory and localStorage.
 * Called during logout to ensure user data isolation between sessions.
 */
export function clearIdMappings() {
  idMappings = { dbIdToUuid: {}, uuidToDbId: {} };
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('id-mappings');
    } catch {
      // Ignore localStorage errors
    }
  }
}

/**
 * Generates a conversation title from the user's first message content.
 * Strips markdown formatting, code blocks, and special characters, then
 * truncates to 50 characters with word-boundary awareness.
 *
 * @param content - The raw message content (may contain markdown)
 * @returns A clean, truncated title string (max 50 chars)
 *
 * @example
 * generateTitleFromMessage('Can you help me fix this `bug`?')
 * // Returns: 'Can you help me fix this bug?'
 */
function generateTitleFromMessage(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, '') // strip fenced code blocks (must run first)
    .replace(/`[^`]+`/g, '') // strip inline code (must run before char-stripping)
    .replace(/[#*_~[\](){}|\n]+/g, ' ') // markdown punctuation + newlines → space (combined)
    .replace(/\s+/g, ' ') // collapse runs of whitespace
    .trim();

  if (!cleaned) return 'New conversation';

  const maxLength = 50;
  if (cleaned.length <= maxLength) return cleaned;

  const truncated = cleaned.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 30) {
    return truncated.slice(0, lastSpace) + '...';
  }
  return truncated + '...';
}

// Storage version for migrations
const STORAGE_VERSION = 1;

/**
 * Atomic dedup guard for tool timeline entries.
 * Tracks recently added (messageId:entryId) pairs to prevent duplicate pushes
 * when rapid Tauri events cause overlapping set() calls.
 * Entries are cleaned up after 10 seconds to avoid unbounded growth.
 */
const _recentTimelineIds = new Set<string>();

// ToolLabelEntry is now defined in @agiworkforce/types and re-exported here.
import type { ToolLabelEntry } from '@agiworkforce/types';
export type { ToolLabelEntry };

export interface ChatState {
  // Conversation management
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  messagesByConversation: Record<string, EnhancedMessage[]>;
  messages: EnhancedMessage[];

  // Loading states
  isLoading: boolean;
  isLoadingMessages: boolean;
  isStreaming: boolean;
  currentStreamingMessageId: string | null;

  // Pending messages for mid-task input
  pendingMessages: PendingUserMessage[];

  // Citations and token tracking
  citations: Citation[];
  tokenUsage: TokenUsage;

  // UI state
  focusMode: FocusMode;
  activeView: ActiveView;
  conversationMode: ConversationMode;
  draftContent: string;
  editingMessageId: string | null;
  showMessageTimestamps: boolean;
  selectedMessage: string | null;

  // Tool timeline: per-message list of tool executions (for ToolTimeline component)
  toolTimelineByMessage: Record<string, ToolLabelEntry[]>;

  // Thinking content: per-message accumulated thinking/reasoning text (for ThinkingBlock component)
  thinkingByMessage: Record<string, string>;

  // Agentic loop status (updated by tool event listener)
  agenticLoopStatus: {
    active: boolean;
    conversationId: number | null;
    iteration: number;
    maxIterations: number;
  } | null;

  // Actions - Conversation management
  ensureActiveConversation: () => void;
  createConversation: (title?: string, options?: { incognito?: boolean }) => string;
  selectConversation: (id: string) => void;
  loadConversations: (userId: string) => Promise<void>;
  loadConversationMessages: (id: string, userId: string) => Promise<void>;
  setConversationMessages: (id: string, messages: EnhancedMessage[]) => void;
  renameConversation: (id: string, title: string) => void;
  setConversationCustomInstructions: (id: string, instructions: string) => void;
  getConversationCustomInstructions: (id?: string) => string | undefined;
  deleteConversation: (id: string) => void;
  togglePinnedConversation: (id: string) => void;
  archiveConversation: (id: string) => void;
  restoreConversation: (id: string) => void;
  getArchivedConversations: () => ConversationSummary[];
  getConversationsByProject: (projectId: string) => ConversationSummary[];
  setConversationProject: (conversationId: string, projectId: string | null) => void;
  setConversationModel: (conversationId: string, model: string | null) => void;
  exportConversationToMarkdown: (id?: string) => string;

  // Actions - Message management
  addMessage: (message: Omit<EnhancedMessage, 'id' | 'timestamp'> & { id?: string }) => string;
  addOptimisticMessage: (message: Omit<EnhancedMessage, 'id' | 'timestamp'>) => string;
  confirmOptimisticMessage: (tempId: string, confirmedId?: string) => void;
  failOptimisticMessage: (tempId: string, error: string) => void;
  retryFailedMessage: (id: string) => void;
  updateMessage: (id: string, updates: Partial<EnhancedMessage>) => void;
  deleteMessage: (id: string) => void;
  editMessage: (messageId: string, newContent: string) => void;
  editAndRegenerateFromMessage: (messageId: string, newContent: string) => void;
  getMessagesAfter: (messageId: string) => EnhancedMessage[];

  // Actions - Streaming
  setIsLoading: (loading: boolean) => void;
  setLoadingMessages: (loading: boolean) => void;
  setStreamingMessage: (id: string | null) => void;
  appendToStreamingMessage: (content: string) => void;

  // Actions - Inline panels
  addInlinePanel: (messageId: string, panel: InlinePanel) => void;
  updateInlinePanel: (
    messageId: string,
    panelId: string,
    content: Partial<InlinePanelContent>,
  ) => void;
  toggleInlinePanelCollapse: (messageId: string, panelId: string) => void;

  // Actions - Pending messages
  addPendingMessage: (message: PendingUserMessage) => void;
  removePendingMessage: (id: string) => void;
  clearPendingMessages: () => void;
  getPendingMessagesCount: () => number;

  // Actions - Citations
  addCitation: (citation: Omit<Citation, 'id' | 'timestamp'>) => void;
  getCitationByIndex: (index: number) => Citation | undefined;
  clearCitations: () => void;

  // Actions - Token usage
  updateTokenUsage: (usage: Partial<TokenUsage>) => void;
  getTokenPercentage: () => number;

  // Actions - UI state
  setFocusMode: (mode: FocusMode) => void;
  setActiveView: (view: ActiveView) => void;
  setConversationMode: (mode: ConversationMode) => void;
  setDraftContent: (value: string) => void;
  startEditingMessage: (id: string, content: string) => void;
  cancelEditing: () => void;
  setSelectedMessage: (id: string | null) => void;
  toggleMessageTimestamps: () => void;
  toggleMessageBookmark: (messageId: string) => void;
  toggleMessageReaction: (messageId: string, reaction: MessageReaction) => void;
  getBookmarkedMessages: () => EnhancedMessage[];
  getConversationStats: (id?: string) => {
    messageCount: number;
    userMessages: number;
    assistantMessages: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };

  // Actions - Tool timeline
  addToolTimelineEntry: (messageId: string, entry: ToolLabelEntry) => void;
  updateToolTimelineEntry: (
    messageId: string,
    entryId: string,
    updates: Partial<ToolLabelEntry>,
  ) => void;

  // Actions - Thinking content
  appendThinkingContent: (messageId: string, delta: string) => void;
  clearThinkingContent: (messageId: string) => void;

  // Actions - Agentic loop status
  setAgenticLoopStatus: (status: ChatState['agenticLoopStatus']) => void;

  // Branch state
  activeBranchId: string;
  branches: BranchSummary[];

  // Actions - Branching
  loadBranches: (conversationId: number) => Promise<void>;
  switchBranch: (conversationId: number, branchId: string) => Promise<void>;
  forkAndRegenerate: (
    conversationId: number,
    messageId: number,
    newContent: string,
  ) => Promise<void>;
  deleteBranch: (conversationId: number, branchId: string) => Promise<void>;

  // Actions - Backend-wired chat commands
  /** Fetch a single conversation from the backend by its database ID */
  getConversationFromBackend: (dbId: number, userId: string) => Promise<BackendConversation | null>;
  /** Create a conversation in the backend and link the ID mapping */
  createConversationInBackend: (
    title: string,
    userId: string,
  ) => Promise<BackendConversation | null>;
  /** Persist a conversation title rename to the backend */
  renameConversationInBackend: (dbId: number, title: string, userId: string) => Promise<boolean>;
  /** Persist a message to the backend */
  createMessageInBackend: (params: {
    conversationId: number;
    userId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    tokens?: number;
    cost?: number;
  }) => Promise<BackendMessage | null>;
  /** Update a message's content in the backend */
  updateMessageInBackend: (messageDbId: number, content: string) => Promise<BackendMessage | null>;
  /** Delete a message from the backend */
  deleteMessageFromBackend: (messageDbId: number) => Promise<boolean>;
  /** Get conversation stats from the backend (token counts, cost) */
  getConversationStatsFromBackend: (
    conversationDbId: number,
  ) => Promise<BackendConversationStats | null>;
  /** Full-text search across all chat messages (FTS5/BM25) */
  searchChatHistory: (query: string, limit?: number) => Promise<ChatSearchResult[]>;
  /** Semantic search across all chat messages (FTS5 + TF-IDF reranking) */
  searchChatHistorySemantic: (query: string, limit?: number) => Promise<ChatSearchResult[]>;
  /** Search past conversations by keyword with conversation context */
  searchPastConversations: (
    query: string,
    limit?: number,
    conversationId?: number,
  ) => Promise<ConversationSearchResult[]>;
  /** Get the N most recently updated conversations with message counts */
  getRecentConversations: (limit?: number) => Promise<ConversationSearchResult[]>;
  /** Export a conversation to markdown via the backend */
  exportConversationFromBackend: (
    conversationDbId: number,
    format?: string,
  ) => Promise<string | null>;
  /** Get cost overview (today, month, budget) */
  getCostOverview: (userId: string) => Promise<CostOverviewResponse | null>;
  /** Get cost analytics with timeseries, provider breakdown, and top conversations */
  getCostAnalytics: (
    userId: string,
    days?: number,
    provider?: string,
    model?: string,
  ) => Promise<CostAnalyticsResponse | null>;
  /** Compact context for a conversation to reduce token usage */
  compactContext: (
    conversationDbId: number,
    userId: string,
    focus?: string,
  ) => Promise<ContextCompactionResponse | null>;

  // Stream watchdog for inactivity detection
  lastStreamActivityAt: number | null;
  streamWatchdogTimerId: ReturnType<typeof setTimeout> | null;

  // Actions - Stream watchdog
  markStreamActivity: () => void;
  startStreamWatchdog: () => void;
  stopStreamWatchdog: () => void;
  handleStreamInactivityTimeout: () => void;

  // Actions - Clear/export
  clearHistory: () => void;
  exportConversation: () => Promise<string>;
  linkConversationId: (uuid: string, dbId: number) => void;
  resetOnLogout: () => void;
}

// === Backend response types for wired commands ===

/** Search result from FTS5/BM25 or semantic search */
export interface ChatSearchResult {
  messageId: number;
  conversationId: number;
  conversationTitle: string | null;
  contentSnippet: string;
  role: string;
  createdAt: string;
  rank: number;
}

/** Conversation search result from search_past_conversations / get_recent_conversations */
export interface ConversationSearchResult {
  conversationId: number;
  title: string;
  messageCount: number;
  lastUpdated: string;
  snippet?: string;
  score?: number;
}

/** Backend conversation stats */
export interface BackendConversationStats {
  messageCount: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

/** Cost overview response */
export interface CostOverviewResponse {
  todayTotal: number;
  monthTotal: number;
  monthlyBudget: number | null;
  remainingBudget: number | null;
}

/** Cost analytics response */
export interface CostAnalyticsResponse {
  timeseries: Array<{ date: string; cost: number; tokens: number }>;
  providers: Array<{ provider: string; totalCost: number; messageCount: number }>;
  topConversations: Array<{ conversationId: number; title: string; totalCost: number }>;
}

/** Context compaction response */
export interface ContextCompactionResponse {
  messagesCompacted: number;
  tokensBefore: number;
  tokensAfter: number;
  savingsPercent: number;
  summaryCreated: boolean;
  focus: string | null;
  message: string;
}

/**
 * Resolve the context window size for the currently selected model.
 * Uses a lazy import of modelStore to avoid circular dependencies.
 */
function getActiveModelContextWindow(): number {
  try {
    // Lazy require to avoid circular import at module load time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useModelStore } = require('../modelStore') as {
      useModelStore: { getState: () => { selectedModel: string | null } };
    };
    const selectedModel = useModelStore.getState().selectedModel;
    if (selectedModel) {
      return getModelContextWindow(selectedModel);
    }
  } catch {
    // modelStore not yet initialized — use default
  }
  return 128_000;
}

export const useChatStore = create<ChatState>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          // Initial state
          conversations: [],
          activeConversationId: null,
          messagesByConversation: {},
          messages: [],
          isLoading: false,
          isLoadingMessages: false,
          isStreaming: false,
          currentStreamingMessageId: null,
          pendingMessages: [] as PendingUserMessage[],
          citations: [],
          tokenUsage: {
            current: 0,
            inputTokens: 0,
            outputTokens: 0,
            max: getActiveModelContextWindow(),
            percentage: 0,
            estimatedCost: 0,
          },
          focusMode: null,
          activeView: 'chat',
          conversationMode: 'auto',
          draftContent: '',
          editingMessageId: null,
          showMessageTimestamps: true,
          selectedMessage: null,
          toolTimelineByMessage: {},
          thinkingByMessage: {},
          agenticLoopStatus: null,
          activeBranchId: DEFAULT_BRANCH_ID,
          branches: [] as BranchSummary[],
          lastStreamActivityAt: null as number | null,
          streamWatchdogTimerId: null as ReturnType<typeof setTimeout> | null,

          // Conversation management
          ensureActiveConversation: () =>
            set(
              (state) => {
                if (state.activeConversationId) {
                  const existing = state.messagesByConversation[state.activeConversationId];
                  if (existing && state.messages.length === 0) {
                    state.messages = existing.slice();
                  }
                  return;
                }
                const id = crypto.randomUUID();
                const created: ConversationSummary = {
                  id,
                  title: 'New chat',
                  pinned: false,
                  lastMessage: '',
                  updatedAt: new Date(),
                };
                state.conversations.unshift(created);
                state.activeConversationId = id;
                state.messagesByConversation[id] = [];
                state.messages = [];
              },
              undefined,
              'chat/ensureActiveConversation',
            ),

          createConversation: (title = 'New chat', options) => {
            const id = crypto.randomUUID();
            set(
              (state) => {
                const convo: ConversationSummary = {
                  id,
                  title,
                  pinned: false,
                  lastMessage: '',
                  updatedAt: new Date(),
                  ...(options?.incognito ? { incognito: true } : {}),
                };
                state.conversations.unshift(convo);

                if (isCloudMode()) {
                  // Async: create in cloud, remap temp ID to real cloud ID on success
                  createCloudConversation(title)
                    .then((cloudConvo) => {
                      set(
                        (s) => {
                          const idx = s.conversations.findIndex((c) => c.id === id);
                          if (idx !== -1) {
                            s.conversations[idx]!.id = cloudConvo.id;
                          }
                          // Remap messagesByConversation key
                          if (s.messagesByConversation[id]) {
                            s.messagesByConversation[cloudConvo.id] = s.messagesByConversation[id]!;
                            delete s.messagesByConversation[id];
                          }
                          if (s.activeConversationId === id) {
                            s.activeConversationId = cloudConvo.id;
                          }
                        },
                        undefined,
                        'chat/createConversation/cloud/remap',
                      );
                    })
                    .catch((error) => {
                      console.error('[ChatStore] Failed to create cloud conversation:', error);
                      // Rollback: remove optimistic entry
                      set(
                        (s) => {
                          s.conversations = s.conversations.filter((c) => c.id !== id);
                          delete s.messagesByConversation[id];
                          if (s.activeConversationId === id) {
                            const next = s.conversations[0];
                            s.activeConversationId = next ? next.id : null;
                            s.messages = next ? (s.messagesByConversation[next.id] ?? []) : [];
                          }
                        },
                        undefined,
                        'chat/createConversation/cloud/rollback',
                      );
                    });
                }
                // AUDIT-006-012 fix: Cap active conversations at 500
                if (state.conversations.length > 500) {
                  // Remove oldest non-pinned, non-active conversations.
                  // After unshift(), conversations are newest-first, so oldest entries are at the
                  // tail. slice(length - excess) takes from the end = the oldest conversations.
                  const nonPinned = state.conversations.filter((c) => !c.pinned && c.id !== id);
                  const excess = state.conversations.length - 500;
                  const removeCount = Math.min(excess, nonPinned.length);
                  const toRemove = nonPinned.slice(nonPinned.length - removeCount);
                  for (const conv of toRemove) {
                    delete state.messagesByConversation[conv.id];
                  }
                  state.conversations = state.conversations.filter(
                    (c) => c.pinned || c.id === id || !toRemove.some((r) => r.id === c.id),
                  );
                }
                state.activeConversationId = id;
                state.messagesByConversation[id] = [];
                state.messages = [];
                state.isStreaming = false;
                state.currentStreamingMessageId = null;
              },
              undefined,
              'chat/createConversation',
            );
            return id;
          },

          selectConversation: (id: string) =>
            set(
              (state) => {
                if (state.activeConversationId === id) return;
                state.activeConversationId = id;
                const cachedMessages = state.messagesByConversation[id];
                // If messages are cached, use them; otherwise show loading state
                // The caller should then call loadConversationMessages to fetch from backend
                if (cachedMessages && cachedMessages.length > 0) {
                  state.messages = cachedMessages.slice();
                  state.isLoadingMessages = false;
                } else {
                  state.messages = [];
                  // Set loading state - caller should fetch messages from backend
                  state.isLoadingMessages = true;
                }
                state.isStreaming = false;
                state.currentStreamingMessageId = null;
              },
              undefined,
              'chat/selectConversation',
            ),

          loadConversations: async (userId: string) => {
            if (!userId) {
              console.warn('[ChatStore] loadConversations called without userId');
              return;
            }

            if (isCloudMode()) {
              try {
                const cloudConversations = await getCloudConversations();
                const converted: ConversationSummary[] = cloudConversations.map((c) => ({
                  id: c.id,
                  title: c.title ?? 'Untitled',
                  pinned: false,
                  lastMessage: '',
                  updatedAt: new Date(c.updated_at),
                  createdAt: new Date(c.created_at),
                  messageCount: c.message_count ?? 0,
                }));
                set(
                  (state) => {
                    state.conversations = converted;
                    if (!state.activeConversationId && converted.length > 0) {
                      state.activeConversationId = converted[0]!.id;
                    }
                  },
                  undefined,
                  'chat/loadConversations/cloud/success',
                );
              } catch (error) {
                console.error('[ChatStore] Failed to load cloud conversations:', error);
              }
              return;
            }

            try {
              const backendConversations = await invoke<BackendConversation[]>(
                'chat_get_conversations',
                { userId },
              );

              const converted = backendConversations.map(convertBackendConversation);

              set(
                (state) => {
                  // Merge with any local-only (unsaved) conversations that have no db mapping
                  const localOnly = state.conversations.filter(
                    (c) => !converted.some((bc) => bc.id === c.id),
                  );
                  state.conversations = [...converted, ...localOnly];
                  // Set first conversation active if none is currently selected
                  if (!state.activeConversationId && converted.length > 0) {
                    state.activeConversationId = converted[0]!.id;
                  }
                },
                undefined,
                'chat/loadConversations/success',
              );
            } catch (error) {
              console.error('[ChatStore] Failed to load conversations:', error);
            }
          },

          loadConversationMessages: async (id: string, userId: string) => {
            if (isCloudMode()) {
              set(
                (s) => {
                  s.isLoadingMessages = true;
                },
                undefined,
                'chat/loadConversationMessages/cloud/start',
              );

              try {
                const cloudMessages = await getCloudMessages(id);
                const enhancedMessages: EnhancedMessage[] = cloudMessages.map((m) => ({
                  id: m.id,
                  role: m.role as 'user' | 'assistant' | 'system',
                  content: m.content,
                  timestamp: new Date(m.created_at),
                  metadata: {
                    model: m.model ?? undefined,
                    provider: m.provider ?? undefined,
                    tokenCount: m.token_count ?? undefined,
                    cost: m.cost ?? undefined,
                  },
                }));

                set(
                  (s) => {
                    s.messagesByConversation[id] = enhancedMessages;
                    if (s.activeConversationId === id) {
                      s.messages = enhancedMessages;
                    }
                    s.isLoadingMessages = false;
                  },
                  undefined,
                  'chat/loadConversationMessages/cloud/success',
                );
              } catch (error) {
                console.error('[ChatStore] Failed to load cloud messages:', error);
                set(
                  (s) => {
                    s.isLoadingMessages = false;
                  },
                  undefined,
                  'chat/loadConversationMessages/cloud/error',
                );
              }
              return;
            }

            // Get the database ID from the UUID mapping
            const dbId = uuidToDbId(id);
            if (!dbId) {
              console.warn('[ChatStore] No database ID found for conversation:', id);
              set(
                (s) => {
                  s.isLoadingMessages = false;
                },
                undefined,
                'chat/loadConversationMessages/noDbId',
              );
              return;
            }

            set(
              (s) => {
                s.isLoadingMessages = true;
              },
              undefined,
              'chat/loadConversationMessages/start',
            );

            try {
              const backendMessages = await invoke<BackendMessage[]>('chat_get_messages', {
                conversationId: dbId,
                userId: userId,
              });

              const enhancedMessages = backendMessages.map(convertBackendMessage);

              set(
                (s) => {
                  s.messagesByConversation[id] = enhancedMessages;
                  // Only update current messages if this is still the active conversation
                  if (s.activeConversationId === id) {
                    s.messages = enhancedMessages;
                  }
                  s.isLoadingMessages = false;
                },
                undefined,
                'chat/loadConversationMessages/success',
              );
            } catch (error) {
              console.error('[ChatStore] Failed to load messages:', error);
              set(
                (s) => {
                  s.isLoadingMessages = false;
                },
                undefined,
                'chat/loadConversationMessages/error',
              );
            }
          },

          setConversationMessages: (id: string, messages: EnhancedMessage[]) =>
            set(
              (state) => {
                state.messagesByConversation[id] = messages;
                // Update current messages if this is the active conversation
                if (state.activeConversationId === id) {
                  state.messages = messages.slice();
                }
                state.isLoadingMessages = false;
              },
              undefined,
              'chat/setConversationMessages',
            ),

          renameConversation: (id: string, title: string) =>
            set(
              (state) => {
                const convo = state.conversations.find((c) => c.id === id);
                if (convo) {
                  convo.title = title.trim() || convo.title;
                  convo.updatedAt = new Date();
                }
              },
              undefined,
              'chat/renameConversation',
            ),

          setConversationCustomInstructions: (id: string, instructions: string) =>
            set(
              (state) => {
                const convo = state.conversations.find((c) => c.id === id);
                if (convo) {
                  convo.customInstructions = instructions;
                  convo.updatedAt = new Date();
                }
              },
              undefined,
              'chat/setConversationCustomInstructions',
            ),

          getConversationCustomInstructions: (id?: string) => {
            const state = get();
            const targetId = id ?? state.activeConversationId;
            if (!targetId) return undefined;
            const convo = state.conversations.find((c) => c.id === targetId);
            return convo?.customInstructions;
          },

          deleteConversation: (id: string) => {
            // Optimistically remove from local state immediately
            set(
              (state) => {
                // Prune tool timeline entries for messages in this conversation
                const msgs = state.messagesByConversation[id];
                if (msgs) {
                  for (const msg of msgs) {
                    delete state.toolTimelineByMessage[msg.id];
                  }
                }
                state.conversations = state.conversations.filter((c) => c.id !== id);
                delete state.messagesByConversation[id];
                if (state.activeConversationId === id) {
                  const next = state.conversations[0];
                  state.activeConversationId = next ? next.id : null;
                  state.messages = next ? (state.messagesByConversation[next.id] ?? []) : [];
                }
              },
              undefined,
              'chat/deleteConversation',
            );

            if (isCloudMode()) {
              deleteCloudConversation(id).catch((error) => {
                console.error('[ChatStore] Failed to delete cloud conversation:', error);
              });
              return;
            }

            // Persist deletion to the backend if a database record exists for this conversation
            const dbId = uuidToDbId(id);
            if (dbId !== undefined) {
              // Resolve userId lazily to avoid circular imports at module load time
              import('../auth')
                .then(({ useUnifiedAuthStore }) => {
                  const userId = useUnifiedAuthStore.getState().user?.id ?? '';
                  if (!userId) return;
                  return invoke('chat_delete_conversation', { id: dbId, userId });
                })
                .catch((error) => {
                  console.error('[ChatStore] Failed to delete conversation from backend:', error);
                });
            }
          },

          togglePinnedConversation: (id: string) =>
            set(
              (state) => {
                const convo = state.conversations.find((c) => c.id === id);
                if (convo) {
                  convo.pinned = !convo.pinned;
                  convo.updatedAt = new Date();
                }
              },
              undefined,
              'chat/togglePinnedConversation',
            ),

          archiveConversation: (id: string) =>
            set(
              (state) => {
                const convo = state.conversations.find((c) => c.id === id);
                if (convo) {
                  convo.archived = true;
                  convo.pinned = false;
                  convo.updatedAt = new Date();
                  if (state.activeConversationId === id) {
                    const next = state.conversations.find((c) => c.id !== id && !c.archived);
                    state.activeConversationId = next ? next.id : null;
                    state.messages = next ? (state.messagesByConversation[next.id] ?? []) : [];
                  }
                }
              },
              undefined,
              'chat/archiveConversation',
            ),

          restoreConversation: (id: string) =>
            set(
              (state) => {
                const convo = state.conversations.find((c) => c.id === id);
                if (convo) {
                  convo.archived = false;
                  convo.updatedAt = new Date();
                }
              },
              undefined,
              'chat/restoreConversation',
            ),

          getArchivedConversations: () => {
            const state = get();
            return state.conversations.filter((c) => c.archived === true);
          },

          getConversationsByProject: (projectId: string) => {
            const state = get();
            return state.conversations.filter((c) => c.projectId === projectId);
          },

          setConversationProject: (conversationId: string, projectId: string | null) =>
            set(
              (state) => {
                const convo = state.conversations.find((c) => c.id === conversationId);
                if (convo) {
                  convo.projectId = projectId || undefined;
                  convo.updatedAt = new Date();
                }
              },
              undefined,
              'chat/setConversationProject',
            ),

          setConversationModel: (conversationId: string, model: string | null) =>
            set(
              (state) => {
                const convo = state.conversations.find((c) => c.id === conversationId);
                if (convo) {
                  convo.modelOverride = model || undefined;
                  convo.updatedAt = new Date();
                }
              },
              undefined,
              'chat/setConversationModel',
            ),

          exportConversationToMarkdown: (id?: string) => {
            const state = get();
            const targetId = id || state.activeConversationId;
            if (!targetId) return '';

            const convo = state.conversations.find((c) => c.id === targetId);
            const messages = state.messagesByConversation[targetId] || [];

            if (messages.length === 0) return '';

            const title = convo?.title || 'Untitled Conversation';
            const date = convo?.updatedAt
              ? new Date(convo.updatedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : new Date().toLocaleDateString();

            let markdown = `# ${title}\n\n`;
            markdown += `*Exported on ${date}*\n\n---\n\n`;

            for (const msg of messages) {
              const role =
                msg.role === 'user'
                  ? '**You**'
                  : msg.role === 'assistant'
                    ? '**Assistant**'
                    : '**System**';
              const timestamp = new Date(msg.timestamp).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              });

              markdown += `### ${role} *${timestamp}*\n\n`;
              markdown += `${msg.content}\n\n`;

              if (msg.attachments && msg.attachments.length > 0) {
                markdown += `*Attachments: ${msg.attachments.map((a) => a.name).join(', ')}*\n\n`;
              }

              markdown += '---\n\n';
            }

            return markdown;
          },

          // Message management
          addMessage: (message) => {
            const assignedId = message.id ?? crypto.randomUUID();
            set(
              (state) => {
                if (!state.activeConversationId) {
                  const id = crypto.randomUUID();
                  const convo: ConversationSummary = {
                    id,
                    title: 'New chat',
                    pinned: false,
                    lastMessage: '',
                    updatedAt: new Date(),
                  };
                  state.conversations.unshift(convo);
                  state.activeConversationId = id;
                  state.messagesByConversation[id] = [];
                }
                const convoId = state.activeConversationId as string;
                const newMessage: EnhancedMessage = {
                  ...message,
                  id: assignedId,
                  timestamp: new Date(),
                };
                state.messages.push(newMessage);
                if (!state.messagesByConversation[convoId]) {
                  state.messagesByConversation[convoId] = [];
                }
                state.messagesByConversation[convoId]!.push(newMessage);
                // AUDIT-006-013 fix: Cap messages per conversation at 1000.
                // Keep state.messages in sync with the capped array to prevent drift.
                if (state.messagesByConversation[convoId]!.length > 1000) {
                  state.messagesByConversation[convoId] =
                    state.messagesByConversation[convoId]!.slice(-1000);
                  state.messages = state.messagesByConversation[convoId]!.slice();
                } else if (state.messages.length > 1000) {
                  state.messages = state.messages.slice(-1000);
                  state.messagesByConversation[convoId] = state.messages.slice();
                }
                const convo = state.conversations.find((c) => c.id === convoId);
                if (convo) {
                  convo.lastMessage = newMessage.content;
                  convo.updatedAt = newMessage.timestamp;

                  if (
                    convo.title === 'New chat' &&
                    newMessage.role === 'user' &&
                    newMessage.content
                  ) {
                    const generatedTitle = generateTitleFromMessage(newMessage.content);
                    convo.title = generatedTitle;
                  }
                }
              },
              undefined,
              'chat/addMessage',
            );
            return assignedId;
          },

          addOptimisticMessage: (message) => {
            const tempId = crypto.randomUUID();
            set(
              (state) => {
                if (!state.activeConversationId) {
                  const id = crypto.randomUUID();
                  const convo: ConversationSummary = {
                    id,
                    title: 'New chat',
                    pinned: false,
                    lastMessage: '',
                    updatedAt: new Date(),
                  };
                  state.conversations.unshift(convo);
                  state.activeConversationId = id;
                  state.messagesByConversation[id] = [];
                }
                const convoId = state.activeConversationId as string;
                const optimisticMessage: EnhancedMessage = {
                  ...message,
                  id: tempId,
                  timestamp: new Date(),
                  pending: true,
                };
                state.messages.push(optimisticMessage);
                if (!state.messagesByConversation[convoId]) {
                  state.messagesByConversation[convoId] = [];
                }
                state.messagesByConversation[convoId]!.push(optimisticMessage);
                const convo = state.conversations.find((c) => c.id === convoId);
                if (convo) {
                  convo.lastMessage = optimisticMessage.content;
                  convo.updatedAt = optimisticMessage.timestamp;
                }
              },
              undefined,
              'chat/addOptimisticMessage',
            );
            return tempId;
          },

          confirmOptimisticMessage: (tempId, confirmedId) =>
            set(
              (state) => {
                const convoId = state.activeConversationId;
                const applyConfirmation = (list: EnhancedMessage[]) => {
                  const idx = list.findIndex((m) => m.id === tempId);
                  if (idx !== -1 && list[idx]) {
                    delete list[idx]!.pending;
                    delete list[idx]!.error;
                    if (confirmedId) {
                      list[idx]!.id = confirmedId;
                    }
                  }
                };
                applyConfirmation(state.messages);

                if (convoId && state.messagesByConversation[convoId]) {
                  applyConfirmation(state.messagesByConversation[convoId]!);
                }
              },
              undefined,
              'chat/confirmOptimisticMessage',
            ),

          failOptimisticMessage: (tempId, error) =>
            set(
              (state) => {
                const applyFailure = (list: EnhancedMessage[]) => {
                  const idx = list.findIndex((m) => m.id === tempId);
                  if (idx !== -1 && list[idx]) {
                    delete list[idx]!.pending;
                    list[idx]!.error = error;
                  }
                };
                applyFailure(state.messages);
                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId]) {
                  applyFailure(state.messagesByConversation[convoId]!);
                }
              },
              undefined,
              'chat/failOptimisticMessage',
            ),

          retryFailedMessage: (id) =>
            set(
              (state) => {
                const applyRetry = (list: EnhancedMessage[]) => {
                  const idx = list.findIndex((m) => m.id === id);
                  if (idx !== -1 && list[idx]) {
                    delete list[idx]!.error;
                    list[idx]!.pending = true;
                  }
                };
                applyRetry(state.messages);
                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId]) {
                  applyRetry(state.messagesByConversation[convoId]!);
                }
              },
              undefined,
              'chat/retryFailedMessage',
            ),

          updateMessage: (id, updates) =>
            set(
              (state) => {
                const applyUpdate = (list: EnhancedMessage[]) => {
                  const idx = list.findIndex((m) => m.id === id);
                  if (idx !== -1 && list[idx]) {
                    const message = list[idx]!;
                    const mergedUpdates =
                      updates.metadata && message.metadata
                        ? {
                            ...updates,
                            metadata: { ...message.metadata, ...updates.metadata },
                          }
                        : updates;
                    Object.assign(message, mergedUpdates);
                    return true;
                  }
                  return false;
                };

                const updatedInMessages = applyUpdate(state.messages);
                const activeConversationId = state.activeConversationId;
                let updatedInConversation = false;

                if (activeConversationId && state.messagesByConversation[activeConversationId]) {
                  updatedInConversation = applyUpdate(
                    state.messagesByConversation[activeConversationId]!,
                  );
                }

                if (!updatedInConversation) {
                  for (const [convId, messages] of Object.entries(state.messagesByConversation)) {
                    if (!messages || convId === activeConversationId) {
                      continue;
                    }
                    if (applyUpdate(messages)) {
                      updatedInConversation = true;
                      break;
                    }
                  }
                }

                if (!updatedInMessages && activeConversationId && updatedInConversation) {
                  const activeMessages = state.messagesByConversation[activeConversationId];
                  const activeMessageIndex = activeMessages?.findIndex((m) => m.id === id) ?? -1;
                  const stateMessageIndex = state.messages.findIndex((m) => m.id === id);

                  if (activeMessageIndex !== -1 && stateMessageIndex !== -1 && activeMessages) {
                    state.messages[stateMessageIndex] = activeMessages[activeMessageIndex]!;
                  }
                }
              },
              undefined,
              'chat/updateMessage',
            ),

          deleteMessage: (id) =>
            set(
              (state) => {
                state.messages = state.messages.filter((m) => m.id !== id);
                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId]) {
                  state.messagesByConversation[convoId] = state.messagesByConversation[
                    convoId
                  ]!.filter((m) => m.id !== id);
                }
              },
              undefined,
              'chat/deleteMessage',
            ),

          editMessage: (messageId, newContent) =>
            set(
              (state) => {
                const applyEdit = (messages: EnhancedMessage[]) => {
                  const msg = messages.find((m) => m.id === messageId);
                  if (msg && msg.role === 'user') {
                    if (!msg.metadata?.originalContent) {
                      msg.metadata = {
                        ...msg.metadata,
                        originalContent: msg.content,
                      };
                    }
                    msg.content = newContent;
                    msg.metadata = {
                      ...msg.metadata,
                      edited: true,
                      editedAt: new Date(),
                    };
                  }
                };

                applyEdit(state.messages);
                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId]) {
                  applyEdit(state.messagesByConversation[convoId]!);
                }
              },
              undefined,
              'chat/editMessage',
            ),

          editAndRegenerateFromMessage: (messageId, newContent) => {
            // Delegate to forkAndRegenerate when a conversation DB ID is available
            const state = get();
            const convoId = state.activeConversationId;
            const dbId = convoId ? uuidToDbId(convoId) : undefined;
            const msgDbId = uuidToDbId(messageId);

            if (dbId && msgDbId !== undefined) {
              get()
                .forkAndRegenerate(dbId, msgDbId, newContent)
                .catch((err) => {
                  console.error('[ChatStore] Fork failed:', err);
                });
              return;
            }

            // Fallback: local truncation for conversations not yet persisted to DB
            set(
              (s) => {
                const messageIndex = s.messages.findIndex((m) => m.id === messageId);
                if (messageIndex === -1) return;

                const msg = s.messages[messageIndex];
                if (!msg || msg.role !== 'user') return;

                if (!msg.metadata?.originalContent) {
                  msg.metadata = { ...msg.metadata, originalContent: msg.content };
                }
                msg.content = newContent;
                msg.metadata = { ...msg.metadata, edited: true, editedAt: new Date() };
                s.messages = s.messages.slice(0, messageIndex + 1);

                const activeConvoId = s.activeConversationId;
                if (activeConvoId && s.messagesByConversation[activeConvoId]) {
                  const convoMsgs = s.messagesByConversation[activeConvoId]!;
                  const convoMsgIndex = convoMsgs.findIndex((m) => m.id === messageId);
                  if (convoMsgIndex !== -1) {
                    const convoMsg = convoMsgs[convoMsgIndex];
                    if (convoMsg) {
                      if (!convoMsg.metadata?.originalContent) {
                        convoMsg.metadata = {
                          ...convoMsg.metadata,
                          originalContent: convoMsg.content,
                        };
                      }
                      convoMsg.content = newContent;
                      convoMsg.metadata = {
                        ...convoMsg.metadata,
                        edited: true,
                        editedAt: new Date(),
                      };
                    }
                    s.messagesByConversation[activeConvoId] = convoMsgs.slice(0, convoMsgIndex + 1);
                  }
                }
              },
              undefined,
              'chat/editAndRegenerateFromMessage',
            );
          },

          getMessagesAfter: (messageId) => {
            const state = get();
            const messageIndex = state.messages.findIndex((m) => m.id === messageId);
            if (messageIndex === -1) return [];
            return state.messages.slice(messageIndex + 1);
          },

          // Streaming
          setIsLoading: (loading) =>
            set(
              (state) => {
                state.isLoading = loading;
              },
              undefined,
              'chat/setIsLoading',
            ),

          setLoadingMessages: (loading) =>
            set(
              (state) => {
                state.isLoadingMessages = loading;
              },
              undefined,
              'chat/setLoadingMessages',
            ),

          setStreamingMessage: (id) => {
            set(
              (state) => {
                state.currentStreamingMessageId = id;
                state.isStreaming = id !== null;
              },
              undefined,
              'chat/setStreamingMessage',
            );
            // Start or stop the stream watchdog based on streaming state
            if (id !== null) {
              get().startStreamWatchdog();
            } else {
              get().stopStreamWatchdog();
            }
          },

          appendToStreamingMessage: (content) =>
            set(
              (state) => {
                const { currentStreamingMessageId, activeConversationId } = state;
                if (!currentStreamingMessageId) {
                  console.warn(
                    '[chatStore] appendToStreamingMessage called but no streaming message ID set',
                  );
                  return;
                }

                const messageInMessages = state.messages.find(
                  (m) => m.id === currentStreamingMessageId,
                );
                if (messageInMessages) {
                  messageInMessages.content += content;
                } else {
                  console.error(
                    '[chatStore] Streaming message not found in messages array:',
                    currentStreamingMessageId,
                  );
                }

                if (activeConversationId) {
                  // Initialize the key if absent — can happen for a newly created conversation
                  // before any messages have been loaded into messagesByConversation.
                  if (!state.messagesByConversation[activeConversationId]) {
                    state.messagesByConversation[activeConversationId] = [];
                  }
                  const messageInConvo = state.messagesByConversation[activeConversationId]!.find(
                    (m) => m.id === currentStreamingMessageId,
                  );
                  if (messageInConvo) {
                    messageInConvo.content += content;
                  } else {
                    console.error('[chatStore] Streaming message not found in conversation:', {
                      currentStreamingMessageId,
                      activeConversationId,
                    });
                  }
                }
              },
              undefined,
              'chat/appendToStreamingMessage',
            ),

          // Inline panels
          addInlinePanel: (messageId, panel) =>
            set(
              (state) => {
                const applyPanelAdd = (list: EnhancedMessage[]) => {
                  const idx = list.findIndex((m) => m.id === messageId);
                  if (idx !== -1 && list[idx]) {
                    if (!list[idx]!.inlinePanels) {
                      list[idx]!.inlinePanels = [];
                    }
                    list[idx]!.inlinePanels!.push(panel);
                  }
                };
                applyPanelAdd(state.messages);
                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId]) {
                  applyPanelAdd(state.messagesByConversation[convoId]!);
                }
              },
              undefined,
              'chat/addInlinePanel',
            ),

          updateInlinePanel: (messageId, panelId, content) =>
            set(
              (state) => {
                const applyPanelUpdate = (list: EnhancedMessage[]) => {
                  const msgIdx = list.findIndex((m) => m.id === messageId);
                  if (msgIdx !== -1 && list[msgIdx]?.inlinePanels) {
                    const panelIdx = list[msgIdx]!.inlinePanels!.findIndex((p) => p.id === panelId);
                    if (panelIdx !== -1 && list[msgIdx]!.inlinePanels![panelIdx]) {
                      list[msgIdx]!.inlinePanels![panelIdx]!.content = {
                        ...list[msgIdx]!.inlinePanels![panelIdx]!.content,
                        ...content,
                      };
                    }
                  }
                };
                applyPanelUpdate(state.messages);
                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId]) {
                  applyPanelUpdate(state.messagesByConversation[convoId]!);
                }
              },
              undefined,
              'chat/updateInlinePanel',
            ),

          toggleInlinePanelCollapse: (messageId, panelId) =>
            set(
              (state) => {
                const applyToggleCollapse = (list: EnhancedMessage[]) => {
                  const msgIdx = list.findIndex((m) => m.id === messageId);
                  if (msgIdx !== -1 && list[msgIdx]?.inlinePanels) {
                    const panelIdx = list[msgIdx]!.inlinePanels!.findIndex((p) => p.id === panelId);
                    if (panelIdx !== -1 && list[msgIdx]!.inlinePanels![panelIdx]) {
                      list[msgIdx]!.inlinePanels![panelIdx]!.isCollapsed =
                        !list[msgIdx]!.inlinePanels![panelIdx]!.isCollapsed;
                    }
                  }
                };
                applyToggleCollapse(state.messages);
                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId]) {
                  applyToggleCollapse(state.messagesByConversation[convoId]!);
                }
              },
              undefined,
              'chat/toggleInlinePanelCollapse',
            ),

          // Pending messages
          addPendingMessage: (message) =>
            set(
              (state) => {
                const existingIdx = state.pendingMessages.findIndex((m) => m.id === message.id);
                if (existingIdx === -1) {
                  state.pendingMessages.push(message);
                  return;
                }

                // Keep existing ordering while updating fields from the latest payload.
                state.pendingMessages[existingIdx] = {
                  ...state.pendingMessages[existingIdx],
                  ...message,
                };
              },
              undefined,
              'chat/addPendingMessage',
            ),

          removePendingMessage: (id) =>
            set(
              (state) => {
                state.pendingMessages = state.pendingMessages.filter((m) => m.id !== id);
              },
              undefined,
              'chat/removePendingMessage',
            ),

          clearPendingMessages: () =>
            set(
              (state) => {
                state.pendingMessages = [];
              },
              undefined,
              'chat/clearPendingMessages',
            ),

          getPendingMessagesCount: () => get().pendingMessages.length,

          // Citations
          addCitation: (citation) =>
            set(
              (state) => {
                const newCitation: Citation = {
                  id: crypto.randomUUID(),
                  timestamp: new Date(),
                  ...citation,
                };
                state.citations.push(newCitation);
              },
              undefined,
              'chat/addCitation',
            ),

          getCitationByIndex: (index) => {
            const state = get();
            return state.citations.find((c) => c.index === index);
          },

          clearCitations: () =>
            set(
              (state) => {
                state.citations = [];
              },
              undefined,
              'chat/clearCitations',
            ),

          // Token usage
          updateTokenUsage: (usage) =>
            set(
              (state) => {
                state.tokenUsage = { ...state.tokenUsage, ...usage };

                if (state.tokenUsage.max > 0) {
                  state.tokenUsage.percentage =
                    (state.tokenUsage.current / state.tokenUsage.max) * 100;
                }
              },
              undefined,
              'chat/updateTokenUsage',
            ),

          getTokenPercentage: () => {
            const state = get();
            return state.tokenUsage.percentage;
          },

          // UI state
          setFocusMode: (mode) =>
            set(
              (state) => {
                state.focusMode = mode;
              },
              undefined,
              'chat/setFocusMode',
            ),

          setActiveView: (view) =>
            set(
              (state) => {
                state.activeView = view;
              },
              undefined,
              'chat/setActiveView',
            ),

          setConversationMode: (mode) =>
            set(
              (state) => {
                state.conversationMode = mode;
              },
              undefined,
              'chat/setConversationMode',
            ),

          setDraftContent: (value) =>
            set(
              (state) => {
                state.draftContent = value;
              },
              undefined,
              'chat/setDraftContent',
            ),

          startEditingMessage: (id, content) =>
            set(
              (state) => {
                state.editingMessageId = id;
                state.draftContent = content;
              },
              undefined,
              'chat/startEditingMessage',
            ),

          cancelEditing: () =>
            set(
              (state) => {
                state.editingMessageId = null;
                state.draftContent = '';
              },
              undefined,
              'chat/cancelEditing',
            ),

          setSelectedMessage: (id) =>
            set(
              (state) => {
                state.selectedMessage = id;
              },
              undefined,
              'chat/setSelectedMessage',
            ),

          toggleMessageTimestamps: () =>
            set(
              (state) => {
                state.showMessageTimestamps = !state.showMessageTimestamps;
              },
              undefined,
              'chat/toggleMessageTimestamps',
            ),

          toggleMessageBookmark: (messageId) =>
            set(
              (state) => {
                const messageInMessages = state.messages.find((m) => m.id === messageId);
                // Compute the target value once to avoid double-toggle on same proxy object
                const newValue = messageInMessages ? !messageInMessages.bookmarked : undefined;

                if (messageInMessages && newValue !== undefined) {
                  messageInMessages.bookmarked = newValue;
                }

                for (const convoId of Object.keys(state.messagesByConversation)) {
                  const messages = state.messagesByConversation[convoId];
                  if (messages) {
                    const message = messages.find((m) => m.id === messageId);
                    if (message) {
                      message.bookmarked = newValue ?? !message.bookmarked;
                      break;
                    }
                  }
                }
              },
              undefined,
              'chat/toggleMessageBookmark',
            ),

          toggleMessageReaction: (messageId, reaction) =>
            set(
              (state) => {
                // Compute the target action once to avoid double-toggle on same proxy object
                const messageInMessages = state.messages.find((m) => m.id === messageId);
                const shouldAdd = messageInMessages
                  ? !(messageInMessages.reactions ?? []).includes(reaction)
                  : true;

                const applyReaction = (message: EnhancedMessage | undefined) => {
                  if (!message) return;
                  if (!message.reactions) {
                    message.reactions = [];
                  }
                  if (shouldAdd) {
                    if (!message.reactions.includes(reaction)) {
                      message.reactions.push(reaction);
                    }
                  } else {
                    const index = message.reactions.indexOf(reaction);
                    if (index >= 0) {
                      message.reactions.splice(index, 1);
                    }
                  }
                };

                applyReaction(messageInMessages);

                for (const convoId of Object.keys(state.messagesByConversation)) {
                  const messages = state.messagesByConversation[convoId];
                  if (messages) {
                    const message = messages.find((m) => m.id === messageId);
                    if (message) {
                      applyReaction(message);
                      break;
                    }
                  }
                }
              },
              undefined,
              'chat/toggleMessageReaction',
            ),

          getBookmarkedMessages: () => {
            const state = get();
            const bookmarked: EnhancedMessage[] = [];
            for (const convoId of Object.keys(state.messagesByConversation)) {
              const messages = state.messagesByConversation[convoId];
              if (messages) {
                bookmarked.push(...messages.filter((m) => m.bookmarked));
              }
            }
            return bookmarked.sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
            );
          },

          getConversationStats: (id?: string) => {
            const state = get();
            const targetId = id || state.activeConversationId;
            const messages = targetId ? state.messagesByConversation[targetId] || [] : [];

            let userMessages = 0;
            let assistantMessages = 0;
            let inputTokens = 0;
            let outputTokens = 0;
            let totalCost = 0;

            for (const msg of messages) {
              if (msg.role === 'user') userMessages++;
              if (msg.role === 'assistant') assistantMessages++;

              if (msg.metadata) {
                inputTokens += msg.metadata.inputTokens || 0;
                outputTokens += msg.metadata.outputTokens || 0;
                totalCost += msg.metadata.cost || 0;
              }
            }

            return {
              messageCount: messages.length,
              userMessages,
              assistantMessages,
              totalTokens: inputTokens + outputTokens,
              inputTokens,
              outputTokens,
              totalCost,
            };
          },

          // Tool timeline
          addToolTimelineEntry: (messageId, entry) =>
            set(
              (state) => {
                // Atomic dedup guard: check module-level Set BEFORE touching the draft.
                // This prevents duplicate pushes when rapid Tauri events cause
                // overlapping set() calls that both read the same base state.
                const dedupKey = `${messageId}:${entry.id}`;
                if (_recentTimelineIds.has(dedupKey)) return;

                if (!state.toolTimelineByMessage[messageId]) {
                  state.toolTimelineByMessage[messageId] = [];
                }
                const entries = state.toolTimelineByMessage[messageId]!;
                // Secondary dedup: skip if an entry with the same id already exists in draft
                if (entries.some((e) => e.id === entry.id)) return;
                // Cap per-message timeline at 200 entries to prevent unbounded growth
                if (entries.length < 200) {
                  entries.push(entry);
                  // Track in dedup guard and auto-clean after 10s
                  _recentTimelineIds.add(dedupKey);
                  setTimeout(() => _recentTimelineIds.delete(dedupKey), 10_000);
                }
              },
              undefined,
              'chat/addToolTimelineEntry',
            ),

          updateToolTimelineEntry: (messageId, entryId, updates) =>
            set(
              (state) => {
                const entries = state.toolTimelineByMessage[messageId];
                if (!entries) return;
                const idx = entries.findIndex((e) => e.id === entryId);
                if (idx !== -1 && entries[idx]) {
                  entries[idx] = { ...entries[idx]!, ...updates };
                }
              },
              undefined,
              'chat/updateToolTimelineEntry',
            ),

          // Thinking content
          appendThinkingContent: (messageId, delta) =>
            set(
              (state) => {
                state.thinkingByMessage[messageId] =
                  (state.thinkingByMessage[messageId] ?? '') + delta;
              },
              undefined,
              'chat/appendThinkingContent',
            ),

          clearThinkingContent: (messageId) =>
            set(
              (state) => {
                delete state.thinkingByMessage[messageId];
              },
              undefined,
              'chat/clearThinkingContent',
            ),

          // Agentic loop status
          setAgenticLoopStatus: (status) =>
            set(
              (state) => {
                state.agenticLoopStatus = status;
              },
              undefined,
              'chat/setAgenticLoopStatus',
            ),

          // Branching
          loadBranches: async (conversationId: number) => {
            try {
              const branches = await invoke<BranchSummary[]>('conversation_list_branches', {
                conversationId,
              });
              set(
                (state) => {
                  state.branches = branches;
                },
                undefined,
                'chat/loadBranches',
              );
            } catch (error) {
              console.error('[ChatStore] Failed to load branches:', error);
            }
          },

          switchBranch: async (conversationId: number, branchId: string) => {
            // Capture activeConversationId before async to prevent TOCTOU race
            const currentConvoId = get().activeConversationId;
            try {
              const messages = await invoke<BackendMessage[]>('conversation_switch_branch', {
                conversationId,
                branchId,
              });
              const enhanced = messages.map(convertBackendMessage);
              set(
                (state) => {
                  // Only update if the user hasn't switched conversations during the await
                  if (state.activeConversationId !== currentConvoId) return;
                  state.activeBranchId = branchId;
                  state.messages = enhanced;
                  if (currentConvoId) {
                    state.messagesByConversation[currentConvoId] = enhanced;
                  }
                },
                undefined,
                'chat/switchBranch',
              );
            } catch (error) {
              console.error('[ChatStore] Failed to switch branch:', error);
            }
          },

          forkAndRegenerate: async (
            conversationId: number,
            messageId: number,
            newContent: string,
          ) => {
            const currentConvoId = get().activeConversationId;
            try {
              const branchName = `Edit at message ${messageId}`;
              const result = await invoke<{ branch: BranchSummary; messages: BackendMessage[] }>(
                'conversation_fork',
                { conversationId, messageId, branchName },
              );

              const enhanced = result.messages.map(convertBackendMessage);

              // Apply the user's edited content to the last message on the new branch
              if (enhanced.length > 0 && newContent) {
                const lastMsg = enhanced[enhanced.length - 1];
                if (lastMsg && lastMsg.role === 'user') {
                  lastMsg.content = newContent;
                  lastMsg.metadata = {
                    ...lastMsg.metadata,
                    edited: true,
                    editedAt: new Date(),
                  };
                }
              }

              set(
                (state) => {
                  if (state.activeConversationId !== currentConvoId) return;
                  state.branches = [...state.branches, result.branch];
                  state.activeBranchId = result.branch.id;
                  state.messages = enhanced;
                  if (currentConvoId) {
                    state.messagesByConversation[currentConvoId] = enhanced;
                  }
                },
                undefined,
                'chat/forkAndRegenerate',
              );
            } catch (error) {
              console.error('[ChatStore] Failed to fork conversation:', error);
            }
          },

          deleteBranch: async (conversationId: number, branchId: string) => {
            try {
              await invoke('conversation_delete_branch', { conversationId, branchId });
              // If deleting the active branch, switch back to main and reload its messages
              const wasActive = get().activeBranchId === branchId;
              set(
                (state) => {
                  state.branches = state.branches.filter((b) => b.id !== branchId);
                  if (state.activeBranchId === branchId) {
                    state.activeBranchId = DEFAULT_BRANCH_ID;
                  }
                },
                undefined,
                'chat/deleteBranch',
              );
              if (wasActive) {
                await get().switchBranch(conversationId, DEFAULT_BRANCH_ID);
              }
            } catch (error) {
              console.error('[ChatStore] Failed to delete branch:', error);
            }
          },

          // === Backend-wired chat commands ===

          getConversationFromBackend: async (dbId: number, userId: string) => {
            try {
              return await invoke<BackendConversation>('chat_get_conversation', {
                id: dbId,
                userId,
              });
            } catch (error) {
              console.error('[ChatStore] Failed to get conversation from backend:', error);
              return null;
            }
          },

          createConversationInBackend: async (title: string, userId: string) => {
            try {
              const conv = await invoke<BackendConversation>('chat_create_conversation', {
                request: { title, user_id: userId },
              });
              // Link the database ID to the frontend UUID system
              if (conv) {
                dbIdToUuid(conv.id);
              }
              return conv;
            } catch (error) {
              console.error('[ChatStore] Failed to create conversation in backend:', error);
              return null;
            }
          },

          renameConversationInBackend: async (dbId: number, title: string, userId: string) => {
            try {
              await invoke('chat_update_conversation_title', {
                conversationId: dbId,
                title,
                userId,
              });
              return true;
            } catch (error) {
              console.error('[ChatStore] Failed to rename conversation in backend:', error);
              return false;
            }
          },

          createMessageInBackend: async (params) => {
            try {
              return await invoke<BackendMessage>('chat_create_message', {
                request: {
                  conversation_id: params.conversationId,
                  user_id: params.userId,
                  role: params.role,
                  content: params.content,
                  tokens: params.tokens ?? null,
                  cost: params.cost ?? null,
                },
              });
            } catch (error) {
              console.error('[ChatStore] Failed to create message in backend:', error);
              return null;
            }
          },

          updateMessageInBackend: async (messageDbId: number, content: string) => {
            try {
              return await invoke<BackendMessage>('chat_update_message', {
                id: messageDbId,
                content,
              });
            } catch (error) {
              console.error('[ChatStore] Failed to update message in backend:', error);
              return null;
            }
          },

          deleteMessageFromBackend: async (messageDbId: number) => {
            try {
              await invoke('chat_delete_message', { id: messageDbId });
              return true;
            } catch (error) {
              console.error('[ChatStore] Failed to delete message from backend:', error);
              return false;
            }
          },

          getConversationStatsFromBackend: async (conversationDbId: number) => {
            try {
              return await invoke<BackendConversationStats>('chat_get_conversation_stats', {
                conversationId: conversationDbId,
              });
            } catch (error) {
              console.error('[ChatStore] Failed to get conversation stats from backend:', error);
              return null;
            }
          },

          searchChatHistory: async (query: string, limit?: number) => {
            try {
              return await invoke<ChatSearchResult[]>('search_chat_history', {
                query,
                limit: limit ?? null,
              });
            } catch (error) {
              console.error('[ChatStore] Failed to search chat history:', error);
              return [];
            }
          },

          searchChatHistorySemantic: async (query: string, limit?: number) => {
            try {
              return await invoke<ChatSearchResult[]>('search_chat_history_semantic', {
                query,
                limit: limit ?? null,
              });
            } catch (error) {
              console.error('[ChatStore] Failed to search chat history (semantic):', error);
              return [];
            }
          },

          searchPastConversations: async (
            query: string,
            limit?: number,
            conversationId?: number,
          ) => {
            try {
              return await invoke<ConversationSearchResult[]>('search_past_conversations', {
                query,
                limit: limit ?? null,
                conversationId: conversationId ?? null,
              });
            } catch (error) {
              console.error('[ChatStore] Failed to search past conversations:', error);
              return [];
            }
          },

          getRecentConversations: async (limit?: number) => {
            try {
              return await invoke<ConversationSearchResult[]>('get_recent_conversations', {
                limit: limit ?? null,
              });
            } catch (error) {
              console.error('[ChatStore] Failed to get recent conversations:', error);
              return [];
            }
          },

          exportConversationFromBackend: async (conversationDbId: number, format?: string) => {
            try {
              return await invoke<string>('conversation_export', {
                conversationId: conversationDbId.toString(),
                format: format ?? 'markdown',
              });
            } catch (error) {
              console.error('[ChatStore] Failed to export conversation from backend:', error);
              return null;
            }
          },

          getCostOverview: async (userId: string) => {
            try {
              return await invoke<CostOverviewResponse>('chat_get_cost_overview', {
                userId,
              });
            } catch (error) {
              console.error('[ChatStore] Failed to get cost overview:', error);
              return null;
            }
          },

          getCostAnalytics: async (
            userId: string,
            days?: number,
            provider?: string,
            model?: string,
          ) => {
            try {
              return await invoke<CostAnalyticsResponse>('chat_get_cost_analytics', {
                userId,
                days: days ?? null,
                provider: provider ?? null,
                model: model ?? null,
              });
            } catch (error) {
              console.error('[ChatStore] Failed to get cost analytics:', error);
              return null;
            }
          },

          compactContext: async (conversationDbId: number, userId: string, focus?: string) => {
            try {
              return await invoke<ContextCompactionResponse>('chat_compact_context', {
                conversationId: conversationDbId,
                userId,
                focus: focus ?? null,
              });
            } catch (error) {
              console.error('[ChatStore] Failed to compact context:', error);
              return null;
            }
          },

          // Stream watchdog actions
          markStreamActivity: () => {
            set(
              (state) => {
                state.lastStreamActivityAt = Date.now();
              },
              undefined,
              'chat/markStreamActivity',
            );
          },

          startStreamWatchdog: () => {
            // Clear any existing watchdog
            const existing = get().streamWatchdogTimerId;
            if (existing !== null) {
              clearInterval(existing);
            }

            let timeoutSeconds = 30;
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const { useSettingsStore } = require('../settingsStore') as {
                useSettingsStore: {
                  getState: () => {
                    executionPreferences: {
                      streamInactivityTimeoutSeconds: number;
                    };
                  };
                };
              };
              timeoutSeconds =
                useSettingsStore.getState().executionPreferences.streamInactivityTimeoutSeconds;
            } catch {
              // Use default 30s
            }

            const checkInterval = Math.max(5000, (timeoutSeconds * 1000) / 2);
            const timerId = setInterval(() => {
              const state = get();
              if (!state.isStreaming) {
                // No active stream — stop the watchdog
                get().stopStreamWatchdog();
                return;
              }
              const lastActivity = state.lastStreamActivityAt;
              if (lastActivity === null) {
                return;
              }
              const elapsed = Date.now() - lastActivity;
              if (elapsed >= timeoutSeconds * 1000) {
                get().handleStreamInactivityTimeout();
              }
            }, checkInterval);

            set(
              (state) => {
                state.streamWatchdogTimerId = timerId as unknown as ReturnType<typeof setTimeout>;
                state.lastStreamActivityAt = Date.now();
              },
              undefined,
              'chat/startStreamWatchdog',
            );
          },

          stopStreamWatchdog: () => {
            const timerId = get().streamWatchdogTimerId;
            if (timerId !== null) {
              clearInterval(timerId as unknown as ReturnType<typeof setInterval>);
            }
            set(
              (state) => {
                state.streamWatchdogTimerId = null;
                state.lastStreamActivityAt = null;
              },
              undefined,
              'chat/stopStreamWatchdog',
            );
          },

          handleStreamInactivityTimeout: () => {
            const state = get();
            const { currentStreamingMessageId, isStreaming } = state;

            if (!isStreaming) {
              get().stopStreamWatchdog();
              return;
            }

            console.warn(
              '[ChatStore] Stream inactivity timeout triggered for message:',
              currentStreamingMessageId,
            );

            // Force-reset streaming state
            set(
              (s) => {
                s.isStreaming = false;
                s.isLoading = false;
                s.currentStreamingMessageId = null;

                // Mark the streaming message as timed out
                if (currentStreamingMessageId) {
                  const msgIdx = s.messages.findIndex((m) => m.id === currentStreamingMessageId);
                  if (msgIdx !== -1 && s.messages[msgIdx]) {
                    s.messages[msgIdx]!.streaming = false;
                    s.messages[msgIdx]!.error =
                      'Stream timed out due to inactivity. You can retry by sending your message again.';
                  }
                  // Sync with messagesByConversation
                  const convoId = s.activeConversationId;
                  if (convoId && s.messagesByConversation[convoId]) {
                    const convoMsgIdx = s.messagesByConversation[convoId]!.findIndex(
                      (m) => m.id === currentStreamingMessageId,
                    );
                    if (convoMsgIdx !== -1 && s.messagesByConversation[convoId]![convoMsgIdx]) {
                      s.messagesByConversation[convoId]![convoMsgIdx]!.streaming = false;
                      s.messagesByConversation[convoId]![convoMsgIdx]!.error =
                        'Stream timed out due to inactivity. You can retry by sending your message again.';
                    }
                  }
                }
              },
              undefined,
              'chat/handleStreamInactivityTimeout',
            );

            get().stopStreamWatchdog();

            // Notify the user via Sonner toast (lazy import to avoid circular deps)
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const { toast } = require('sonner') as { toast: typeof import('sonner').toast };
              toast.warning(
                'Stream timed out due to inactivity. The response may be incomplete. You can retry by sending your message again.',
              );
            } catch {
              // Toast not available in test environment
            }
          },

          // Clear/export
          clearHistory: () => {
            set(
              (state) => {
                const newId = crypto.randomUUID();
                const convo: ConversationSummary = {
                  id: newId,
                  title: 'New chat',
                  pinned: false,
                  lastMessage: '',
                  updatedAt: new Date(),
                };
                state.conversations.unshift(convo);
                state.activeConversationId = newId;
                state.messages = [];
                state.messagesByConversation[newId] = [];
                state.isStreaming = false;
                state.currentStreamingMessageId = null;
                state.toolTimelineByMessage = {};
                state.thinkingByMessage = {};
                state.agenticLoopStatus = null;
                state.citations = [];
                state.focusMode = null;
              },
              undefined,
              'chat/clearHistory',
            );
          },

          exportConversation: async () => {
            const state = get();
            const conversationData = {
              messages: state.messages,
              exportedAt: new Date().toISOString(),
            };
            return JSON.stringify(conversationData, null, 2);
          },

          linkConversationId: (uuid, dbId) => {
            if (!idMappings.uuidToDbId[uuid]) {
              idMappings.uuidToDbId[uuid] = dbId;
              idMappings.dbIdToUuid[dbId] = uuid;
              pruneIdMappingsIfNeeded(); // M7 fix: prevent unbounded cache growth
              persistIdMappings();
            }
          },

          resetOnLogout: () => {
            // Stop the stream watchdog before resetting state
            get().stopStreamWatchdog();
            set(
              (state) => {
                state.conversations = [];
                state.activeConversationId = null;
                state.messagesByConversation = {};
                state.messages = [];
                state.isLoading = false;
                state.isLoadingMessages = false;
                state.isStreaming = false;
                state.currentStreamingMessageId = null;
                state.pendingMessages = [];
                state.citations = [];
                state.tokenUsage = {
                  current: 0,
                  inputTokens: 0,
                  outputTokens: 0,
                  max: getActiveModelContextWindow(),
                  percentage: 0,
                  estimatedCost: 0,
                };
                state.focusMode = null;
                state.activeView = 'chat';
                state.conversationMode = 'auto';
                state.draftContent = '';
                state.editingMessageId = null;
                state.selectedMessage = null;
                state.toolTimelineByMessage = {};
                state.thinkingByMessage = {};
                state.agenticLoopStatus = null;
                state.activeBranchId = DEFAULT_BRANCH_ID;
                state.branches = [];
                state.lastStreamActivityAt = null;
                state.streamWatchdogTimerId = null;
              },
              undefined,
              'chat/resetOnLogout',
            );

            // Clear pending persist timer to prevent stale data writes after logout
            if (_persistTimer !== null) {
              clearTimeout(_persistTimer);
              _persistTimer = null;
            }

            // STR-002 fix: Use centralized cleanup function
            clearIdMappings();
          },
        })),
      ),
      {
        name: 'chat-storage',
        version: STORAGE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          conversations: state.conversations,
          activeConversationId: state.activeConversationId,
          messagesByConversation: state.messagesByConversation,
          focusMode: state.focusMode,
          showMessageTimestamps: state.showMessageTimestamps,
        }),
        migrate: (persistedState: unknown, _version: number) => {
          // Handle future migrations here
          return persistedState as ChatState;
        },
      },
    ),
    { name: 'ChatStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors for optimal re-render performance
export const selectConversations = (state: ChatState) => state.conversations;
export const selectActiveConversationId = (state: ChatState) => state.activeConversationId;
export const selectMessages = (state: ChatState) => state.messages;
export const selectIsLoading = (state: ChatState) => state.isLoading;
export const selectIsLoadingMessages = (state: ChatState) => state.isLoadingMessages;
export const selectIsStreaming = (state: ChatState) => state.isStreaming;
export const selectCurrentStreamingMessageId = (state: ChatState) =>
  state.currentStreamingMessageId;
export const selectPendingMessages = (state: ChatState) => state.pendingMessages;
export const selectCitations = (state: ChatState) => state.citations;
export const selectTokenUsage = (state: ChatState) => state.tokenUsage;
export const selectFocusMode = (state: ChatState) => state.focusMode;
export const selectActiveView = (state: ChatState) => state.activeView;
export const selectConversationMode = (state: ChatState) => state.conversationMode;
export const selectDraftContent = (state: ChatState) => state.draftContent;
export const selectEditingMessageId = (state: ChatState) => state.editingMessageId;
export const selectShowMessageTimestamps = (state: ChatState) => state.showMessageTimestamps;
export const selectSelectedMessage = (state: ChatState) => state.selectedMessage;

// Derived selectors
export const selectActiveConversation = (state: ChatState) =>
  state.conversations.find((c) => c.id === state.activeConversationId);

export const selectNonArchivedConversations = (state: ChatState) =>
  state.conversations.filter((c) => !c.archived);

export const selectPinnedConversations = (state: ChatState) =>
  state.conversations.filter((c) => c.pinned && !c.archived);

export const selectToolTimelineByMessage = (state: ChatState) => state.toolTimelineByMessage;
export const selectThinkingByMessage = (state: ChatState) => state.thinkingByMessage;
export const selectAgenticLoopStatus = (state: ChatState) => state.agenticLoopStatus;

// Cross-store subscription: update tokenUsage.max when the selected model changes.
// Use a global singleton so module re-evaluation does not create duplicate subscriptions.
type ChatStoreModelSubscriptionState = {
  initialized: boolean;
  pending: Promise<void> | null;
  unsubscribe: (() => void) | null;
};

const CHAT_STORE_MODEL_SUBSCRIPTION_STATE = Symbol.for(
  'agiworkforce.chatStore.modelStoreSubscriptionState',
);
const IS_TEST_ENVIRONMENT =
  typeof process !== 'undefined' && (process.env['NODE_ENV'] === 'test' || process.env['VITEST']);

function getChatStoreModelSubscriptionState(): ChatStoreModelSubscriptionState {
  const globalScope = globalThis as typeof globalThis & {
    [CHAT_STORE_MODEL_SUBSCRIPTION_STATE]?: ChatStoreModelSubscriptionState;
  };

  if (!globalScope[CHAT_STORE_MODEL_SUBSCRIPTION_STATE]) {
    globalScope[CHAT_STORE_MODEL_SUBSCRIPTION_STATE] = {
      initialized: false,
      pending: null,
      unsubscribe: null,
    };
  }

  return globalScope[CHAT_STORE_MODEL_SUBSCRIPTION_STATE];
}

export async function initializeChatStoreModelStoreSubscription(): Promise<void> {
  const subscriptionState = getChatStoreModelSubscriptionState();

  if (subscriptionState.initialized) {
    return;
  }

  if (subscriptionState.pending) {
    return subscriptionState.pending;
  }

  subscriptionState.pending = (async () => {
    try {
      const modelStoreModule = await import('../modelStore');
      const modelStore = modelStoreModule?.useModelStore as
        | {
            getState?: () => { selectedModel: string | null };
            subscribe?: (
              selector: (state: { selectedModel: string | null }) => string | null,
              listener: (selectedModel: string | null) => void,
            ) => () => void;
          }
        | undefined;

      if (!modelStore || typeof modelStore.getState !== 'function') {
        return;
      }

      const selectedModel = modelStore.getState().selectedModel;
      if (selectedModel) {
        useChatStore.getState().updateTokenUsage({ max: getModelContextWindow(selectedModel) });
      }

      if (typeof modelStore.subscribe === 'function') {
        subscriptionState.unsubscribe?.();
        subscriptionState.unsubscribe = modelStore.subscribe(
          (state) => state.selectedModel,
          (nextSelectedModel) => {
            if (nextSelectedModel) {
              useChatStore
                .getState()
                .updateTokenUsage({ max: getModelContextWindow(nextSelectedModel) });
            }
          },
        );
      }

      subscriptionState.initialized = true;
    } catch (err) {
      console.warn('[chatStore] Failed to load modelStore for cross-store subscription:', err);
    } finally {
      subscriptionState.pending = null;
    }
  })();

  return subscriptionState.pending;
}

/**
 * Tears down the cross-store model subscription.
 * Call during logout/cleanup to prevent leaked listeners.
 */
export function teardownChatStoreModelStoreSubscription(): void {
  const subscriptionState = getChatStoreModelSubscriptionState();
  subscriptionState.unsubscribe?.();
  subscriptionState.unsubscribe = null;
  subscriptionState.initialized = false;
  subscriptionState.pending = null;
}

if (typeof window !== 'undefined' && !IS_TEST_ENVIRONMENT) {
  void initializeChatStoreModelStoreSubscription();
}
