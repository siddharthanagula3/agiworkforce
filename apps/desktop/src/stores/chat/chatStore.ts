/**
 * Chat Store
 *
 * Thin barrel: conversation/message/backend domain lives here as useChatMessageStore.
 * View state → chatViewStore. Execution/streaming/tools → chatExecutionStore.
 * useChatStore is the combined hook that merges all three — all consumer imports unchanged.
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../../lib/tauri-mock';
import { getModelContextWindow } from '../../constants/llm';
import { safeGetJSON, safeSetJSON, storageFallback } from '../../utils/localStorage';
import { useAppModeStore } from '../appModeStore';
import { useUnifiedAuthStore } from '../auth';
import { useModelStore } from '../modelStore';
import { registerChatStoreStateReader } from './chatStoreRef';
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
import {
  useChatViewStore,
  initializeChatViewModelSubscription,
  teardownChatViewModelSubscription,
} from './chatViewStore';
import { useChatExecutionStore, registerExecutionMessagePatcher } from './chatExecutionStore';

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

interface BackendConversation {
  id: number;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

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

interface IdMapping {
  dbIdToUuid: Record<number, string>;
  uuidToDbId: Record<string, number>;
}

const MAX_ID_MAPPINGS = 1000;

let idMappings: IdMapping = { dbIdToUuid: {}, uuidToDbId: {} };

if (typeof window !== 'undefined') {
  idMappings = safeGetJSON<IdMapping>('id-mappings', { dbIdToUuid: {}, uuidToDbId: {} });
}

let _persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistIdMappings() {
  if (typeof window === 'undefined') return;
  if (_persistTimer !== null) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    const success = safeSetJSON('id-mappings', idMappings);
    if (!success) {
      console.warn('[ChatStore] Failed to persist ID mappings - using in-memory only');
    }
  }, 300);
}

function pruneIdMappingsIfNeeded() {
  const dbIds = Object.keys(idMappings.dbIdToUuid).map(Number);
  if (dbIds.length <= MAX_ID_MAPPINGS) return;
  dbIds.sort((a, b) => a - b);
  const toRemove = dbIds.slice(0, dbIds.length - MAX_ID_MAPPINGS);
  for (const dbId of toRemove) {
    const uuid = idMappings.dbIdToUuid[dbId];
    if (uuid) delete idMappings.uuidToDbId[uuid];
    delete idMappings.dbIdToUuid[dbId];
  }
}

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

export function uuidToDbId(uuid: string): number | undefined {
  return idMappings.uuidToDbId[uuid];
}

export function clearIdMappings() {
  idMappings = { dbIdToUuid: {}, uuidToDbId: {} };
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('id-mappings');
    } catch {
      /* ignore */
    }
  }
}

function generateTitleFromMessage(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[#*_~[\](){}|\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'New conversation';
  const maxLength = 50;
  if (cleaned.length <= maxLength) return cleaned;
  const truncated = cleaned.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 30) return truncated.slice(0, lastSpace) + '...';
  return truncated + '...';
}

const STORAGE_VERSION = 1;

import type { ToolLabelEntry } from '@agiworkforce/types';
export type { ToolLabelEntry };

// === Message domain state (core store) ===

export interface ChatMessageState {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  messagesByConversation: Record<string, EnhancedMessage[]>;
  messages: EnhancedMessage[];

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

  getConversationFromBackend: (dbId: number, userId: string) => Promise<BackendConversation | null>;
  createConversationInBackend: (
    title: string,
    userId: string,
  ) => Promise<BackendConversation | null>;
  renameConversationInBackend: (dbId: number, title: string, userId: string) => Promise<boolean>;
  createMessageInBackend: (params: {
    conversationId: number;
    userId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    tokens?: number;
    cost?: number;
  }) => Promise<BackendMessage | null>;
  updateMessageInBackend: (messageDbId: number, content: string) => Promise<BackendMessage | null>;
  deleteMessageFromBackend: (messageDbId: number) => Promise<boolean>;
  getConversationStatsFromBackend: (
    conversationDbId: number,
  ) => Promise<BackendConversationStats | null>;
  searchChatHistory: (query: string, limit?: number) => Promise<ChatSearchResult[]>;
  searchChatHistorySemantic: (query: string, limit?: number) => Promise<ChatSearchResult[]>;
  searchPastConversations: (
    query: string,
    limit?: number,
    conversationId?: number,
  ) => Promise<ConversationSearchResult[]>;
  getRecentConversations: (limit?: number) => Promise<ConversationSearchResult[]>;
  exportConversationFromBackend: (
    conversationDbId: number,
    format?: string,
  ) => Promise<string | null>;
  getCostOverview: (userId: string) => Promise<CostOverviewResponse | null>;
  getCostAnalytics: (
    userId: string,
    days?: number,
    provider?: string,
    model?: string,
  ) => Promise<CostAnalyticsResponse | null>;
  compactContext: (
    conversationDbId: number,
    userId: string,
    focus?: string,
  ) => Promise<ContextCompactionResponse | null>;

  clearHistory: () => void;
  exportConversation: () => Promise<string>;
  linkConversationId: (uuid: string, dbId: number) => void;
  resetOnLogout: () => void;
}

// === Backend response types ===

export interface ChatSearchResult {
  messageId: number;
  conversationId: number;
  conversationTitle: string | null;
  contentSnippet: string;
  role: string;
  createdAt: string;
  rank: number;
}

export interface ConversationSearchResult {
  conversationId: number;
  title: string;
  messageCount: number;
  lastUpdated: string;
  snippet?: string;
  score?: number;
}

export interface BackendConversationStats {
  messageCount: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

export interface CostOverviewResponse {
  todayTotal: number;
  monthTotal: number;
  monthlyBudget: number | null;
  remainingBudget: number | null;
}

export interface CostAnalyticsResponse {
  timeseries: Array<{ date: string; cost: number; tokens: number }>;
  providers: Array<{ provider: string; totalCost: number; messageCount: number }>;
  topConversations: Array<{ conversationId: number; title: string; totalCost: number }>;
}

export interface ContextCompactionResponse {
  messagesCompacted: number;
  tokensBefore: number;
  tokensAfter: number;
  savingsPercent: number;
  summaryCreated: boolean;
  focus: string | null;
  message: string;
}

// === Core message-domain store ===

export const useChatMessageStore = create<ChatMessageState>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          conversations: [],
          activeConversationId: null,
          messagesByConversation: {},
          messages: [],

          ensureActiveConversation: () =>
            set(
              (state) => {
                if (state.activeConversationId) {
                  const existing = state.messagesByConversation[state.activeConversationId];
                  if (existing && state.messages.length === 0) state.messages = existing.slice();
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
                  createCloudConversation(title)
                    .then((cloudConvo) => {
                      set(
                        (s) => {
                          const idx = s.conversations.findIndex((c) => c.id === id);
                          if (idx !== -1) s.conversations[idx]!.id = cloudConvo.id;
                          if (s.messagesByConversation[id]) {
                            s.messagesByConversation[cloudConvo.id] = s.messagesByConversation[id]!;
                            delete s.messagesByConversation[id];
                          }
                          if (s.activeConversationId === id) s.activeConversationId = cloudConvo.id;
                        },
                        undefined,
                        'chat/createConversation/cloud/remap',
                      );
                    })
                    .catch((error) => {
                      console.error('[ChatStore] Failed to create cloud conversation:', error);
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

                if (state.conversations.length > 500) {
                  const nonPinned = state.conversations.filter((c) => !c.pinned && c.id !== id);
                  const excess = state.conversations.length - 500;
                  const removeCount = Math.min(excess, nonPinned.length);
                  const toRemove = nonPinned.slice(nonPinned.length - removeCount);
                  for (const conv of toRemove) delete state.messagesByConversation[conv.id];
                  state.conversations = state.conversations.filter(
                    (c) => c.pinned || c.id === id || !toRemove.some((r) => r.id === c.id),
                  );
                }
                state.activeConversationId = id;
                state.messagesByConversation[id] = [];
                state.messages = [];
                useChatExecutionStore.setState({
                  isStreaming: false,
                  currentStreamingMessageId: null,
                });
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
                if (cachedMessages && cachedMessages.length > 0) {
                  state.messages = cachedMessages.slice();
                  useChatExecutionStore.setState({ isLoadingMessages: false });
                } else {
                  state.messages = [];
                  useChatExecutionStore.setState({ isLoadingMessages: true });
                }
                useChatExecutionStore.setState({
                  isStreaming: false,
                  currentStreamingMessageId: null,
                });
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
                    if (!state.activeConversationId && converted.length > 0)
                      state.activeConversationId = converted[0]!.id;
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
                  const localOnly = state.conversations.filter(
                    (c) => !converted.some((bc) => bc.id === c.id),
                  );
                  state.conversations = [...converted, ...localOnly];
                  if (!state.activeConversationId && converted.length > 0)
                    state.activeConversationId = converted[0]!.id;
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
              useChatExecutionStore.setState({ isLoadingMessages: true });
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
                    if (s.activeConversationId === id) s.messages = enhancedMessages;
                  },
                  undefined,
                  'chat/loadConversationMessages/cloud/success',
                );
                useChatExecutionStore.setState({ isLoadingMessages: false });
              } catch (error) {
                console.error('[ChatStore] Failed to load cloud messages:', error);
                useChatExecutionStore.setState({ isLoadingMessages: false });
              }
              return;
            }
            const dbId = uuidToDbId(id);
            if (!dbId) {
              console.warn('[ChatStore] No database ID found for conversation:', id);
              useChatExecutionStore.setState({ isLoadingMessages: false });
              return;
            }
            useChatExecutionStore.setState({ isLoadingMessages: true });
            try {
              const backendMessages = await invoke<BackendMessage[]>('chat_get_messages', {
                conversationId: dbId,
                userId,
              });
              const enhancedMessages = backendMessages.map(convertBackendMessage);
              set(
                (s) => {
                  s.messagesByConversation[id] = enhancedMessages;
                  if (s.activeConversationId === id) s.messages = enhancedMessages;
                },
                undefined,
                'chat/loadConversationMessages/success',
              );
              useChatExecutionStore.setState({ isLoadingMessages: false });
            } catch (error) {
              console.error('[ChatStore] Failed to load messages:', error);
              useChatExecutionStore.setState({ isLoadingMessages: false });
            }
          },

          setConversationMessages: (id: string, messages: EnhancedMessage[]) =>
            set(
              (state) => {
                state.messagesByConversation[id] = messages;
                if (state.activeConversationId === id) state.messages = messages.slice();
                useChatExecutionStore.setState({ isLoadingMessages: false });
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
            return state.conversations.find((c) => c.id === targetId)?.customInstructions;
          },

          deleteConversation: (id: string) => {
            set(
              (state) => {
                const msgs = state.messagesByConversation[id];
                if (msgs) {
                  for (const msg of msgs) {
                    const timeline = useChatExecutionStore.getState().toolTimelineByMessage;
                    if (timeline[msg.id]) {
                      const next = { ...timeline };
                      delete next[msg.id];
                      useChatExecutionStore.setState({ toolTimelineByMessage: next });
                    }
                    const thinking = useChatExecutionStore.getState().thinkingByMessage;
                    if (thinking[msg.id]) {
                      const next = { ...thinking };
                      delete next[msg.id];
                      useChatExecutionStore.setState({ thinkingByMessage: next });
                    }
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
            const dbId = uuidToDbId(id);
            if (dbId !== undefined) {
              const userId = useUnifiedAuthStore.getState().user?.id ?? '';
              if (!userId) return;
              void invoke('chat_delete_conversation', { id: dbId, userId }).catch((error) => {
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

          getArchivedConversations: () => get().conversations.filter((c) => c.archived === true),

          getConversationsByProject: (projectId: string) =>
            get().conversations.filter((c) => c.projectId === projectId),

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
            let markdown = `# ${title}\n\n*Exported on ${date}*\n\n---\n\n`;
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
              markdown += `### ${role} *${timestamp}*\n\n${msg.content}\n\n`;
              if (msg.attachments && msg.attachments.length > 0)
                markdown += `*Attachments: ${msg.attachments.map((a) => a.name).join(', ')}*\n\n`;
              markdown += '---\n\n';
            }
            return markdown;
          },

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
                if (!state.messagesByConversation[convoId])
                  state.messagesByConversation[convoId] = [];
                state.messagesByConversation[convoId]!.push(newMessage);
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
                  )
                    convo.title = generateTitleFromMessage(newMessage.content);
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
                if (!state.messagesByConversation[convoId])
                  state.messagesByConversation[convoId] = [];
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
                    if (confirmedId) list[idx]!.id = confirmedId;
                  }
                };
                applyConfirmation(state.messages);
                if (convoId && state.messagesByConversation[convoId])
                  applyConfirmation(state.messagesByConversation[convoId]!);
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
                if (convoId && state.messagesByConversation[convoId])
                  applyFailure(state.messagesByConversation[convoId]!);
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
                if (convoId && state.messagesByConversation[convoId])
                  applyRetry(state.messagesByConversation[convoId]!);
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
                        ? { ...updates, metadata: { ...message.metadata, ...updates.metadata } }
                        : updates;
                    Object.assign(message, mergedUpdates);
                    return true;
                  }
                  return false;
                };
                const updatedInMessages = applyUpdate(state.messages);
                const activeConversationId = state.activeConversationId;
                let updatedInConversation = false;
                if (activeConversationId && state.messagesByConversation[activeConversationId])
                  updatedInConversation = applyUpdate(
                    state.messagesByConversation[activeConversationId]!,
                  );
                if (!updatedInConversation) {
                  for (const [convId, messages] of Object.entries(state.messagesByConversation)) {
                    if (!messages || convId === activeConversationId) continue;
                    if (applyUpdate(messages)) {
                      updatedInConversation = true;
                      break;
                    }
                  }
                }
                if (!updatedInMessages && activeConversationId && updatedInConversation) {
                  const activeMessages = state.messagesByConversation[activeConversationId];
                  const activeIdx = activeMessages?.findIndex((m) => m.id === id) ?? -1;
                  const stateIdx = state.messages.findIndex((m) => m.id === id);
                  if (activeIdx !== -1 && stateIdx !== -1 && activeMessages)
                    state.messages[stateIdx] = activeMessages[activeIdx]!;
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
                if (convoId && state.messagesByConversation[convoId])
                  state.messagesByConversation[convoId] = state.messagesByConversation[
                    convoId
                  ]!.filter((m) => m.id !== id);
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
                    if (!msg.metadata?.originalContent)
                      msg.metadata = { ...msg.metadata, originalContent: msg.content };
                    msg.content = newContent;
                    msg.metadata = { ...msg.metadata, edited: true, editedAt: new Date() };
                  }
                };
                applyEdit(state.messages);
                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId])
                  applyEdit(state.messagesByConversation[convoId]!);
              },
              undefined,
              'chat/editMessage',
            ),

          editAndRegenerateFromMessage: (messageId, newContent) => {
            const state = get();
            const convoId = state.activeConversationId;
            const dbId = convoId ? uuidToDbId(convoId) : undefined;
            const msgDbId = uuidToDbId(messageId);
            if (dbId && msgDbId !== undefined) {
              useChatExecutionStore
                .getState()
                .forkAndRegenerate(dbId, msgDbId, newContent)
                .catch((err) => {
                  console.error('[ChatStore] Fork failed:', err);
                });
              return;
            }
            set(
              (s) => {
                const messageIndex = s.messages.findIndex((m) => m.id === messageId);
                if (messageIndex === -1) return;
                const msg = s.messages[messageIndex];
                if (!msg || msg.role !== 'user') return;
                if (!msg.metadata?.originalContent)
                  msg.metadata = { ...msg.metadata, originalContent: msg.content };
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
                      if (!convoMsg.metadata?.originalContent)
                        convoMsg.metadata = {
                          ...convoMsg.metadata,
                          originalContent: convoMsg.content,
                        };
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

          toggleMessageBookmark: (messageId) =>
            set(
              (state) => {
                const messageInMessages = state.messages.find((m) => m.id === messageId);
                const newValue = messageInMessages ? !messageInMessages.bookmarked : undefined;
                if (messageInMessages && newValue !== undefined)
                  messageInMessages.bookmarked = newValue;
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
                const messageInMessages = state.messages.find((m) => m.id === messageId);
                const shouldAdd = messageInMessages
                  ? !(messageInMessages.reactions ?? []).includes(reaction)
                  : true;
                const applyReaction = (message: EnhancedMessage | undefined) => {
                  if (!message) return;
                  if (!message.reactions) message.reactions = [];
                  if (shouldAdd) {
                    if (!message.reactions.includes(reaction)) message.reactions.push(reaction);
                  } else {
                    const index = message.reactions.indexOf(reaction);
                    if (index >= 0) message.reactions.splice(index, 1);
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
              if (messages) bookmarked.push(...messages.filter((m) => m.bookmarked));
            }
            return bookmarked.sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
            );
          },

          getConversationStats: (id?: string) => {
            const state = get();
            const targetId = id || state.activeConversationId;
            const messages = targetId ? state.messagesByConversation[targetId] || [] : [];
            let userMessages = 0,
              assistantMessages = 0,
              inputTokens = 0,
              outputTokens = 0,
              totalCost = 0;
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

          // Backend-wired commands
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
              if (conv) dbIdToUuid(conv.id);
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
              return await invoke<CostOverviewResponse>('chat_get_cost_overview', { userId });
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
              },
              undefined,
              'chat/clearHistory',
            );
            useChatExecutionStore.setState({
              isStreaming: false,
              currentStreamingMessageId: null,
              toolTimelineByMessage: {},
              thinkingByMessage: {},
              agenticLoopStatus: null,
            });
            useChatViewStore.getState().clearCitations();
            useChatViewStore.setState({ focusMode: null });
          },

          exportConversation: async () => {
            const state = get();
            return JSON.stringify(
              { messages: state.messages, exportedAt: new Date().toISOString() },
              null,
              2,
            );
          },

          linkConversationId: (uuid, dbId) => {
            if (!idMappings.uuidToDbId[uuid]) {
              idMappings.uuidToDbId[uuid] = dbId;
              idMappings.dbIdToUuid[dbId] = uuid;
              pruneIdMappingsIfNeeded();
              persistIdMappings();
            }
          },

          resetOnLogout: () => {
            useChatExecutionStore.getState().stopStreamWatchdog();
            set(
              (state) => {
                state.conversations = [];
                state.activeConversationId = null;
                state.messagesByConversation = {};
                state.messages = [];
              },
              undefined,
              'chat/resetOnLogout',
            );
            useChatExecutionStore.setState({
              isLoading: false,
              isLoadingMessages: false,
              isStreaming: false,
              currentStreamingMessageId: null,
              pendingMessages: [],
              toolTimelineByMessage: {},
              thinkingByMessage: {},
              agenticLoopStatus: null,
              activeBranchId: DEFAULT_BRANCH_ID,
              branches: [],
              lastStreamActivityAt: null,
              streamWatchdogTimerId: null,
            });
            useChatViewStore.getState().resetViewState();
            if (_persistTimer !== null) {
              clearTimeout(_persistTimer);
              _persistTimer = null;
            }
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
        }),
        migrate: (persistedState: unknown, _version: number) => persistedState as ChatMessageState,
      },
    ),
    { name: 'ChatMessageStore', enabled: import.meta.env.DEV },
  ),
);

// Wire the message patcher so chatExecutionStore can mutate message arrays
registerExecutionMessagePatcher((fn) => {
  const { messages, messagesByConversation, activeConversationId } = useChatMessageStore.getState();
  fn(messages, activeConversationId ? messagesByConversation[activeConversationId] : undefined);
});

registerChatStoreStateReader(
  useChatMessageStore as unknown as Parameters<typeof registerChatStoreStateReader>[0],
);

// === Combined ChatState interface (unchanged for consumers) ===

export interface ChatState extends ChatMessageState {
  // View state (from chatViewStore)
  focusMode: FocusMode;
  activeView: ActiveView;
  conversationMode: ConversationMode;
  draftContent: string;
  editingMessageId: string | null;
  showMessageTimestamps: boolean;
  selectedMessage: string | null;
  citations: Citation[];
  tokenUsage: TokenUsage;

  setFocusMode: (mode: FocusMode) => void;
  setActiveView: (view: ActiveView) => void;
  setConversationMode: (mode: ConversationMode) => void;
  setDraftContent: (value: string) => void;
  startEditingMessage: (id: string, content: string) => void;
  cancelEditing: () => void;
  setSelectedMessage: (id: string | null) => void;
  toggleMessageTimestamps: () => void;
  addCitation: (citation: Omit<Citation, 'id' | 'timestamp'>) => void;
  getCitationByIndex: (index: number) => Citation | undefined;
  clearCitations: () => void;
  updateTokenUsage: (usage: Partial<TokenUsage>) => void;
  getTokenPercentage: () => number;

  // Execution state (from chatExecutionStore)
  isLoading: boolean;
  isLoadingMessages: boolean;
  isStreaming: boolean;
  currentStreamingMessageId: string | null;
  pendingMessages: PendingUserMessage[];
  toolTimelineByMessage: Record<string, ToolLabelEntry[]>;
  thinkingByMessage: Record<string, string>;
  agenticLoopStatus: {
    active: boolean;
    conversationId: number | null;
    iteration: number;
    maxIterations: number;
  } | null;
  activeBranchId: string;
  branches: BranchSummary[];
  lastStreamActivityAt: number | null;
  streamWatchdogTimerId: ReturnType<typeof setTimeout> | null;

  setIsLoading: (loading: boolean) => void;
  setLoadingMessages: (loading: boolean) => void;
  setStreamingMessage: (id: string | null) => void;
  appendToStreamingMessage: (content: string) => void;
  addInlinePanel: (messageId: string, panel: InlinePanel) => void;
  updateInlinePanel: (
    messageId: string,
    panelId: string,
    content: Partial<InlinePanelContent>,
  ) => void;
  toggleInlinePanelCollapse: (messageId: string, panelId: string) => void;
  addPendingMessage: (message: PendingUserMessage) => void;
  removePendingMessage: (id: string) => void;
  clearPendingMessages: () => void;
  getPendingMessagesCount: () => number;
  addToolTimelineEntry: (messageId: string, entry: ToolLabelEntry) => void;
  updateToolTimelineEntry: (
    messageId: string,
    entryId: string,
    updates: Partial<ToolLabelEntry>,
  ) => void;
  appendThinkingContent: (messageId: string, delta: string) => void;
  clearThinkingContent: (messageId: string) => void;
  setAgenticLoopStatus: (status: ChatState['agenticLoopStatus']) => void;
  loadBranches: (conversationId: number) => Promise<void>;
  switchBranch: (conversationId: number, branchId: string) => Promise<void>;
  forkAndRegenerate: (
    conversationId: number,
    messageId: number,
    newContent: string,
  ) => Promise<void>;
  deleteBranch: (conversationId: number, branchId: string) => Promise<void>;
  markStreamActivity: () => void;
  startStreamWatchdog: () => void;
  stopStreamWatchdog: () => void;
  handleStreamInactivityTimeout: () => void;
}

function buildCombinedState(
  msg: ReturnType<typeof useChatMessageStore.getState>,
  exec: ReturnType<typeof useChatExecutionStore.getState>,
  view: ReturnType<typeof useChatViewStore.getState>,
): ChatState {
  return {
    // Message domain
    ...msg,
    // Execution domain
    isLoading: exec.isLoading,
    isLoadingMessages: exec.isLoadingMessages,
    isStreaming: exec.isStreaming,
    currentStreamingMessageId: exec.currentStreamingMessageId,
    pendingMessages: exec.pendingMessages,
    toolTimelineByMessage: exec.toolTimelineByMessage,
    thinkingByMessage: exec.thinkingByMessage,
    agenticLoopStatus: exec.agenticLoopStatus,
    activeBranchId: exec.activeBranchId,
    branches: exec.branches,
    lastStreamActivityAt: exec.lastStreamActivityAt,
    streamWatchdogTimerId: exec.streamWatchdogTimerId,
    setIsLoading: exec.setIsLoading,
    setLoadingMessages: exec.setLoadingMessages,
    setStreamingMessage: exec.setStreamingMessage,
    appendToStreamingMessage: exec.appendToStreamingMessage,
    addInlinePanel: exec.addInlinePanel,
    updateInlinePanel: exec.updateInlinePanel,
    toggleInlinePanelCollapse: exec.toggleInlinePanelCollapse,
    addPendingMessage: exec.addPendingMessage,
    removePendingMessage: exec.removePendingMessage,
    clearPendingMessages: exec.clearPendingMessages,
    getPendingMessagesCount: exec.getPendingMessagesCount,
    addToolTimelineEntry: exec.addToolTimelineEntry,
    updateToolTimelineEntry: exec.updateToolTimelineEntry,
    appendThinkingContent: exec.appendThinkingContent,
    clearThinkingContent: exec.clearThinkingContent,
    setAgenticLoopStatus: exec.setAgenticLoopStatus,
    loadBranches: exec.loadBranches,
    switchBranch: exec.switchBranch,
    forkAndRegenerate: exec.forkAndRegenerate,
    deleteBranch: exec.deleteBranch,
    markStreamActivity: exec.markStreamActivity,
    startStreamWatchdog: exec.startStreamWatchdog,
    stopStreamWatchdog: exec.stopStreamWatchdog,
    handleStreamInactivityTimeout: exec.handleStreamInactivityTimeout,
    // View domain
    focusMode: view.focusMode,
    activeView: view.activeView,
    conversationMode: view.conversationMode,
    draftContent: view.draftContent,
    editingMessageId: view.editingMessageId,
    showMessageTimestamps: view.showMessageTimestamps,
    selectedMessage: view.selectedMessage,
    citations: view.citations,
    tokenUsage: view.tokenUsage,
    setFocusMode: view.setFocusMode,
    setActiveView: view.setActiveView,
    setConversationMode: view.setConversationMode,
    setDraftContent: view.setDraftContent,
    startEditingMessage: view.startEditingMessage,
    cancelEditing: view.cancelEditing,
    setSelectedMessage: view.setSelectedMessage,
    toggleMessageTimestamps: view.toggleMessageTimestamps,
    addCitation: view.addCitation,
    getCitationByIndex: view.getCitationByIndex,
    clearCitations: view.clearCitations,
    updateTokenUsage: view.updateTokenUsage,
    getTokenPercentage: view.getTokenPercentage,
  };
}

type SettableChatState = Partial<
  Pick<
    ChatState,
    | 'conversations'
    | 'messages'
    | 'activeConversationId'
    | 'messagesByConversation'
    | 'focusMode'
    | 'activeView'
    | 'conversationMode'
    | 'showMessageTimestamps'
    | 'draftContent'
    | 'editingMessageId'
    | 'selectedMessage'
    | 'isLoading'
    | 'isLoadingMessages'
    | 'isStreaming'
    | 'currentStreamingMessageId'
    | 'pendingMessages'
    | 'citations'
    | 'tokenUsage'
    | 'toolTimelineByMessage'
    | 'thinkingByMessage'
    | 'agenticLoopStatus'
    | 'activeBranchId'
    | 'branches'
    | 'lastStreamActivityAt'
    | 'streamWatchdogTimerId'
  >
>;

/**
 * Combined useChatStore hook — preserves original API for all 39 consumers.
 * Merges message, execution, and view sub-stores into the legacy ChatState shape.
 * Pass a selector to extract a slice, or omit to get the full combined state.
 */
export function useChatStore<T = ChatState>(selector?: (state: ChatState) => T): T {
  const msgSlice = useChatMessageStore();
  const execSlice = useChatExecutionStore();
  const viewSlice = useChatViewStore();
  const combined = buildCombinedState(msgSlice, execSlice, viewSlice);
  return (selector ? selector(combined) : combined) as T;
}

useChatStore.getState = (): ChatState =>
  buildCombinedState(
    useChatMessageStore.getState(),
    useChatExecutionStore.getState(),
    useChatViewStore.getState(),
  );

useChatStore.setState = (
  updater: SettableChatState | ((state: ChatState) => SettableChatState),
): void => {
  const partial = typeof updater === 'function' ? updater(useChatStore.getState()) : updater;

  const {
    focusMode,
    activeView,
    conversationMode,
    showMessageTimestamps,
    citations,
    tokenUsage,
    draftContent,
    editingMessageId,
    selectedMessage,
    isLoading,
    isLoadingMessages,
    isStreaming,
    currentStreamingMessageId,
    pendingMessages,
    toolTimelineByMessage,
    thinkingByMessage,
    agenticLoopStatus,
    activeBranchId,
    branches,
    lastStreamActivityAt,
    streamWatchdogTimerId,
    ...msgFields
  } = partial;

  if (Object.keys(msgFields).length > 0) useChatMessageStore.setState(msgFields);

  const viewUpdate: Partial<ReturnType<typeof useChatViewStore.getState>> = {};
  if (focusMode !== undefined) viewUpdate.focusMode = focusMode;
  if (activeView !== undefined) viewUpdate.activeView = activeView;
  if (conversationMode !== undefined) viewUpdate.conversationMode = conversationMode;
  if (showMessageTimestamps !== undefined) viewUpdate.showMessageTimestamps = showMessageTimestamps;
  if (citations !== undefined) viewUpdate.citations = citations;
  if (tokenUsage !== undefined) viewUpdate.tokenUsage = tokenUsage;
  if (draftContent !== undefined) viewUpdate.draftContent = draftContent;
  if (editingMessageId !== undefined) viewUpdate.editingMessageId = editingMessageId;
  if (selectedMessage !== undefined) viewUpdate.selectedMessage = selectedMessage;
  if (Object.keys(viewUpdate).length > 0) useChatViewStore.setState(viewUpdate);

  const execUpdate: Partial<ReturnType<typeof useChatExecutionStore.getState>> = {};
  if (isLoading !== undefined) execUpdate.isLoading = isLoading;
  if (isLoadingMessages !== undefined) execUpdate.isLoadingMessages = isLoadingMessages;
  if (isStreaming !== undefined) execUpdate.isStreaming = isStreaming;
  if (currentStreamingMessageId !== undefined)
    execUpdate.currentStreamingMessageId = currentStreamingMessageId;
  if (pendingMessages !== undefined) execUpdate.pendingMessages = pendingMessages;
  if (toolTimelineByMessage !== undefined) execUpdate.toolTimelineByMessage = toolTimelineByMessage;
  if (thinkingByMessage !== undefined) execUpdate.thinkingByMessage = thinkingByMessage;
  if (agenticLoopStatus !== undefined) execUpdate.agenticLoopStatus = agenticLoopStatus;
  if (activeBranchId !== undefined) execUpdate.activeBranchId = activeBranchId;
  if (branches !== undefined) execUpdate.branches = branches;
  if (lastStreamActivityAt !== undefined) execUpdate.lastStreamActivityAt = lastStreamActivityAt;
  if (streamWatchdogTimerId !== undefined) execUpdate.streamWatchdogTimerId = streamWatchdogTimerId;
  if (Object.keys(execUpdate).length > 0) useChatExecutionStore.setState(execUpdate);
};

/**
 * subscribe — delegates to useChatMessageStore (which has subscribeWithSelector).
 * For selector-based subscriptions (App.tsx uses `useChatStore.subscribe(selector, listener)`).
 */
useChatStore.subscribe = useChatMessageStore.subscribe as typeof useChatMessageStore.subscribe;

// Selectors — delegate to sub-stores for execution + view, message store for data
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
export const selectActiveConversation = (state: ChatState) =>
  state.conversations.find((c) => c.id === state.activeConversationId);
export const selectNonArchivedConversations = (state: ChatState) =>
  state.conversations.filter((c) => !c.archived);
export const selectPinnedConversations = (state: ChatState) =>
  state.conversations.filter((c) => c.pinned && !c.archived);
export const selectToolTimelineByMessage = (state: ChatState) => state.toolTimelineByMessage;
export const selectThinkingByMessage = (state: ChatState) => state.thinkingByMessage;
export const selectAgenticLoopStatus = (state: ChatState) => state.agenticLoopStatus;

// Cross-store subscriptions
const IS_TEST_ENVIRONMENT =
  typeof process !== 'undefined' && (process.env['NODE_ENV'] === 'test' || process.env['VITEST']);

type ChatStoreModelSubscriptionState = {
  initialized: boolean;
  pending: Promise<void> | null;
  unsubscribe: (() => void) | null;
};

const CHAT_STORE_MODEL_SUBSCRIPTION_STATE = Symbol.for(
  'agiworkforce.chatStore.modelStoreSubscriptionState',
);

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
  if (subscriptionState.initialized) return;
  if (subscriptionState.pending) return subscriptionState.pending;

  subscriptionState.pending = (async () => {
    try {
      const modelStore = useModelStore as
        | {
            getState?: () => { selectedModel: string | null };
            subscribe?: (
              selector: (state: { selectedModel: string | null }) => string | null,
              listener: (selectedModel: string | null) => void,
            ) => () => void;
          }
        | undefined;
      if (!modelStore || typeof modelStore.getState !== 'function') return;

      const selectedModel = modelStore.getState().selectedModel;
      if (selectedModel)
        useChatViewStore.getState().updateTokenUsage({ max: getModelContextWindow(selectedModel) });

      if (typeof modelStore.subscribe === 'function') {
        subscriptionState.unsubscribe?.();
        subscriptionState.unsubscribe = modelStore.subscribe(
          (state) => state.selectedModel,
          (nextSelectedModel) => {
            if (nextSelectedModel)
              useChatViewStore
                .getState()
                .updateTokenUsage({ max: getModelContextWindow(nextSelectedModel) });
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

export function teardownChatStoreModelStoreSubscription(): void {
  const subscriptionState = getChatStoreModelSubscriptionState();
  subscriptionState.unsubscribe?.();
  subscriptionState.unsubscribe = null;
  subscriptionState.initialized = false;
  subscriptionState.pending = null;
  teardownChatViewModelSubscription();
}

let _unsubscribeAppModeReload: () => void = () => {};

if (typeof window !== 'undefined' && !IS_TEST_ENVIRONMENT) {
  _unsubscribeAppModeReload();
  _unsubscribeAppModeReload = useAppModeStore.subscribe(
    (state) => state.mode,
    (mode, prevMode) => {
      if (mode !== prevMode) {
        const user = useUnifiedAuthStore.getState().user;
        if (user?.id) {
          useChatMessageStore.setState({
            conversations: [],
            messages: [],
            activeConversationId: null,
            messagesByConversation: {},
          });
          void useChatMessageStore.getState().loadConversations(user.id);
        }
      }
    },
  );
  void initializeChatStoreModelStoreSubscription();
  initializeChatViewModelSubscription();
}
