import { Alert } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { agiNativeColors } from '@agiworkforce/design-tokens';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { api } from '@/services/api';
import { useAuthStore } from '@/src/features/auth/store';
import { captureCloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  executionModeForConversation,
  executionModeForModel,
  executionModeForSelection,
  providerForExecutionMode,
  type ConversationExecutionMode,
} from '@/src/features/chat/utils/conversationMode';
import type { ChatMessage, ConversationSummary } from '@/types/chat';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import {
  ManagedCloudConversationListResponseSchema,
  ManagedCloudConversationResponseSchema,
  ManagedCloudCreateConversationResponseSchema,
  ManagedCloudUpdateConversationRequestSchema,
  managedCloudConversationPath,
  normalizeManagedCloudConversation,
  normalizeManagedCloudMessage,
  type ManagedCloudConversation,
} from '@agiworkforce/cloud-contracts';
import { markConversationForSync, markMessageForSync, syncNow } from '@/services/cloudSyncEngine';
import { setCloudMessageReactionRemote } from '@/src/features/chat/services/cloudMessageMutations';
import { getDurableGeneratedImagePath } from '@/src/features/image/services/imagegen';
import {
  deriveAndMapToMobileArtifacts,
  generatedImageToMobileArtifact,
  useArtifactStore,
} from '@/src/features/artifacts/store';
import type { MobileArtifactProvenance } from '@/src/features/artifacts/types';
import { getConversationMessageStore } from './conversationRepository';
import { useCloudSyncStateStore } from './cloudSyncStateStore';
// SEPARATION-FIX: cloud conversations are physically separated into their own store.
// Lazy import to avoid circular dependency at module initialisation time.
function getCloudStore() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatCloudMessageStore } =
    require('@/stores/chat/chatCloudMessageStore') as typeof import('@/stores/chat/chatCloudMessageStore');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return useChatCloudMessageStore;
}
export { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';

export interface ForkConversationOptions {
  title?: string;
  model?: string;
  /**
   * The message id in the source conversation at which this fork branches. When
   * omitted, the fork branches after the whole thread (the last source message).
   * Reuses the shared BranchNavigator `forkPointMessageId` semantics.
   */
  forkPointMessageId?: string;
}

interface MessageState {
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  messages: Record<string, ChatMessage[]>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;

  setCurrentConversationId: (id: string | null) => void;
  /** Clear shared UI selection only when it points at an outgoing Cloud account. */
  clearCloudConversationSelection: (cloudConversationIds: string[]) => void;
  loadConversations: () => Promise<void>;
  createConversation: (title?: string, projectId?: string) => Promise<string>;
  forkConversation: (
    sourceConversationId: string,
    options?: ForkConversationOptions,
  ) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  pinConversation: (id: string) => Promise<void>;
  makeConversationPermanent: (id: string) => void;
  markConversationRead: (id: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  setMessageReaction: (
    conversationId: string,
    messageId: string,
    reaction: 'thumbsUp' | 'thumbsDown' | null,
  ) => void;
  enqueueOfflineMessage: (
    conversationId: string,
    content: string,
    model: string,
    queueId: string,
  ) => void;
  beginImageGeneration: (
    conversationId: string,
    commandContent: string,
    prompt: string,
    model: string,
  ) => string;
  completeImageGeneration: (
    conversationId: string,
    assistantMessageId: string,
    result: {
      imageUrl: string;
      persisted?: boolean;
      persistenceWarning?: string;
      revisedPrompt?: string;
      model?: string;
    },
  ) => void;
  failImageGeneration: (
    conversationId: string,
    assistantMessageId: string,
    errorMessage: string,
  ) => void;
  resolveOfflineMessage: (conversationId: string, queueId: string) => void;
  clearQueuedPlaceholders: (conversationId: string) => void;
}

export const useChatMessageStore = create<MessageState>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      messages: {},
      isLoadingConversations: false,
      isLoadingMessages: false,

      setCurrentConversationId: (id) => {
        set({ currentConversationId: id });
      },

      clearCloudConversationSelection: (cloudConversationIds) => {
        const cloudIds = new Set(cloudConversationIds);
        set((state) =>
          state.currentConversationId && cloudIds.has(state.currentConversationId)
            ? { currentConversationId: null }
            : {},
        );
      },

      loadConversations: async () => {
        set({ isLoadingConversations: true });
        try {
          // SEPARATION-FIX: Cloud conversations fetched from the API are routed
          // to useChatCloudMessageStore, never written into this local store.
          // This store only holds Local Mode conversations.
          if (shouldLoadCloudConversationList()) {
            const data = ManagedCloudConversationListResponseSchema.parse(
              // `archived=exclude` matters: the server default is `include`, so
              // omitting it put chats the user archived (on any surface) straight
              // back into the Mobile chat list — archiving looked broken. Web
              // reads them separately via `archived=only` in Settings → Archived
              // chats; Mobile now does the same.
              await api.get<unknown>(
                '/api/chat/conversations?includeHistoryStats=1&archived=exclude',
              ),
            );
            getCloudStore()
              .getState()
              .setCloudConversations(
                data.conversations
                  .map(normalizeManagedCloudConversation)
                  .map(normalizeManagedCloudConversationForMobile),
                data.historyStats,
              );
          }
        } catch {
          // Keep existing conversations on failure — offline resilience
        } finally {
          set({ isLoadingConversations: false });
        }
      },

      createConversation: async (title?: string, projectId?: string) => {
        const selectedModel = useModelStore.getState().selectedModel;
        const requestedMode = useChatAppModeStore.getState().appMode;
        const effectiveProjectId =
          requestedMode === 'local'
            ? (projectId ?? useProjectStore.getState().activeProjectId ?? undefined)
            : resolveCloudProjectId(projectId);
        const selectedModelMode = executionModeForSelection(selectedModel, requestedMode);
        const conversationModel = selectedModelMode === requestedMode ? selectedModel : undefined;

        return createConversationForMode(
          set,
          title,
          effectiveProjectId,
          conversationModel,
          requestedMode,
        );
      },

      forkConversation: async (sourceConversationId, options) => {
        const sourceStore = getConversationMessageStore(sourceConversationId);
        const sourceState = sourceStore.getState();
        const sourceConversation = sourceState.conversations.find(
          (conversation) => conversation.id === sourceConversationId,
        );
        const sourceMessages = sourceState.messages[sourceConversationId] ?? [];
        const sourceMode = sourceConversation
          ? executionModeForConversation(sourceConversation)
          : executionModeForModel(options?.model);
        const requestedModelMode = options?.model
          ? executionModeForSelection(options.model, sourceMode)
          : sourceMode;
        const forkModel =
          options?.model && requestedModelMode === sourceMode
            ? options.model
            : sourceConversation?.model;
        const forkTitle =
          options?.title ??
          `${sourceConversation?.title ?? 'Chat'} (${options?.model ? 'model' : 'copy'} fork)`;
        const forkId = await createConversationForMode(
          set,
          forkTitle,
          // Carry the source chat's project in BOTH modes. The fork stays in
          // sourceMode, so a cloud fork inherits a cloud project id and a local
          // fork a local one — the namespace can never cross. For cloud, re-validate
          // against a live cloud project so a tombstoned id isn't propagated.
          sourceMode === 'local'
            ? sourceConversation?.projectId
            : resolveCloudProjectId(sourceConversation?.projectId),
          forkModel,
          sourceMode,
        );
        // Persist the parent/branch relation so a fork is a real branch, not an
        // untracked copy (CAP-035). The fork point defaults to the last message of
        // the source thread — a whole-thread copy diverges after it.
        const forkPointMessageId =
          options?.forkPointMessageId ?? sourceMessages[sourceMessages.length - 1]?.id;
        const now = Date.now();
        const forkedMessages = sourceMessages.map((message, index) => {
          const {
            isStreaming: _isStreaming,
            isQueued: _isQueued,
            offlineQueueId: _offlineQueueId,
            ...safeMessage
          } = message;

          return {
            ...safeMessage,
            id: sourceMode === 'cloud' ? uuidv7() : `${message.id}_fork_${now}_${index}`,
            conversationId: forkId,
            model: forkModel ?? message.model,
          };
        });

        const forkStore = getConversationMessageStore(forkId);
        forkStore.setState((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === forkId
              ? {
                  ...conversation,
                  messageCount: forkedMessages.length,
                  model: forkModel ?? conversation.model,
                  provider: providerForExecutionMode(sourceMode),
                  executionMode: sourceMode,
                  updatedAt: new Date(now).toISOString(),
                  // Real branch relation back to the source conversation.
                  parentConversationId: sourceConversationId,
                  forkPointMessageId,
                }
              : conversation,
          ),
          messages: { ...state.messages, [forkId]: forkedMessages },
          currentConversationId: forkId,
        }));

        if (sourceMode === 'cloud') {
          markConversationForSync(forkId);
          for (const message of forkedMessages) {
            markMessageForSync(forkId, message.id);
          }
          void syncNow();
        }

        return forkId;
      },

      deleteConversation: async (id) => {
        // SEPARATION-FIX: check local store first; if not found, delegate to cloud store.
        const localConversation = get().conversations.find((c) => c.id === id);
        if (!localConversation) {
          const cloudStore = getCloudStore();
          const cloudConversation = cloudStore.getState().conversations.find((c) => c.id === id);
          if (cloudConversation && shouldSyncConversationRemote(cloudConversation)) {
            // PRIVACY/DATA-LOSS FIX: confirm the server delete BEFORE hiding the
            // conversation locally. The previous optimistic remove + swallowed
            // catch hid a conversation that still existed server-side (so the
            // user believed sensitive content was gone while it persisted) and
            // let it resurrect on the next pull. Retry transient failures; only
            // remove locally once the server has acknowledged the delete. On a
            // hard failure, surface it and leave the conversation visible so the
            // user knows it was NOT deleted.
            const deleted = await deleteCloudConversationWithRetry(id);
            if (!deleted) {
              Alert.alert(
                'Could not delete conversation',
                'We could not delete this conversation from the cloud. Check your connection and try again.',
              );
              return;
            }
            cloudStore.getState().removeCloudConversation(id);
          } else {
            cloudStore.getState().removeCloudConversation(id);
          }
          set((state) => ({
            currentConversationId:
              state.currentConversationId === id ? null : state.currentConversationId,
          }));
          return;
        }
        set((state) => {
          const { [id]: _, ...remainingMessages } = state.messages;
          return {
            conversations: state.conversations.filter((c) => c.id !== id),
            messages: remainingMessages,
            currentConversationId:
              state.currentConversationId === id ? null : state.currentConversationId,
          };
        });
      },

      loadMessages: async (conversationId) => {
        // SEPARATION-FIX: check which store owns this conversation.
        const localConversation = get().conversations.find((c) => c.id === conversationId);
        const cloudStore = getCloudStore();
        const cloudConversation = !localConversation
          ? cloudStore.getState().conversations.find((c) => c.id === conversationId)
          : undefined;
        const conversation = localConversation ?? cloudConversation;

        const existingLocalMsgs = get().messages[conversationId];
        const existingCloudMsgs = cloudStore.getState().messages[conversationId];
        const existing = localConversation ? existingLocalMsgs : existingCloudMsgs;
        if (existing && existing.length > 0 && !existing.some((m) => m.isStreaming)) {
          // Derive from the cache too, not only from a network response.
          //
          // This early return is the common path — a transcript is cached after
          // the first open — so capturing only after the fetch meant a chat the
          // user had already visited never gained its artifacts. Derivation is
          // idempotent, so running it on cached messages costs a no-op when
          // they were already captured.
          captureArtifactsForLoadedMessages(
            existing,
            conversationId,
            conversation?.title ?? '',
            cloudConversation ? 'cloud' : 'local',
          );
          return;
        }
        // A new-chat navigation and its first send run concurrently: the screen
        // mounts and starts this read while sendMessage is still committing the
        // optimistic user/assistant rows. Keep the exact request-start objects
        // so the response can be reconciled against mutations that happened
        // while the network request was in flight instead of blindly replacing
        // the transcript with an older (often empty) server snapshot.
        const cloudMessagesAtRequestStart = cloudConversation ? (existingCloudMsgs ?? []) : [];

        set({ isLoadingMessages: true });
        try {
          if (!shouldLoadRemoteMessages(conversation)) return;
          const data = ManagedCloudConversationResponseSchema.parse(
            await api.get<unknown>(managedCloudConversationPath(conversationId)),
          );
          const normalizedMessages = data.messages.map((message) =>
            normalizeManagedCloudMessage(message, conversationId),
          ) as ChatMessage[];
          // Route messages to the correct store.
          if (cloudConversation) {
            const cloudState = cloudStore.getState();
            // Account teardown clears the owning conversation synchronously.
            // Never let an old account's late response recreate its transcript.
            if (!cloudState.conversations.some((candidate) => candidate.id === conversationId)) {
              return;
            }
            const currentMessages = cloudState.messages[conversationId] ?? [];
            const dirtyMessageIds = new Set(
              useCloudSyncStateStore
                .getState()
                .dirtyMessages.filter((dirty) => dirty.conversationId === conversationId)
                .map((dirty) => dirty.messageId),
            );
            cloudState.setCloudMessages(
              conversationId,
              reconcileLoadedCloudMessages({
                serverMessages: normalizedMessages,
                requestStartMessages: cloudMessagesAtRequestStart,
                currentMessages,
                dirtyMessageIds,
              }),
            );
          } else {
            set((state) => ({
              messages: { ...state.messages, [conversationId]: normalizedMessages },
            }));
          }

          // Artifacts for history, not just for the turn that produced them.
          //
          // Capture ran only as a response finished streaming, so reopening a
          // conversation from the server showed its code and documents as plain
          // markdown — the artifact card, the gallery entry and the full-screen
          // viewer were all missing for anything not generated in this session.
          // Derivation is pure and its ids are deterministic, so re-deriving a
          // message the app already captured is a no-op.
          captureArtifactsForLoadedMessages(
            normalizedMessages,
            conversationId,
            conversation?.title ?? '',
            cloudConversation ? 'cloud' : 'local',
          );
        } catch {
          if (!cloudConversation) {
            set((state) => ({
              messages: {
                ...state.messages,
                [conversationId]: state.messages[conversationId] ?? [],
              },
            }));
          }
        } finally {
          set({ isLoadingMessages: false });
        }
      },

      renameConversation: async (id, title) => {
        // SEPARATION-FIX: route to the store that owns this conversation.
        const localConversation = get().conversations.find((c) => c.id === id);
        if (!localConversation) {
          const cloudStore = getCloudStore();
          cloudStore.getState().patchCloudConversation(id, { title });
          if (
            shouldSyncConversationRemote(
              cloudStore.getState().conversations.find((c) => c.id === id),
            )
          ) {
            // DATA-LOSS FIX: enqueue the rename so the sync engine push() re-sends
            // the cached (renamed) title even if the immediate PUT fails. Without
            // this, a failed PUT left the new title only in this device's cache,
            // where the next pull/list-replace reverted it. The clobber-guard in
            // setCloudConversations / applyConversationDeltas preserves this
            // locally-dirty title until the push lands.
            markConversationForSync(id);
            try {
              await api.put(
                managedCloudConversationPath(id),
                ManagedCloudUpdateConversationRequestSchema.parse({ title }),
              );
            } catch {
              // Optimistic rename stands; the dirty-queue retry (push) persists it.
            }
          }
          return;
        }
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
        }));
      },

      pinConversation: async (id) => {
        // SEPARATION-FIX: route to the store that owns this conversation.
        const localConv = get().conversations.find((c) => c.id === id);
        if (!localConv) {
          const cloudStore = getCloudStore();
          const cloudConv = cloudStore.getState().conversations.find((c) => c.id === id);
          if (!cloudConv) return;
          const pinned = !cloudConv.pinned;
          cloudStore.getState().patchCloudConversation(id, { pinned });
          if (shouldSyncConversationRemote(cloudConv)) {
            try {
              await api.put(
                managedCloudConversationPath(id),
                ManagedCloudUpdateConversationRequestSchema.parse({ pinned }),
              );
            } catch {
              cloudStore.getState().patchCloudConversation(id, { pinned: !pinned });
            }
          }
          return;
        }
        const pinned = !localConv.pinned;
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, pinned } : c)),
        }));
      },

      makeConversationPermanent: (id) => {
        // Route to the correct store.
        if (get().conversations.find((c) => c.id === id)) {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === id ? { ...c, temporary: false } : c,
            ),
          }));
        } else {
          getCloudStore().getState().patchCloudConversation(id, { temporary: false });
        }
      },

      markConversationRead: (id) => {
        // Route to the correct store.
        if (get().conversations.find((c) => c.id === id)) {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === id ? { ...c, unread: false } : c,
            ),
          }));
        } else {
          getCloudStore().getState().patchCloudConversation(id, { unread: false });
        }
      },

      deleteMessage: (conversationId, messageId) => {
        const ownerStore = getConversationMessageStore(conversationId);
        ownerStore.setState((state) => {
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

      setMessageReaction: (conversationId, messageId, reaction) => {
        const ownerStore = getConversationMessageStore(conversationId);
        // Optimistically persist the rating into message metadata so it survives
        // FlashList row recycling and reload (the previous per-row state was
        // dropped on scroll — a dead control). metadata.reaction mirrors the web
        // shape (PATCH /messages/[messageId]).
        ownerStore.setState((state) => {
          const msgs = state.messages[conversationId];
          if (!msgs) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: msgs.map((m) =>
                m.id === messageId ? { ...m, metadata: { ...m.metadata, reaction } } : m,
              ),
            },
          };
        });
        // Cloud conversations: persist server-side so the rating is durable and
        // visible cross-surface (web reads the same metadata.reaction). Best-
        // effort — the tap must not block on the network, and local state is the
        // source of truth for display.
        const conversation = ownerStore
          .getState()
          .conversations.find((c) => c.id === conversationId);
        if (conversation && executionModeForConversation(conversation) === 'cloud') {
          void setCloudMessageReactionRemote(conversationId, messageId, reaction).catch(() => {
            // Swallow: the reaction is already reflected locally; a failed remote
            // write just means it will re-sync on the next rating change.
          });
        }
      },

      enqueueOfflineMessage: (conversationId, content, model, queueId) => {
        const userMessage: ChatMessage = {
          id: generateMessageId(),
          conversationId,
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
          model,
          isQueued: true,
          offlineQueueId: queueId,
        };
        const ownerStore = getConversationMessageStore(conversationId);
        ownerStore.setState((state) => {
          const existing = state.messages[conversationId] ?? [];
          return {
            messages: { ...state.messages, [conversationId]: [...existing, userMessage] },
          };
        });
      },

      beginImageGeneration: (conversationId, commandContent, prompt, model) => {
        const ownerStore = getConversationMessageStore(conversationId);
        const isCloudConversation = ownerStore
          .getState()
          .conversations.some(
            (conversation) =>
              conversation.id === conversationId &&
              executionModeForConversation(conversation) === 'cloud',
          );
        const newMessageId = () => (isCloudConversation ? uuidv7() : generateMessageId());
        const now = new Date().toISOString();
        const assistantMessageId = newMessageId();
        const userMessage: ChatMessage = {
          id: newMessageId(),
          conversationId,
          role: 'user',
          content: commandContent,
          createdAt: now,
          model,
        };
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          conversationId,
          role: 'assistant',
          content: '',
          createdAt: now,
          model,
          isGeneratingImage: true,
          imageGenStatus: 'generating',
          imageGenPrompt: prompt,
        };

        ownerStore.setState((state) => {
          const existingMessages = state.messages[conversationId] ?? [];
          return {
            messages: {
              ...state.messages,
              [conversationId]: [...existingMessages, userMessage, assistantMessage],
            },
            conversations: state.conversations.map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    lastMessage: commandContent,
                    messageCount: (conversation.messageCount ?? 0) + 2,
                    updatedAt: now,
                    model: conversation.model ?? model,
                    provider: conversation.provider ?? providerForExecutionMode('cloud'),
                    executionMode: conversation.executionMode ?? 'cloud',
                  }
                : conversation,
            ),
          };
        });

        if (isCloudConversation) {
          markConversationForSync(conversationId);
          markMessageForSync(conversationId, userMessage.id);
        }

        return assistantMessageId;
      },

      completeImageGeneration: (conversationId, assistantMessageId, result) => {
        const now = new Date().toISOString();
        const finalContent = result.revisedPrompt
          ? `Generated image: ${result.revisedPrompt}`
          : 'Generated image';

        const ownerStore = getConversationMessageStore(conversationId);
        const isCloudConversation = ownerStore
          .getState()
          .conversations.some(
            (conversation) =>
              conversation.id === conversationId &&
              executionModeForConversation(conversation) === 'cloud',
          );
        ownerStore.setState((state) => {
          const messages = state.messages[conversationId];
          if (!messages) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: messages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      type: 'image',
                      imageUrl: result.imageUrl,
                      imageGenPersisted: result.persisted !== false,
                      revisedPrompt: result.revisedPrompt,
                      content: finalContent,
                      isGeneratingImage: false,
                      imageGenStatus: 'completed',
                      imageGenProgress: 100,
                      imageGenError: result.persistenceWarning,
                      model: result.model ?? message.model,
                    }
                  : message,
              ),
            },
            conversations: state.conversations.map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    lastMessage: finalContent,
                    updatedAt: now,
                    provider: conversation.provider ?? providerForExecutionMode('cloud'),
                    executionMode: conversation.executionMode ?? 'cloud',
                  }
                : conversation,
            ),
          };
        });
        const durableImagePath =
          result.persisted === false
            ? null
            : getDurableGeneratedImagePath({ url: result.imageUrl });
        const cloudOwnerId = isCloudConversation
          ? useAuthStore.getState().clerkUserId?.trim()
          : null;
        if (durableImagePath && cloudOwnerId) {
          const conversationTitle =
            ownerStore
              .getState()
              .conversations.find((conversation) => conversation.id === conversationId)?.title ??
            'AGI Cloud';
          useArtifactStore.getState().addArtifacts([
            generatedImageToMobileArtifact({
              messageId: assistantMessageId,
              imagePath: durableImagePath,
              prompt: result.revisedPrompt,
              createdAt: now,
              conversationTitle,
              provenance: { scope: 'cloud', ownerId: cloudOwnerId },
              accentColor: agiNativeColors.dark.terraCotta,
            }),
          ]);
        }
        if (isCloudConversation) {
          markConversationForSync(conversationId);
          markMessageForSync(conversationId, assistantMessageId);
          void syncNow();
        }
      },

      failImageGeneration: (conversationId, assistantMessageId, errorMessage) => {
        const now = new Date().toISOString();
        const finalContent = `Image generation failed: ${errorMessage}`;

        const ownerStore = getConversationMessageStore(conversationId);
        const isCloudConversation = ownerStore
          .getState()
          .conversations.some(
            (conversation) =>
              conversation.id === conversationId &&
              executionModeForConversation(conversation) === 'cloud',
          );
        ownerStore.setState((state) => {
          const messages = state.messages[conversationId];
          if (!messages) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: messages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: finalContent,
                      isGeneratingImage: false,
                      imageGenStatus: 'failed',
                      imageGenProgress: 100,
                      imageGenError: errorMessage,
                    }
                  : message,
              ),
            },
            conversations: state.conversations.map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    lastMessage: finalContent,
                    updatedAt: now,
                  }
                : conversation,
            ),
          };
        });
        if (isCloudConversation) {
          markConversationForSync(conversationId);
          markMessageForSync(conversationId, assistantMessageId);
          void syncNow();
        }
      },

      resolveOfflineMessage: (conversationId, queueId) => {
        const ownerStore = getConversationMessageStore(conversationId);
        ownerStore.setState((state) => {
          const msgs = state.messages[conversationId];
          if (!msgs) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: msgs.filter((m) => m.offlineQueueId !== queueId),
            },
          };
        });
      },

      clearQueuedPlaceholders: (conversationId) => {
        const ownerStore = getConversationMessageStore(conversationId);
        ownerStore.setState((state) => {
          const msgs = state.messages[conversationId];
          if (!msgs) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: msgs.filter((m) => !m.isStreaming && !m.isQueued),
            },
          };
        });
      },
    }),
    {
      // SEPARATION-FIX: Local conversations persist under a dedicated Local key.
      // Cloud conversations are persisted separately in `useChatCloudMessageStore`
      // under 'chat-message-store-cloud'. The two namespaces never share keys in
      // MMKV, ensuring physical separation between Local and Cloud data at rest.
      name: 'chat-message-store-local',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[chatMessageStore] Hydration failed:', error);
      },
      partialize: (state) => {
        const MAX_CONVERSATIONS = 200;
        const MAX_MESSAGES_PER_CONVERSATION = 100;
        // SEPARATION-FIX: only persist LOCAL conversations in this store.
        // Cloud conversations must never co-mingle with local storage.
        // Temporary/incognito conversations are excluded entirely — they must
        // not survive relaunch (never persist to the recents/history store).
        const conversations = state.conversations
          .filter((c) => executionModeForConversation(c) === 'local' && !c.temporary)
          .slice(0, MAX_CONVERSATIONS);
        const conversationIds = new Set(conversations.map((c) => c.id));
        const messages: Record<string, ChatMessage[]> = {};
        for (const [id, msgs] of Object.entries(state.messages)) {
          if (conversationIds.has(id)) {
            messages[id] = msgs.filter((m) => !m.isStreaming).slice(-MAX_MESSAGES_PER_CONVERSATION);
          }
        }
        return { conversations, messages, currentConversationId: state.currentConversationId };
      },
    },
  ),
);

function isCloudChatEnabled(): boolean {
  return FEATURES.cloudChat && !FEATURES.v1LocalOnly;
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Extract the HTTP status from an api-client error (it throws `HTTP <status>: …`). */
function httpStatusFromError(error: unknown): number | null {
  const match = error instanceof Error ? error.message.match(/HTTP (\d{3})/) : null;
  return match ? Number(match[1]) : null;
}

/**
 * Delete a cloud conversation server-side, retrying transient failures.
 * Returns true only when the server has acknowledged the delete (a 404 counts
 * as success — the row is already gone, so the delete is idempotently
 * satisfied). Returns false on a non-transient 4xx or after exhausting retries,
 * so the caller can keep the conversation visible and surface the failure
 * instead of silently hiding content that still lives in the cloud.
 */
async function deleteCloudConversationWithRetry(id: string, maxAttempts = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await api.delete(managedCloudConversationPath(id));
      return true;
    } catch (error) {
      const status = httpStatusFromError(error);
      // 404 = already deleted server-side → idempotently satisfied.
      if (status === 404) return true;
      // Other 4xx (e.g. 403) are not transient — stop and report failure.
      if (status !== null && status >= 400 && status < 500) return false;
      // 5xx / network error — retry with backoff.
      if (attempt >= maxAttempts) return false;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return false;
}

/**
 * Derive artifacts for a transcript that came from the server.
 *
 * Only assistant turns carry artifacts, and cloud artifacts must be stamped
 * with the owning account: `MobileArtifactProvenance` requires an ownerId for
 * scope 'cloud', and the store rejects a record without one. If there is no
 * signed-in owner, cloud artifacts are skipped rather than mis-attributed.
 */
function captureArtifactsForLoadedMessages(
  messages: ChatMessage[],
  conversationId: string,
  conversationTitle: string,
  scope: 'local' | 'cloud',
): void {
  // The SAME owner source the artifact store gates on. addArtifacts drops any
  // cloud row whose ownerId !== captureCloudAccountEpoch()'s, silently, so a
  // different-but-plausible source (useAuthStore.clerkUserId) produced rows
  // that were derived correctly and then discarded on write.
  const ownerId = captureCloudAccountEpoch()?.ownerId ?? null;
  if (scope === 'cloud' && !ownerId) return;
  const provenance: MobileArtifactProvenance =
    scope === 'cloud' ? { scope: 'cloud', ownerId: ownerId as string } : { scope: 'local' };

  // Derive here rather than calling chatExecutionStore's copy: that store
  // already lazy-requires THIS one to break a cycle, and importing back the
  // other way would close it at module-init time. Derivation only needs the
  // artifacts feature, which this module already depends on.
  try {
    const artifacts = messages
      .filter((message) => message.role === 'assistant' && message.content.trim().length > 0)
      .flatMap((message) =>
        deriveAndMapToMobileArtifacts(
          message.content,
          conversationId,
          message.id,
          message.createdAt,
          conversationTitle,
          agiNativeColors.dark,
          provenance,
        ),
      );
    if (artifacts.length > 0) useArtifactStore.getState().addArtifacts(artifacts);
  } catch {
    // Non-fatal — artifact capture must never block opening a conversation.
  }
}

function shouldLoadCloudConversationList(): boolean {
  // Gate on isClerkSignedIn to prevent unauthenticated api.get('/api/chat/conversations')
  // calls that trigger the "Session Expired" alert in handleUnrecoverableAuth when
  // appMode is 'cloud' but no real Clerk session exists (e.g. demo build with
  // cloudUnlocked=true persisted from a prior session).
  return (
    isCloudChatEnabled() &&
    useChatAppModeStore.getState().appMode === 'cloud' &&
    useAuthStore.getState().isClerkSignedIn
  );
}

/**
 * Resolve the cloud project a new/forked cloud chat should be stamped with.
 *
 * TRUST BOUNDARY: reads ONLY the cloud project store, never the local one, and
 * validates the candidate (explicit id, else the cloud active project) against a
 * LIVE (non-tombstoned) cloud project. A local project id, an unknown id, or a
 * tombstoned id all resolve to `undefined` — so a cloud chat can never be stamped
 * with a cross-namespace or dangling project_id.
 */
function resolveCloudProjectId(explicit?: string): string | undefined {
  const { activeProjectId, projects } = useCloudProjectStore.getState();
  const candidate = explicit ?? activeProjectId ?? undefined;
  if (!candidate) return undefined;
  return projects.some((p) => p.id === candidate && p.deletedAt === null) ? candidate : undefined;
}

function isCloudConversation(conversation: ConversationSummary | undefined): boolean {
  return Boolean(conversation && executionModeForConversation(conversation) === 'cloud');
}

function shouldSyncConversationRemote(conversation: ConversationSummary | undefined): boolean {
  return isCloudChatEnabled() && isCloudConversation(conversation);
}

function shouldLoadRemoteMessages(conversation: ConversationSummary | undefined): boolean {
  if (!isCloudChatEnabled()) return false;
  if (conversation) return isCloudConversation(conversation);
  return useChatAppModeStore.getState().appMode === 'cloud';
}

interface ReconcileLoadedCloudMessagesInput {
  serverMessages: ChatMessage[];
  requestStartMessages: ChatMessage[];
  currentMessages: ChatMessage[];
  dirtyMessageIds: Set<string>;
}

/**
 * Three-way reconciliation for a conversation read that races local activity.
 *
 * The server is authoritative for rows untouched during the request. Local
 * additions, edits, deletions, dirty writes, and streaming placeholders win
 * until their own sync completes. This prevents the common first-send race:
 * GET starts against an empty conversation, the turn streams locally, then
 * the stale empty GET response arrives and erases the visible transcript.
 */
function reconcileLoadedCloudMessages({
  serverMessages,
  requestStartMessages,
  currentMessages,
  dirtyMessageIds,
}: ReconcileLoadedCloudMessagesInput): ChatMessage[] {
  const requestStartById = new Map(requestStartMessages.map((message) => [message.id, message]));
  const currentById = new Map(currentMessages.map((message) => [message.id, message]));
  const reconciled = new Map(serverMessages.map((message) => [message.id, message]));

  // A row present when the request began but missing now was deleted locally
  // while the request was in flight. Do not resurrect it from a stale response.
  for (const message of requestStartMessages) {
    if (!currentById.has(message.id)) reconciled.delete(message.id);
  }

  for (const message of currentMessages) {
    const requestStartMessage = requestStartById.get(message.id);
    const changedDuringRequest =
      requestStartMessage === undefined || requestStartMessage !== message;
    if (changedDuringRequest || message.isStreaming || dirtyMessageIds.has(message.id)) {
      reconciled.set(message.id, message);
    }
  }

  return Array.from(reconciled.values()).sort((a, b) => {
    const createdAtOrder = a.createdAt.localeCompare(b.createdAt);
    return createdAtOrder === 0 ? a.id.localeCompare(b.id) : createdAtOrder;
  });
}

// mergeCloudConversations removed: cloud conversations no longer write into
// the local store. They are stored exclusively in useChatCloudMessageStore
// under 'chat-message-store-cloud'. See SEPARATION-FIX comments above.

async function createConversationForMode(
  set: (
    partial: Partial<MessageState> | ((state: MessageState) => Partial<MessageState>),
    replace?: false,
  ) => void,
  title: string | undefined,
  projectId: string | undefined,
  model: string | undefined,
  executionMode: ConversationExecutionMode,
): Promise<string> {
  if (executionMode === 'local') {
    return createStoredConversation(set, title, projectId, model, executionMode);
  }

  if (!isCloudChatEnabled()) {
    throw new Error('AGI Cloud chat is not enabled in this mobile build.');
  }

  try {
    // Offline-first: generate the cloud identity (UUIDv7) client-side so the
    // conversation has a stable id the sync engine can push, independent of the
    // server round-trip. The create endpoint accepts and echoes this id.
    const id = uuidv7();
    const isTemporary = useSettingsStore.getState().isTemporaryChat;
    const data = ManagedCloudCreateConversationResponseSchema.parse(
      await api.post<unknown>('/api/chat/conversations', {
        id,
        title: title ?? 'New Chat',
        projectId,
        // Server stores this as web_conversations.is_temporary so the
        // purge-temporary-chats cron job can bound retention (~30 days) —
        // see apps/web/db/neon/0050_temporary_chat_retention.sql.
        isTemporary,
      }),
    );
    const normalizedCloudConversation = normalizeManagedCloudConversation(data.conversation);
    const conversation: ConversationSummary = {
      ...normalizeManagedCloudConversationForMobile(normalizedCloudConversation),
      projectId,
      model: normalizedCloudConversation.model ?? model,
      provider: providerForExecutionMode('cloud'),
      executionMode: 'cloud',
      // Local history-visibility flag (see isHistoryVisibleConversation) — set
      // from the same toggle value sent to the server above.
      temporary: isTemporary,
    };
    // SEPARATION-FIX: cloud conversation goes to the cloud store, NOT the local store.
    // The local store `set` function is intentionally not called here.
    getCloudStore().getState().addCloudConversation(conversation);
    // Queue the conversation for the next sync push (metadata LWW-reconciles cross-device).
    markConversationForSync(conversation.id);
    // currentConversationId is shared UI state, not conversation data — safe to set here.
    set(() => ({ currentConversationId: conversation.id }));
    return conversation.id;
  } catch {
    throw new Error('AGI Cloud conversation could not be created.');
  }
}

function normalizeManagedCloudConversationForMobile(
  conversation: ManagedCloudConversation,
): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    createdAt: conversation.createdAt,
    messageCount: 0,
    pinned: conversation.pinned,
    ...(conversation.model ? { model: conversation.model } : {}),
    ...(conversation.projectId ? { projectId: conversation.projectId } : {}),
    provider: providerForExecutionMode('cloud'),
    executionMode: 'cloud',
    temporary: conversation.isTemporary,
  };
}

function createStoredConversation(
  set: (
    partial: Partial<MessageState> | ((state: MessageState) => Partial<MessageState>),
    replace?: false,
  ) => void,
  title: string | undefined,
  projectId: string | undefined,
  model: string | undefined,
  executionMode: ConversationExecutionMode,
): string {
  const localId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  const localConversation: ConversationSummary = {
    id: localId,
    title: title ?? 'New Chat',
    updatedAt: now,
    createdAt: now,
    messageCount: 0,
    pinned: false,
    projectId,
    model,
    provider: providerForExecutionMode(executionMode),
    executionMode,
    temporary: useSettingsStore.getState().isTemporaryChat,
  };
  set((state) => ({
    conversations: [localConversation, ...state.conversations],
    currentConversationId: localId,
    messages: { ...state.messages, [localId]: [] },
  }));
  return localId;
}

rehydrateWhenMmkvReady(useChatMessageStore, 'chat-message-store-local');
