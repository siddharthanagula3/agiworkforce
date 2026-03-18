import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import { api } from '@/services/api';
import { streamChat, type StreamDelta } from '@/services/streaming';
import type { ChatMessage, ConversationSummary, MessageAttachment } from '@/types/chat';
import type { Attachment } from '@/components/chat/AttachmentPreview';

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
  /** Global search query for conversations + messages */
  searchQuery: string;
  /** Search results: matching conversation IDs with snippet */
  searchResults: Array<{ conversationId: string; messageId: string; snippet: string }>;

  // --- Actions ---
  loadConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<string>;
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
  searchConversations: (query: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
}

/** Abort controllers keyed by conversationId — supports concurrent streams */
const abortControllers = new Map<string, AbortController>();
/** Tracks which conversation is currently streaming (for stopStreaming) */
let streamingConversationId: string | null = null;

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
          console.warn('Failed to load conversations:', err);
          set({
            error: err instanceof Error ? err.message : 'Failed to load conversations',
          });
        } finally {
          set({ isLoadingConversations: false });
        }
      },

      createConversation: async (title?: string) => {
        try {
          const data = await api.post<{ conversation: ConversationSummary }>(
            '/api/chat/conversations',
            { title: title ?? 'New Chat' },
          );
          const conversation = data.conversation;
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
          console.warn('Failed to delete conversation on server:', err);
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
          console.warn('Failed to load messages:', err);
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
            const uploads = await Promise.all(
              attachments.map((a) =>
                api.uploadFile({ uri: a.uri, name: a.fileName, type: a.mimeType }),
              ),
            );
            uploadedAttachments = uploads.map((u, i) => ({
              url: u.url,
              mimeType: attachments[i]!.mimeType,
              fileName: attachments[i]!.fileName,
            }));
          } catch {
            // Continue without attachments if upload fails
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

        // Create abort controller keyed by conversation
        const controller = new AbortController();
        abortControllers.set(conversationId, controller);
        streamingConversationId = conversationId;

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
                const state = get();
                const msgs = state.messages[conversationId] ?? [];
                const updatedMsgs = msgs.map((m) =>
                  m.id === assistantMessageId ? { ...m, isStreaming: false } : m,
                );

                // Update conversation with assistant's reply preview
                const finalContent = state.streamingContent;
                const preview = finalContent.slice(0, 100);

                set({
                  isStreaming: false,
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

                abortControllers.delete(conversationId);
                streamingConversationId = null;
              },

              onError: (error: Error) => {
                console.warn('Streaming error:', error.message);

                const state = get();
                const msgs = state.messages[conversationId] ?? [];
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
                  isStreaming: false,
                  streamingContent: '',
                  streamingReasoning: '',
                  messages: { ...state.messages, [conversationId]: updatedMsgs },
                });

                abortControllers.delete(conversationId);
                streamingConversationId = null;
              },
            },
            controller.signal,
          );
        } catch {
          // Handle synchronous errors from streamChat (e.g., network failure before stream starts)
          // Always clean up streaming state, even on abort
          abortControllers.delete(conversationId);
          streamingConversationId = null;

          if (controller.signal.aborted) {
            // Aborted intentionally (stop button) — streaming state was already cleared by stopStreaming
            return;
          }

          const state = get();
          const msgs = state.messages[conversationId] ?? [];
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
            isStreaming: false,
            streamingContent: '',
            streamingReasoning: '',
            messages: { ...state.messages, [conversationId]: updatedMsgs },
          });
        }
      },

      stopStreaming: () => {
        // Use the tracked streaming conversation, not currentConversationId
        const convId = streamingConversationId ?? get().currentConversationId;

        // Abort the controller for the streaming conversation
        if (convId) {
          const ctrl = abortControllers.get(convId);
          if (ctrl) {
            ctrl.abort();
            abortControllers.delete(convId);
          }
        }
        streamingConversationId = null;

        if (!convId) {
          set({ isStreaming: false, streamingContent: '', streamingReasoning: '' });
          return;
        }

        // Finalize the streaming message with whatever content we have
        const state = get();
        const msgs = state.messages[convId] ?? [];
        const updatedMsgs = msgs.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m));

        set({
          isStreaming: false,
          streamingContent: '',
          streamingReasoning: '',
          messages: { ...state.messages, [convId]: updatedMsgs },
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
          console.warn('Failed to rename conversation on server:', err);
          set({
            error: err instanceof Error ? err.message : 'Failed to rename conversation',
          });
        }
      },

      clearError: () => {
        set({ error: null });
      },

      searchConversations: (query: string) => {
        const trimmed = query.trim().toLowerCase();
        if (!trimmed) {
          set({ searchQuery: '', searchResults: [] });
          return;
        }

        set({ searchQuery: trimmed });

        const state = get();
        const results: Array<{ conversationId: string; messageId: string; snippet: string }> = [];

        // Search through all messages
        for (const [convId, msgs] of Object.entries(state.messages)) {
          for (const msg of msgs) {
            if (msg.content.toLowerCase().includes(trimmed)) {
              const idx = msg.content.toLowerCase().indexOf(trimmed);
              const start = Math.max(0, idx - 30);
              const end = Math.min(msg.content.length, idx + trimmed.length + 30);
              const snippet =
                (start > 0 ? '...' : '') +
                msg.content.slice(start, end) +
                (end < msg.content.length ? '...' : '');
              results.push({ conversationId: convId, messageId: msg.id, snippet });
              break; // one result per conversation
            }
          }
        }

        // Also search conversation titles
        for (const conv of state.conversations) {
          if (
            conv.title.toLowerCase().includes(trimmed) &&
            !results.some((r) => r.conversationId === conv.id)
          ) {
            results.push({ conversationId: conv.id, messageId: '', snippet: conv.title });
          }
        }

        set({ searchResults: results });
      },

      deleteMessage: (conversationId, messageId) => {
        set((state) => {
          const msgs = state.messages[conversationId];
          if (!msgs) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: msgs.filter((m) => m.id !== messageId),
            },
          };
        });
      },
    }),
    {
      name: 'chat-store',
      storage: createJSONStorage(() => mmkvStorage),
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
        };
      },
    },
  ),
);
