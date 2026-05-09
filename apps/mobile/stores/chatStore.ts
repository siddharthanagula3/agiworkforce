import { Alert } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { QueueFullError } from '@agiworkforce/runtime';
import { mmkvStorage } from '@/lib/mmkv';
import { getMobileSendQueue } from '@/lib/sendQueue';
import { api, ApiPaywallError } from '@/services/api';
import { streamChat, type StreamDelta } from '@/services/streaming';
import { useProjectStore } from '@/stores/projectStore';
import type { ChatMessage, ConversationSummary, MessageAttachment } from '@/types/chat';
import type { Attachment } from '@/components/chat/AttachmentPreview';
import type { UploadFileInput, UploadFileResult } from '@/services/api';

/** Paywall error state captured when the API returns a tier-cap paywall response. */
export interface PaywallErrorState {
  feature: string;
  requiredTier: string;
  reason: string;
}

/** Chat mode — determines how the AI processes the conversation. */
export type ChatMode = 'chat' | 'research' | 'create';

/** Per-chat response style. */
export type ChatStyle = 'normal' | 'concise' | 'detailed' | 'creative';

/** Per-chat tool loading strategy. */
export type ToolAccess = 'auto' | 'on-demand' | 'always';

/** Feature toggles available in the "Add to Chat" sheet. */
export interface ChatFeatures {
  webSearch: boolean;
  imageGen: boolean;
  health: boolean;
}

interface ChatState {
  /** All conversation summaries for the sidebar */
  conversations: ConversationSummary[];
  /** Currently active conversation ID */
  currentConversationId: string | null;
  /** Messages keyed by conversation ID */
  messages: Record<string, ChatMessage[]>;
  /** Whether an LLM response is currently streaming */
  isStreaming: boolean;
  /** Accumulated streaming content for the current response */
  streamingContent: string;
  /** Accumulated streaming reasoning/thinking content */
  streamingReasoning: string;
  /** Whether conversations are loading */
  isLoadingConversations: boolean;
  /** Whether messages are loading for the current conversation */
  isLoadingMessages: boolean;
  /** Error message from the last failed operation */
  error: string | null;
  /** Paywall error from the last tier-blocked request. Non-null triggers PaywallBottomSheet. */
  paywallError: PaywallErrorState | null;
  /** Global search query for conversations + messages */
  searchQuery: string;
  /** Search results: matching conversation IDs with snippet and optional match offset for highlighting */
  searchResults: Array<{
    conversationId: string;
    messageId: string;
    snippet: string;
    /** Byte offset within snippet where the match starts (for text highlighting) */
    matchStart?: number;
    /** Length of the matched text (for text highlighting) */
    matchLength?: number;
  }>;
  /** Whether a search is pending (debounce in flight) */
  isSearching: boolean;
  /** Whether an edit operation is currently in progress */
  isEditing: boolean;
  /** Retry attempt counts keyed by message ID */
  retryAttempts: Record<string, number>;
  /** Current chat mode — chat, research, or create */
  chatMode: ChatMode;
  /** Per-chat response style */
  chatStyle: ChatStyle;
  /** Per-chat tool loading strategy */
  toolAccess: ToolAccess;
  /** Feature toggles for web search, image generation, health */
  features: ChatFeatures;

  // --- Actions ---
  loadConversations: () => Promise<void>;
  createConversation: (title?: string, projectId?: string) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  sendMessage: (
    conversationId: string,
    content: string,
    model: string,
    attachments?: Attachment[],
  ) => Promise<void>;
  stopStreaming: () => void;
  renameConversation: (id: string, title: string) => Promise<void>;
  setCurrentConversationId: (id: string | null) => void;
  clearError: () => void;
  clearPaywallError: () => void;
  searchConversations: (query: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  retryMessage: (conversationId: string, messageId: string) => void;
  editMessage: (conversationId: string, messageId: string, newContent: string) => void;
  pinConversation: (id: string) => Promise<void>;
  makeConversationPermanent: (id: string) => void;
  clearQueuedPlaceholders: (conversationId: string) => void;
  setChatMode: (mode: ChatMode) => void;
  setChatStyle: (style: ChatStyle) => void;
  setToolAccess: (access: ToolAccess) => void;
  setFeature: (feature: keyof ChatFeatures, enabled: boolean) => void;
}

/** Abort controllers keyed by conversationId — supports concurrent streams. Capped to prevent leaks. */
const abortControllers = new Map<string, AbortController>();
const MAX_ABORT_CONTROLLERS = 50;
/** Tracks which conversations are currently streaming — supports concurrent streams. */
const streamingConversations = new Set<string>();
/** Debounce timer for search */
let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
/** Maximum retry attempts before showing permanent failure */
const MAX_RETRY_ATTEMPTS = 3;
/** Tracks when thinking/reasoning started, per conversation. */
const thinkingStartTimes = new Map<string, number>();

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Upload a single file with up to MAX_UPLOAD_RETRIES attempts.
 * Uses exponential backoff between retries (1s, 2s).
 * Surfaces a clear Alert on permanent failure so the user knows to retry.
 */
const MAX_UPLOAD_RETRIES = 2;

async function uploadWithRetry(
  file: UploadFileInput,
  fileName: string,
): Promise<UploadFileResult | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    try {
      return await api.uploadFile(file);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // 401 errors are already handled inside api.uploadFile (shows alert, throws)
      // so we re-throw immediately rather than retrying
      if (lastError.message.includes('session expired') || lastError.message.includes('401')) {
        throw lastError;
      }

      if (attempt < MAX_UPLOAD_RETRIES) {
        // Backoff before next retry: 1s, 2s
        await new Promise<void>((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  // All retries exhausted — show a user-facing error
  Alert.alert(
    'Upload Failed',
    `Could not upload "${fileName}". Please check your connection and try again.`,
    [{ text: 'OK' }],
  );
  return null;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      messages: {},
      isStreaming: false,
      streamingContent: '',
      streamingReasoning: '',
      isLoadingConversations: false,
      isLoadingMessages: false,
      error: null,
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      isEditing: false,
      paywallError: null,
      retryAttempts: {},
      chatMode: 'chat',
      chatStyle: 'normal',
      toolAccess: 'auto',
      features: { webSearch: true, imageGen: true, health: false },

      setCurrentConversationId: (id) => {
        set({ currentConversationId: id });
      },

      loadConversations: async () => {
        set({ isLoadingConversations: true, error: null });
        try {
          const data = await api.get<{ conversations: ConversationSummary[] }>(
            '/api/chat/conversations',
          );
          set({ conversations: data.conversations ?? [] });
        } catch (err) {
          // Keep existing conversations on failure — offline resilience
          set({
            error: err instanceof Error ? err.message : 'Failed to load conversations',
          });
        } finally {
          set({ isLoadingConversations: false });
        }
      },

      createConversation: async (title?: string, projectId?: string) => {
        // Auto-inherit active project if caller didn't specify one
        const effectiveProjectId =
          projectId ?? useProjectStore.getState().activeProjectId ?? undefined;
        try {
          const data = await api.post<{ conversation: ConversationSummary }>(
            '/api/chat/conversations',
            { title: title ?? 'New Chat', projectId: effectiveProjectId },
          );
          const conversation = { ...data.conversation, projectId: effectiveProjectId };
          set((state) => ({
            conversations: [conversation, ...state.conversations],
            currentConversationId: conversation.id,
            messages: { ...state.messages, [conversation.id]: [] },
          }));
          return conversation.id;
        } catch {
          // Fallback: create local-only conversation for offline use
          const localId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const localConversation: ConversationSummary = {
            id: localId,
            title: title ?? 'New Chat',
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            messageCount: 0,
            pinned: false,
            projectId: effectiveProjectId,
          };
          set((state) => ({
            conversations: [localConversation, ...state.conversations],
            currentConversationId: localId,
            messages: { ...state.messages, [localId]: [] },
          }));
          return localId;
        }
      },

      deleteConversation: async (id) => {
        // Optimistically remove from state
        set((state) => {
          const { [id]: _, ...remainingMessages } = state.messages;
          return {
            conversations: state.conversations.filter((c) => c.id !== id),
            messages: remainingMessages,
            currentConversationId:
              state.currentConversationId === id ? null : state.currentConversationId,
          };
        });

        try {
          await api.delete(`/api/chat/conversations/${id}`);
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Failed to delete conversation',
          });
        }
      },

      loadMessages: async (conversationId) => {
        // Only skip if we have actual persisted messages
        const existing = get().messages[conversationId];
        if (existing && existing.length > 0 && !existing.some((m) => m.isStreaming)) return;

        set({ isLoadingMessages: true, error: null });
        try {
          const data = await api.get<{ messages: ChatMessage[] }>(
            `/api/chat/conversations/${conversationId}`,
          );
          set((state) => ({
            messages: {
              ...state.messages,
              [conversationId]: data.messages ?? [],
            },
          }));
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Failed to load messages',
          });
          // Initialize empty array so the UI doesn't stay in loading state
          set((state) => ({
            messages: {
              ...state.messages,
              [conversationId]: state.messages[conversationId] ?? [],
            },
          }));
        } finally {
          set({ isLoadingMessages: false });
        }
      },

      sendMessage: async (conversationId, content, model, attachments) => {
        // Route the prompt through the priority send queue first. The mobile
        // queue persists `next` and `later` lanes to MMKV so a deferred
        // send survives an OS-driven background process kill.
        const queue = getMobileSendQueue();
        try {
          queue.enqueue({ value: content, mode: 'prompt' });
        } catch (err) {
          if (err instanceof QueueFullError) {
            Alert.alert(
              'Queue full',
              `The "${err.lane}" lane is at capacity. Please wait for prior sends to drain.`,
            );
            return;
          }
          throw err;
        }
        // Drain immediately — current behavior is direct send. The queue
        // captures the command for cancellation / replay; we don't defer it.
        queue.dequeue();

        // Cancel any existing stream for this conversation
        const existingController = abortControllers.get(conversationId);
        if (existingController) {
          existingController.abort();
          abortControllers.delete(conversationId);
        }

        // Upload attachments and build message attachment metadata
        let uploadedAttachments: MessageAttachment[] | undefined;
        if (attachments && attachments.length > 0) {
          try {
            const uploadResults = await Promise.all(
              attachments.map((a) =>
                uploadWithRetry({ uri: a.uri, name: a.fileName, type: a.mimeType }, a.fileName),
              ),
            );
            // Filter out null results (individual failures already showed alerts)
            const successful = uploadResults
              .map((result, i) => ({ result, attachment: attachments[i]! }))
              .filter((x) => x.result !== null);

            if (successful.length > 0) {
              uploadedAttachments = successful.map(({ result, attachment }) => ({
                url: result!.url,
                mimeType: attachment.mimeType,
                fileName: attachment.fileName,
              }));
            }
          } catch {
            // 401 / session-expired errors bubble up from uploadWithRetry —
            // continue without attachments so the message still sends
          }
        }

        const userMessage: ChatMessage = {
          id: generateId(),
          conversationId,
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
          model,
          attachments: uploadedAttachments,
        };

        const assistantMessageId = generateId();
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          conversationId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          isStreaming: true,
          model,
        };

        // Build message history with vision support
        const existingMessages = get().messages[conversationId] ?? [];
        const historyMessages: Array<{
          role: string;
          content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
        }> = [
          ...existingMessages
            .filter((m) => !m.isStreaming)
            .map((m) => {
              // If message has image attachments, use vision content format
              const imageAttachments = m.attachments?.filter((a) =>
                a.mimeType.startsWith('image/'),
              );
              if (imageAttachments && imageAttachments.length > 0) {
                return {
                  role: m.role,
                  content: [
                    ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
                    ...imageAttachments.map((a) => ({
                      type: 'image_url' as const,
                      image_url: { url: a.url },
                    })),
                  ],
                };
              }
              return { role: m.role, content: m.content };
            }),
        ];

        // Build current user message with attachments
        const imageUploads = uploadedAttachments?.filter((a) => a.mimeType.startsWith('image/'));
        const fileUploads = uploadedAttachments?.filter((a) => !a.mimeType.startsWith('image/'));

        // Build content prefix for file attachments
        let messageContent = content;
        if (fileUploads && fileUploads.length > 0) {
          const fileRefs = fileUploads
            .map((f) => `[Attached file: ${f.fileName} (${f.mimeType})]`)
            .join('\n');
          messageContent = fileRefs + (content ? '\n\n' + content : '');
        }

        if (imageUploads && imageUploads.length > 0) {
          historyMessages.push({
            role: 'user',
            content: [
              ...(messageContent ? [{ type: 'text', text: messageContent }] : []),
              ...imageUploads.map((a) => ({
                type: 'image_url',
                image_url: { url: a.url },
              })),
            ],
          });
        } else {
          historyMessages.push({ role: 'user', content: messageContent });
        }

        // Inject active project instructions as a system message
        const projectState = useProjectStore.getState();
        if (projectState.activeProjectId) {
          const activeProject = projectState.projects.find(
            (p) => p.id === projectState.activeProjectId,
          );
          if (activeProject?.instructions?.trim()) {
            historyMessages.unshift({
              role: 'system',
              content: activeProject.instructions.trim(),
            });
          }
        }

        // Add user message + placeholder assistant message
        set((state) => {
          const existing = state.messages[conversationId] ?? [];
          return {
            messages: {
              ...state.messages,
              [conversationId]: [...existing, userMessage, assistantMessage],
            },
            isStreaming: true,
            streamingContent: '',
            streamingReasoning: '',
          };
        });

        // Update conversation summary
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, lastMessage: content, updatedAt: new Date().toISOString() }
              : c,
          ),
        }));

        // Create abort controller keyed by conversation (evict oldest if over cap)
        const controller = new AbortController();
        if (abortControllers.size >= MAX_ABORT_CONTROLLERS) {
          const oldestKey = abortControllers.keys().next().value;
          if (oldestKey) {
            abortControllers.get(oldestKey)?.abort();
            abortControllers.delete(oldestKey);
          }
        }
        abortControllers.set(conversationId, controller);
        streamingConversations.add(conversationId);

        try {
          await streamChat(
            {
              model,
              messages: historyMessages,
              stream: true,
              thinking: true,
            },
            {
              onDelta: (delta: StreamDelta) => {
                const state = get();

                let newContent = state.streamingContent;
                let newReasoning = state.streamingReasoning;

                if (delta.content) {
                  newContent += delta.content;
                }
                if (delta.reasoning) {
                  // Track when thinking first starts for duration calculation
                  if (!thinkingStartTimes.has(conversationId) && !state.streamingReasoning) {
                    thinkingStartTimes.set(conversationId, Date.now());
                  }
                  newReasoning += delta.reasoning;
                }

                // Update the streaming assistant message in place
                const msgs = state.messages[conversationId] ?? [];
                const updatedMsgs = msgs.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        content: newContent,
                        reasoning: newReasoning || undefined,
                        isStreaming: true,
                      }
                    : m,
                );

                set({
                  streamingContent: newContent,
                  streamingReasoning: newReasoning,
                  messages: { ...state.messages, [conversationId]: updatedMsgs },
                });
              },

              onDone: () => {
                // Compute thinking duration if reasoning was streamed
                const startedAt = thinkingStartTimes.get(conversationId);
                const thinkingDuration = startedAt ? (Date.now() - startedAt) / 1000 : undefined;
                thinkingStartTimes.delete(conversationId);

                const state = get();
                const msgs = state.messages[conversationId] ?? [];
                const updatedMsgs = msgs.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        isStreaming: false,
                        metadata: {
                          ...m.metadata,
                          ...(thinkingDuration !== undefined ? { thinkingDuration } : {}),
                        },
                      }
                    : m,
                );

                // Update conversation with assistant's reply preview
                const finalContent = state.streamingContent;
                const preview = finalContent.slice(0, 100);

                abortControllers.delete(conversationId);
                streamingConversations.delete(conversationId);

                set({
                  isStreaming: streamingConversations.size > 0,
                  streamingContent: '',
                  streamingReasoning: '',
                  messages: { ...state.messages, [conversationId]: updatedMsgs },
                  conversations: state.conversations.map((c) =>
                    c.id === conversationId
                      ? {
                          ...c,
                          lastMessage: preview,
                          messageCount: (c.messageCount ?? 0) + 2,
                          updatedAt: new Date().toISOString(),
                        }
                      : c,
                  ),
                });
              },

              onError: (error: Error) => {
                thinkingStartTimes.delete(conversationId);
                abortControllers.delete(conversationId);
                streamingConversations.delete(conversationId);

                const state = get();
                const msgs = state.messages[conversationId] ?? [];

                // Detect paywall errors and store them separately so the UI can
                // show the PaywallBottomSheet instead of a generic error message.
                if (error instanceof ApiPaywallError) {
                  const updatedMsgs = msgs.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          content: state.streamingContent || '',
                          isStreaming: false,
                        }
                      : m,
                  );
                  set({
                    isStreaming: streamingConversations.size > 0,
                    streamingContent: '',
                    streamingReasoning: '',
                    messages: { ...state.messages, [conversationId]: updatedMsgs },
                    paywallError: {
                      feature: error.feature,
                      requiredTier: error.requiredTier,
                      reason: error.reason,
                    },
                  });
                  return;
                }

                const updatedMsgs = msgs.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        content:
                          state.streamingContent || 'Something went wrong. Please try again.',
                        isStreaming: false,
                      }
                    : m,
                );

                set({
                  isStreaming: streamingConversations.size > 0,
                  streamingContent: '',
                  streamingReasoning: '',
                  messages: { ...state.messages, [conversationId]: updatedMsgs },
                });
              },
            },
            controller.signal,
          );
        } catch (caughtErr) {
          // Handle synchronous errors from streamChat (e.g., network failure before stream starts)
          // Always clean up streaming state, even on abort
          thinkingStartTimes.delete(conversationId);
          abortControllers.delete(conversationId);
          streamingConversations.delete(conversationId);

          if (controller.signal.aborted) {
            // Aborted intentionally (stop button) — streaming state was already cleared by stopStreaming
            return;
          }

          const state = get();
          const msgs = state.messages[conversationId] ?? [];

          // Paywall errors from the synchronous throw path (ApiPaywallError propagated
          // out of streamChat before any streaming started).
          if (caughtErr instanceof ApiPaywallError) {
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: state.streamingContent || '', isStreaming: false }
                : m,
            );
            set({
              isStreaming: streamingConversations.size > 0,
              streamingContent: '',
              streamingReasoning: '',
              messages: { ...state.messages, [conversationId]: updatedMsgs },
              paywallError: {
                feature: caughtErr.feature,
                requiredTier: caughtErr.requiredTier,
                reason: caughtErr.reason,
              },
            });
            return;
          }

          const updatedMsgs = msgs.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content:
                    state.streamingContent ||
                    'Failed to connect. Check your network and try again.',
                  isStreaming: false,
                }
              : m,
          );

          set({
            isStreaming: streamingConversations.size > 0,
            streamingContent: '',
            streamingReasoning: '',
            messages: { ...state.messages, [conversationId]: updatedMsgs },
          });
        }
      },

      stopStreaming: () => {
        // Prefer stopping the current conversation's stream; fall back to stopping all
        const currentId = get().currentConversationId;
        const targetId =
          currentId && streamingConversations.has(currentId)
            ? currentId
            : (streamingConversations.values().next().value ?? null);

        if (!targetId) {
          // No tracked streaming conversation — clear global state and finalize
          // any messages that were marked as streaming (e.g. manually injected state).
          const state = get();
          const cid = state.currentConversationId;
          if (cid) {
            const msgs = state.messages[cid] ?? [];
            const hasStreaming = msgs.some((m) => m.isStreaming);
            if (hasStreaming) {
              const updatedMsgs = msgs.map((m) =>
                m.isStreaming ? { ...m, isStreaming: false } : m,
              );
              set({
                isStreaming: false,
                streamingContent: '',
                streamingReasoning: '',
                messages: { ...state.messages, [cid]: updatedMsgs },
              });
              return;
            }
          }
          set({ isStreaming: false, streamingContent: '', streamingReasoning: '' });
          return;
        }

        thinkingStartTimes.delete(targetId);
        const ctrl = abortControllers.get(targetId);
        if (ctrl) {
          ctrl.abort();
          abortControllers.delete(targetId);
        }
        streamingConversations.delete(targetId);

        // Finalize the streaming message with whatever content we have
        const state = get();
        const msgs = state.messages[targetId] ?? [];
        const updatedMsgs = msgs.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m));

        set({
          isStreaming: streamingConversations.size > 0,
          streamingContent: '',
          streamingReasoning: '',
          messages: { ...state.messages, [targetId]: updatedMsgs },
        });
      },

      renameConversation: async (id, title) => {
        // Optimistic update
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
        }));

        try {
          await api.put(`/api/chat/conversations/${id}`, { title });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Failed to rename conversation',
          });
        }
      },

      clearError: () => {
        set({ error: null });
      },

      clearPaywallError: () => {
        set({ paywallError: null });
      },

      searchConversations: (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) {
          // Clear search immediately when query is emptied
          if (searchDebounceTimer !== undefined) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = undefined;
          }
          set({ searchQuery: '', searchResults: [], isSearching: false });
          return;
        }

        // Update query display immediately, but debounce the actual search
        set({ searchQuery: trimmed, isSearching: true });

        if (searchDebounceTimer !== undefined) {
          clearTimeout(searchDebounceTimer);
        }

        searchDebounceTimer = setTimeout(() => {
          searchDebounceTimer = undefined;
          const lower = trimmed.toLowerCase();
          const state = get();
          const results: Array<{
            conversationId: string;
            messageId: string;
            snippet: string;
            matchStart?: number;
            matchLength?: number;
          }> = [];

          // Search through all messages — capture match position for highlight
          for (const [convId, msgs] of Object.entries(state.messages)) {
            for (const msg of msgs) {
              const contentLower = (msg.content ?? '').toLowerCase();
              const idx = contentLower.indexOf(lower);
              if (idx !== -1) {
                const start = Math.max(0, idx - 30);
                const end = Math.min(msg.content.length, idx + lower.length + 30);
                const snippet =
                  (start > 0 ? '...' : '') +
                  msg.content.slice(start, end) +
                  (end < msg.content.length ? '...' : '');
                results.push({
                  conversationId: convId,
                  messageId: msg.id,
                  snippet,
                  // Adjust matchStart relative to snippet (accounting for '...' prefix)
                  matchStart: idx - start + (start > 0 ? 3 : 0),
                  matchLength: trimmed.length,
                });
                break; // one result per conversation
              }
            }
          }

          // Also search conversation titles
          for (const conv of state.conversations) {
            const titleLower = conv.title.toLowerCase();
            const idx = titleLower.indexOf(lower);
            if (idx !== -1 && !results.some((r) => r.conversationId === conv.id)) {
              results.push({
                conversationId: conv.id,
                messageId: '',
                snippet: conv.title,
                matchStart: idx,
                matchLength: trimmed.length,
              });
            }
          }

          set({ searchResults: results, isSearching: false });
        }, 300);
      },

      deleteMessage: (conversationId, messageId) => {
        set((state) => {
          const msgs = state.messages[conversationId];
          if (!msgs) return state;
          // Also clean up retry count for the deleted message
          const { [messageId]: _, ...remainingAttempts } = state.retryAttempts;
          return {
            messages: {
              ...state.messages,
              [conversationId]: msgs.filter((m) => m.id !== messageId),
            },
            retryAttempts: remainingAttempts,
          };
        });
      },

      retryMessage: (conversationId, messageId) => {
        const state = get();

        // Guard: don't retry while streaming
        if (state.isStreaming) return;

        const msgs = state.messages[conversationId];
        if (!msgs) return;

        const msgIndex = msgs.findIndex((m) => m.id === messageId);
        if (msgIndex < 0) return;

        const assistantMsg = msgs[msgIndex];
        if (!assistantMsg || assistantMsg.role !== 'assistant') return;

        // Find the preceding user message
        const userMsg = msgIndex > 0 ? msgs[msgIndex - 1] : null;
        if (!userMsg || userMsg.role !== 'user') return;

        // Track retry count for this message
        const currentAttempts = state.retryAttempts[messageId] ?? 0;
        const nextAttempt = currentAttempts + 1;

        if (nextAttempt > MAX_RETRY_ATTEMPTS) {
          Alert.alert(
            'Retry Limit Reached',
            `This message has failed ${MAX_RETRY_ATTEMPTS} times. Please check your connection and try a new message.`,
            [{ text: 'OK' }],
          );
          return;
        }

        // Exponential backoff delay: 0s, 1s, 2s (attempt 1, 2, 3)
        const backoffMs = nextAttempt > 1 ? 1000 * Math.pow(2, nextAttempt - 2) : 0;

        const userContent = userMsg.content;
        const userModel = userMsg.model ?? assistantMsg.model ?? 'auto-balanced';

        // Record new attempt count (keyed by the original messageId)
        set((s) => ({
          retryAttempts: { ...s.retryAttempts, [messageId]: nextAttempt },
        }));

        // Remove both user + assistant messages before re-sending
        const trimmedMsgs = msgs.slice(0, msgIndex - 1);
        set((s) => ({
          messages: { ...s.messages, [conversationId]: trimmedMsgs },
        }));

        if (backoffMs > 0) {
          setTimeout(() => {
            get().sendMessage(conversationId, userContent, userModel);
          }, backoffMs);
        } else {
          get().sendMessage(conversationId, userContent, userModel);
        }
      },

      editMessage: (conversationId, messageId, newContent) => {
        const state = get();

        // Guard: prevent editing while a stream is in progress
        if (state.isStreaming) {
          Alert.alert(
            'Cannot Edit',
            'Please wait for the current response to finish before editing a message.',
            [{ text: 'OK' }],
          );
          return;
        }

        // Guard: prevent re-entrant edits
        if (state.isEditing) return;

        const msgs = state.messages[conversationId];
        if (!msgs) return;

        const msgIndex = msgs.findIndex((m) => m.id === messageId);
        if (msgIndex < 0) return;

        const targetMsg = msgs[msgIndex];
        if (!targetMsg || targetMsg.role !== 'user') return;

        const userModel = targetMsg.model ?? 'auto-balanced';

        // Set editing state so UI can show loading indicator
        set({ isEditing: true });

        // Keep messages up to (but not including) the target message
        const trimmedMsgs = msgs.slice(0, msgIndex);
        set((s) => ({
          messages: { ...s.messages, [conversationId]: trimmedMsgs },
        }));

        // Re-send with new content, then clear editing flag
        get()
          .sendMessage(conversationId, newContent, userModel)
          .catch((err) => {
            set({
              error: err instanceof Error ? err.message : 'Failed to re-send edited message',
            });
          })
          .finally(() => {
            set({ isEditing: false });
          });
      },

      pinConversation: async (id) => {
        const conv = get().conversations.find((c) => c.id === id);
        if (!conv) return;
        const pinned = !conv.pinned;
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, pinned } : c)),
        }));
        try {
          await api.put(`/api/chat/conversations/${id}`, { pinned });
        } catch {
          // Revert on failure
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === id ? { ...c, pinned: !pinned } : c,
            ),
          }));
        }
      },

      makeConversationPermanent: (id) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, temporary: false } : c,
          ),
        }));
      },

      clearQueuedPlaceholders: (conversationId) => {
        set((state) => {
          const msgs = state.messages[conversationId];
          if (!msgs) return state;
          // Remove any streaming placeholder messages that were queued offline
          return {
            messages: {
              ...state.messages,
              [conversationId]: msgs.filter((m) => !m.isStreaming),
            },
          };
        });
      },

      setChatMode: (mode) => {
        set({ chatMode: mode });
      },

      setChatStyle: (style) => {
        set({ chatStyle: style });
      },

      setToolAccess: (access) => {
        set({ toolAccess: access });
      },

      setFeature: (feature, enabled) => {
        set((state) => ({
          features: { ...state.features, [feature]: enabled },
        }));
      },
    }),
    {
      name: 'chat-store',
      storage: createJSONStorage(() => mmkvStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[chatStore] Hydration failed:', error);
      },
      partialize: (state) => {
        // Persist conversations list and messages for offline access
        // Do NOT persist streaming state
        // Cap persisted data to prevent unbounded MMKV growth
        const MAX_CONVERSATIONS = 200;
        const MAX_MESSAGES_PER_CONVERSATION = 100;

        const conversations = state.conversations.slice(0, MAX_CONVERSATIONS);
        const conversationIds = new Set(conversations.map((c) => c.id));

        const messages: Record<string, ChatMessage[]> = {};
        for (const [id, msgs] of Object.entries(state.messages)) {
          if (conversationIds.has(id)) {
            messages[id] = msgs.filter((m) => !m.isStreaming).slice(-MAX_MESSAGES_PER_CONVERSATION);
          }
        }

        return {
          conversations,
          messages,
          currentConversationId: state.currentConversationId,
          chatMode: state.chatMode,
          chatStyle: state.chatStyle,
          toolAccess: state.toolAccess,
          features: state.features,
        };
      },
    },
  ),
);
