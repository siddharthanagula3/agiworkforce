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
import { isSelectableModelIdForAccess } from '@/src/features/model-picker/service';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
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
  type ManagedCloudConversationHistoryStats,
  type ManagedCloudMessageWire,
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
  forkPointMessageId?: string;
}

interface MessageState {
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  messages: Record<string, ChatMessage[]>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;

  setCurrentConversationId: (id: string | null) => void;
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
  setConversationModel: (id: string, model: string) => Promise<boolean>;
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
  beginVideoGeneration: (
    conversationId: string,
    commandContent: string,
    prompt: string,
    model: string,
  ) => string;
  updateVideoGenerationProgress: (
    conversationId: string,
    assistantMessageId: string,
    progress: number | undefined,
    status: NonNullable<ChatMessage['videoGenStatus']>,
  ) => void;
  completeVideoGeneration: (
    conversationId: string,
    assistantMessageId: string,
    result: {
      videoUrl: string;
      thumbnailUrl?: string;
      model?: string;
    },
  ) => void;
  failVideoGeneration: (
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
          if (shouldLoadCloudConversationList()) {
            const conversations: ManagedCloudConversation[] = [];
            let offset = 0;
            let hasMore = true;
            let historyStats: ManagedCloudConversationHistoryStats | undefined;
            while (hasMore) {
              const data = ManagedCloudConversationListResponseSchema.parse(
                await api.get<unknown>(
                  `/api/chat/conversations?limit=100&offset=${offset}&includeHistoryStats=${offset === 0 ? '1' : '0'}&archived=exclude`,
                ),
              );
              conversations.push(...data.conversations.map(normalizeManagedCloudConversation));
              if (offset === 0) historyStats = data.historyStats;
              hasMore = data.hasMore;
              if (hasMore && data.nextOffset <= offset) {
                throw new Error('Cloud conversation pagination did not advance.');
              }
              offset = data.nextOffset;
            }
            getCloudStore()
              .getState()
              .setCloudConversations(
                conversations.map(normalizeManagedCloudConversationForMobile),
                historyStats,
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
          sourceMode === 'local'
            ? sourceConversation?.projectId
            : resolveCloudProjectId(sourceConversation?.projectId),
          forkModel,
          sourceMode,
        );
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
        const localConversation = get().conversations.find((c) => c.id === id);
        if (!localConversation) {
          const cloudStore = getCloudStore();
          const cloudConversation = cloudStore.getState().conversations.find((c) => c.id === id);
          if (cloudConversation && shouldSyncConversationRemote(cloudConversation)) {
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
        const localConversation = get().conversations.find((c) => c.id === conversationId);
        const cloudStore = getCloudStore();
        const cloudConversation = !localConversation
          ? cloudStore.getState().conversations.find((c) => c.id === conversationId)
          : undefined;
        const conversation = localConversation ?? cloudConversation;

        const existingLocalMsgs = get().messages[conversationId];
        const existingCloudMsgs = cloudStore.getState().messages[conversationId];
        const existing = localConversation ? existingLocalMsgs : existingCloudMsgs;
        if (
          localConversation &&
          existing &&
          existing.length > 0 &&
          !existing.some((m) => m.isStreaming)
        ) {
          captureArtifactsForLoadedMessages(
            existing,
            conversationId,
            conversation?.title ?? '',
            cloudConversation ? 'cloud' : 'local',
          );
          return;
        }
        const cloudMessagesAtRequestStart = cloudConversation ? (existingCloudMsgs ?? []) : [];

        set({ isLoadingMessages: true });
        try {
          if (!shouldLoadRemoteMessages(conversation)) return;
          const messageRows: ManagedCloudMessageWire[] = [];
          let messageOffset = 0;
          let hasMoreMessages = true;
          while (hasMoreMessages) {
            const data = ManagedCloudConversationResponseSchema.parse(
              await api.get<unknown>(
                `${managedCloudConversationPath(conversationId)}?limit=500&offset=${messageOffset}`,
              ),
            );
            messageRows.push(...data.messages);
            hasMoreMessages = data.hasMore;
            const nextOffset = messageOffset + data.messages.length;
            if (hasMoreMessages && nextOffset <= messageOffset) {
              throw new Error('Cloud message pagination did not advance.');
            }
            messageOffset = nextOffset;
          }
          const normalizedMessages = messageRows.map((message) =>
            normalizeManagedCloudMessage(message, conversationId),
          ) as ChatMessage[];
          if (cloudConversation) {
            const cloudState = cloudStore.getState();
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
        const localConversation = get().conversations.find((c) => c.id === id);
        if (!localConversation) {
          const cloudStore = getCloudStore();
          cloudStore.getState().patchCloudConversation(id, { title });
          if (
            shouldSyncConversationRemote(
              cloudStore.getState().conversations.find((c) => c.id === id),
            )
          ) {
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

      setConversationModel: async (id, model) => {
        const localConversation = get().conversations.find(
          (conversation) => conversation.id === id,
        );
        if (localConversation) {
          if (!isConversationModelSelectionAllowed(localConversation, model)) return false;
          set((state) => ({
            conversations: state.conversations.map((conversation) =>
              conversation.id === id ? { ...conversation, model } : conversation,
            ),
          }));
          return true;
        }

        const cloudStore = getCloudStore();
        const cloudConversation = cloudStore
          .getState()
          .conversations.find((conversation) => conversation.id === id);
        if (!cloudConversation) return false;
        if (!isConversationModelSelectionAllowed(cloudConversation, model)) return false;

        cloudStore.getState().patchCloudConversation(id, { model });
        if (shouldSyncConversationRemote(cloudConversation)) {
          markConversationForSync(id);
          try {
            await api.put(
              managedCloudConversationPath(id),
              ManagedCloudUpdateConversationRequestSchema.parse({ model }),
            );
          } catch {
            // The optimistic row is durable in the Cloud cache and remains in
            // the sync sidecar until a later push confirms it server-side.
          }
        }
        return true;
      },

      pinConversation: async (id) => {
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
        const userCreatedAt = new Date();
        const now = userCreatedAt.toISOString();
        const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1).toISOString();
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
          createdAt: assistantCreatedAt,
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
          markMessageForSync(conversationId, assistantMessage.id);
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
        const finalContent = `Image generation failed: ${presentableMediaError(errorMessage)}`;

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

      beginVideoGeneration: (conversationId, commandContent, prompt, model) => {
        const ownerStore = getConversationMessageStore(conversationId);
        const isCloudConversation = ownerStore
          .getState()
          .conversations.some(
            (conversation) =>
              conversation.id === conversationId &&
              executionModeForConversation(conversation) === 'cloud',
          );
        const newMessageId = () => (isCloudConversation ? uuidv7() : generateMessageId());
        const userCreatedAt = new Date();
        const now = userCreatedAt.toISOString();
        const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1).toISOString();
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
          createdAt: assistantCreatedAt,
          model,
          isGeneratingVideo: true,
          videoGenStatus: 'queued',
          videoGenPrompt: prompt,
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
          markMessageForSync(conversationId, assistantMessage.id);
        }

        return assistantMessageId;
      },

      updateVideoGenerationProgress: (conversationId, assistantMessageId, progress, status) => {
        const ownerStore = getConversationMessageStore(conversationId);
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
                      videoGenStatus: status,
                      ...(progress !== undefined ? { videoGenProgress: progress } : {}),
                    }
                  : message,
              ),
            },
          };
        });
      },

      completeVideoGeneration: (conversationId, assistantMessageId, result) => {
        const now = new Date().toISOString();
        const finalContent = 'Generated video';

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
                      type: 'video',
                      videoUrl: result.videoUrl,
                      ...(result.thumbnailUrl ? { videoThumbnailUrl: result.thumbnailUrl } : {}),
                      content: finalContent,
                      isGeneratingVideo: false,
                      videoGenStatus: 'completed',
                      videoGenProgress: 100,
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
        if (isCloudConversation) {
          markConversationForSync(conversationId);
          markMessageForSync(conversationId, assistantMessageId);
          void syncNow();
        }
      },

      failVideoGeneration: (conversationId, assistantMessageId, errorMessage) => {
        const now = new Date().toISOString();
        const finalContent = `Video generation failed: ${presentableMediaError(errorMessage)}`;

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
                      isGeneratingVideo: false,
                      videoGenStatus: 'failed',
                      videoGenProgress: 100,
                      videoGenError: errorMessage,
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
      name: 'chat-message-store-local',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[chatMessageStore] Hydration failed:', error);
      },
      partialize: (state) => {
        const MAX_CONVERSATIONS = 200;
        const MAX_MESSAGES_PER_CONVERSATION = 100;
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

function presentableMediaError(errorMessage: string): string {
  if (/cancell?ed/i.test(errorMessage)) return 'the request was cancelled.';
  if (/timed?\s*out|timeout/i.test(errorMessage)) return 'the request timed out. Try again.';
  if (/network|offline|internet|ENOTFOUND|ECONNREFUSED/i.test(errorMessage)) {
    return 'no network connection. Reconnect and try again.';
  }
  return errorMessage.replace(/\s*\(at\s+[^)]*\)\s*$/, '').trim() || 'please try again.';
}

function httpStatusFromError(error: unknown): number | null {
  const match = error instanceof Error ? error.message.match(/HTTP (\d{3})/) : null;
  return match ? Number(match[1]) : null;
}

async function deleteCloudConversationWithRetry(id: string, maxAttempts = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await api.delete(managedCloudConversationPath(id));
      return true;
    } catch (error) {
      const status = httpStatusFromError(error);
      if (status === 404) return true;
      if (status !== null && status >= 400 && status < 500) return false;
      if (attempt >= maxAttempts) return false;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return false;
}

function captureArtifactsForLoadedMessages(
  messages: ChatMessage[],
  conversationId: string,
  conversationTitle: string,
  scope: 'local' | 'cloud',
): void {
  const ownerId = captureCloudAccountEpoch()?.ownerId ?? null;
  if (scope === 'cloud' && !ownerId) return;
  const provenance: MobileArtifactProvenance =
    scope === 'cloud' ? { scope: 'cloud', ownerId: ownerId as string } : { scope: 'local' };

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
  return (
    isCloudChatEnabled() &&
    useChatAppModeStore.getState().appMode === 'cloud' &&
    useAuthStore.getState().isClerkSignedIn
  );
}

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

function isConversationModelSelectionAllowed(
  conversation: ConversationSummary,
  model: string,
): boolean {
  const executionMode = executionModeForConversation(conversation);
  if (
    !isSelectableModelIdForAccess(
      model,
      useWaitlistStore.getState().cloudUnlocked,
      useTierStore.getState().tier,
    )
  ) {
    return false;
  }
  return executionModeForSelection(model, executionMode) === executionMode;
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

function reconcileLoadedCloudMessages({
  serverMessages,
  requestStartMessages,
  currentMessages,
  dirtyMessageIds,
}: ReconcileLoadedCloudMessagesInput): ChatMessage[] {
  const requestStartById = new Map(requestStartMessages.map((message) => [message.id, message]));
  const currentById = new Map(currentMessages.map((message) => [message.id, message]));
  const reconciled = new Map(serverMessages.map((message) => [message.id, message]));

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
    const id = uuidv7();
    const isTemporary = useSettingsStore.getState().isTemporaryChat;
    const data = ManagedCloudCreateConversationResponseSchema.parse(
      await api.post<unknown>('/api/chat/conversations', {
        id,
        title: title ?? 'New Chat',
        projectId,
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
      temporary: isTemporary,
    };
    getCloudStore().getState().addCloudConversation(conversation);
    markConversationForSync(conversation.id);
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
