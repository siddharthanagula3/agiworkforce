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
import { safeGetJSON, safeSetJSON } from '../../utils/localStorage';
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
} from './types';

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
} from './types';

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

function persistIdMappings() {
  if (typeof window !== 'undefined') {
    const success = safeSetJSON('id-mappings', idMappings);
    if (!success) {
      console.warn('[ChatStore] Failed to persist ID mappings - using in-memory only');
    }
  }
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
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[#*_~[\](){}]/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
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

// Storage fallback for SSR/non-browser environments
const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

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

  // Actions - Conversation management
  ensureActiveConversation: () => void;
  createConversation: (title?: string) => string;
  selectConversation: (id: string) => void;
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

  // Actions - Clear/export
  clearHistory: () => void;
  exportConversation: () => Promise<string>;
  linkConversationId: (uuid: string, dbId: number) => void;
  resetOnLogout: () => void;
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
            max: 128000,
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

          createConversation: (title = 'New chat') => {
            const id = crypto.randomUUID();
            set(
              (state) => {
                const convo: ConversationSummary = {
                  id,
                  title,
                  pinned: false,
                  lastMessage: '',
                  updatedAt: new Date(),
                };
                state.conversations.unshift(convo);
                // AUDIT-006-012 fix: Cap active conversations at 500
                if (state.conversations.length > 500) {
                  // Remove oldest non-pinned, non-active conversations
                  const toRemove = state.conversations
                    .filter((c) => !c.pinned && c.id !== id)
                    .slice(499);
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

          loadConversationMessages: async (id: string, userId: string) => {
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
                conversation_id: dbId,
                user_id: userId,
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

          deleteConversation: (id: string) =>
            set(
              (state) => {
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
            ),

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
                // AUDIT-006-013 fix: Cap messages per conversation at 1000
                if (state.messagesByConversation[convoId]!.length > 1000) {
                  state.messagesByConversation[convoId] =
                    state.messagesByConversation[convoId]!.slice(-1000);
                }
                if (state.messages.length > 1000) {
                  state.messages = state.messages.slice(-1000);
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

                if (
                  convoId &&
                  convoId === state.activeConversationId &&
                  state.messagesByConversation[convoId]
                ) {
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
                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId]) {
                  applyUpdate(state.messagesByConversation[convoId]!);
                }

                if (!updatedInMessages || !convoId) {
                  for (const [convId, messages] of Object.entries(state.messagesByConversation)) {
                    if (messages && applyUpdate(messages)) {
                      if (convId === state.activeConversationId) {
                        const msgIdx = messages.findIndex((m) => m.id === id);
                        if (msgIdx !== -1) {
                          const existingMsgIdx = state.messages.findIndex((m) => m.id === id);
                          if (existingMsgIdx !== -1) {
                            state.messages[existingMsgIdx] = messages[msgIdx]!;
                          }
                        }
                      }
                      break;
                    }
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

          editAndRegenerateFromMessage: (messageId, newContent) =>
            set(
              (state) => {
                const messageIndex = state.messages.findIndex((m) => m.id === messageId);
                if (messageIndex === -1) return;

                const msg = state.messages[messageIndex];
                if (!msg || msg.role !== 'user') return;

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

                state.messages = state.messages.slice(0, messageIndex + 1);

                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId]) {
                  const convoMsgs = state.messagesByConversation[convoId]!;
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
                    state.messagesByConversation[convoId] = convoMsgs.slice(0, convoMsgIndex + 1);
                  }
                }
              },
              undefined,
              'chat/editAndRegenerateFromMessage',
            ),

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

          setStreamingMessage: (id) =>
            set(
              (state) => {
                state.currentStreamingMessageId = id;
                state.isStreaming = id !== null;
              },
              undefined,
              'chat/setStreamingMessage',
            ),

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

                if (activeConversationId && state.messagesByConversation[activeConversationId]) {
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
                state.pendingMessages.push(message);
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
                if (messageInMessages) {
                  messageInMessages.bookmarked = !messageInMessages.bookmarked;
                }

                for (const convoId of Object.keys(state.messagesByConversation)) {
                  const messages = state.messagesByConversation[convoId];
                  if (messages) {
                    const message = messages.find((m) => m.id === messageId);
                    if (message) {
                      message.bookmarked = !message.bookmarked;
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
                const toggleReaction = (message: EnhancedMessage | undefined) => {
                  if (!message) return;
                  if (!message.reactions) {
                    message.reactions = [];
                  }
                  const index = message.reactions.indexOf(reaction);
                  if (index >= 0) {
                    message.reactions.splice(index, 1);
                  } else {
                    message.reactions.push(reaction);
                  }
                };

                toggleReaction(state.messages.find((m) => m.id === messageId));

                for (const convoId of Object.keys(state.messagesByConversation)) {
                  const messages = state.messagesByConversation[convoId];
                  if (messages) {
                    const message = messages.find((m) => m.id === messageId);
                    if (message) {
                      toggleReaction(message);
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
              persistIdMappings();
            }
          },

          resetOnLogout: () => {
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
                  max: 128000,
                  percentage: 0,
                  estimatedCost: 0,
                };
                state.focusMode = null;
                state.activeView = 'chat';
                state.conversationMode = 'auto';
                state.draftContent = '';
                state.editingMessageId = null;
                state.selectedMessage = null;
              },
              undefined,
              'chat/resetOnLogout',
            );

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
