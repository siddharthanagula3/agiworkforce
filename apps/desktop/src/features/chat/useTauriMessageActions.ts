import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { isAutoModeModelId } from '@agiworkforce/types';
import {
  useChatModelStore,
  useChatStore as useSharedChatStore,
  type MessageActionSlots,
  type MessageFeedback,
  type MessageVariantPager,
  type RegenerateModelOption,
} from '@agiworkforce/unified-chat';
import { useTTS } from '../../hooks/useTTS';
import { invoke } from '../../lib/tauri-mock';
import { selectPrivacyMode, useAppModeStore } from '../../stores/appModeStore';
import {
  resolveDesktopChatOwnerId,
  useChatStore,
  uuidToDbId,
  type BackendConversation,
} from '../../stores/chat/chatStore';

interface BranchGroup {
  messageId: number;
  clientId: string | null;
  conversationIds: number[];
  activeIndex: number;
}

const NO_GROUPS: BranchGroup[] = [];
const NO_FEEDBACK: Readonly<Record<string, MessageFeedback>> = {};

/** A message loaded from SQLite carries its row id; one sent in this window, its client id. */
function messageRef(messageId: string): { id: number | null; clientId: string | null } {
  return /^\d+$/.test(messageId)
    ? { id: Number(messageId), clientId: null }
    : { id: null, clientId: messageId };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The reply actions the Tauri host carries out, for `ChatInterface`'s
 * `messageActions`. Read aloud works in every mode; rating, branching into a
 * new chat and paging between branches act on SQLite, so they are Local only.
 */
export function useTauriMessageActions(): MessageActionSlots {
  const { speakWithBargeIn, stopNative } = useTTS();
  const privacyMode = useAppModeStore(selectPrivacyMode);
  const local = privacyMode === 'local';
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const conversations = useChatStore((state) => state.conversations);
  const activeDbId = activeConversationId ? uuidToDbId(activeConversationId) : undefined;
  const messages = useSharedChatStore((state) =>
    activeConversationId ? state.messagesByConversation[activeConversationId] : undefined,
  );
  const isStreaming = useSharedChatStore((state) => state.isStreaming);

  const [readingAloudMessageId, setReadingAloudMessageId] = useState<string | null>(null);
  const [branchingMessageId, setBranchingMessageId] = useState<string | null>(null);
  const [feedbackOverrides, setFeedbackOverrides] = useState<
    Record<string, MessageFeedback | null>
  >({});
  const [groupsState, setGroupsState] = useState<{
    conversationId: number;
    groups: BranchGroup[];
  } | null>(null);
  const [groupsVersion, setGroupsVersion] = useState(0);

  useEffect(() => {
    if (!local || activeDbId === undefined) return;
    let cancelled = false;
    void invoke<BranchGroup[]>('chat_list_conversation_branches', {
      conversationId: activeDbId,
      userId: resolveDesktopChatOwnerId(),
    })
      .then((groups) => {
        if (!cancelled) setGroupsState({ conversationId: activeDbId, groups });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[messageActions] Failed to load branches:', error);
        setGroupsState({ conversationId: activeDbId, groups: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [local, activeDbId, groupsVersion]);

  const groups =
    local && groupsState && groupsState.conversationId === activeDbId
      ? groupsState.groups
      : NO_GROUPS;

  const onReadAloud = useCallback(
    (messageId: string, content: string) => {
      if (readingAloudMessageId === messageId) {
        setReadingAloudMessageId(null);
        void stopNative();
        return;
      }
      setReadingAloudMessageId(messageId);
      void speakWithBargeIn(content).finally(() => {
        setReadingAloudMessageId((current) => (current === messageId ? null : current));
      });
    },
    [readingAloudMessageId, speakWithBargeIn, stopNative],
  );

  const onFeedback = useCallback(
    (messageId: string, feedback: MessageFeedback | null) => {
      if (activeDbId === undefined) return;
      const previous = feedbackOverrides[messageId];
      setFeedbackOverrides((current) => ({ ...current, [messageId]: feedback }));
      void invoke('chat_set_message_feedback', {
        conversationId: activeDbId,
        userId: resolveDesktopChatOwnerId(),
        ...messageRef(messageId),
        feedback,
      }).catch((error: unknown) => {
        setFeedbackOverrides((current) => {
          const next = { ...current };
          if (previous === undefined) delete next[messageId];
          else next[messageId] = previous;
          return next;
        });
        toast.error('Your rating was not saved', { description: errorText(error) });
      });
    },
    [activeDbId, feedbackOverrides],
  );

  const onBranch = useCallback(
    (messageId: string) => {
      if (activeDbId === undefined || branchingMessageId) return;
      setBranchingMessageId(messageId);
      const ref = messageRef(messageId);
      void invoke<BackendConversation>('chat_branch_conversation', {
        conversationId: activeDbId,
        userId: resolveDesktopChatOwnerId(),
        messageId: ref.id,
        clientId: ref.clientId,
      })
        .then((branch) => {
          useChatStore.getState().openSavedConversation(branch);
          setGroupsVersion((version) => version + 1);
          toast.success('Branched into a new chat');
        })
        .catch((error: unknown) => {
          toast.error('Could not branch this chat', { description: errorText(error) });
        })
        .finally(() => setBranchingMessageId(null));
    },
    [activeDbId, branchingMessageId],
  );

  const feedbackByMessageId = useMemo(() => {
    if (!local) return NO_FEEDBACK;
    const stored: Record<string, MessageFeedback> = {};
    for (const message of messages ?? []) {
      const value = message.metadata?.['feedback'];
      if (value === 'up' || value === 'down') stored[message.id] = value;
    }
    for (const [messageId, value] of Object.entries(feedbackOverrides)) {
      if (value === null) delete stored[messageId];
      else stored[messageId] = value;
    }
    return stored;
  }, [local, messages, feedbackOverrides]);

  const getVariantPager = useCallback(
    (messageId: string): MessageVariantPager | null => {
      const group = groups.find(
        (candidate) =>
          String(candidate.messageId) === messageId || candidate.clientId === messageId,
      );
      if (!group) return null;
      const listed = new Map(
        conversations.map((conversation) => [uuidToDbId(conversation.id), conversation.id]),
      );
      const siblings = group.conversationIds.flatMap((dbId) => {
        const uuid = listed.get(dbId);
        return uuid ? [{ dbId, uuid }] : [];
      });
      const index = siblings.findIndex((sibling) => sibling.dbId === activeDbId);
      if (index === -1 || siblings.length < 2) return null;
      const open = (target: number) => {
        const sibling = siblings[target];
        if (sibling) useChatStore.getState().selectConversation(sibling.uuid);
      };
      return {
        index,
        total: siblings.length,
        onPrevious: () => open(index - 1),
        onNext: () => open(index + 1),
        disabled: isStreaming,
      };
    },
    [groups, conversations, activeDbId, isStreaming],
  );

  return useMemo<MessageActionSlots>(
    () => ({
      onReadAloud,
      readingAloudMessageId,
      ...(local && activeDbId !== undefined
        ? {
            onFeedback,
            feedbackByMessageId,
            onBranch,
            branchingMessageId,
            getVariantPager,
          }
        : {}),
    }),
    [
      onReadAloud,
      readingAloudMessageId,
      local,
      activeDbId,
      onFeedback,
      feedbackByMessageId,
      onBranch,
      branchingMessageId,
      getVariantPager,
    ],
  );
}

/**
 * The models a reply can be regenerated with: the ones the composer offers in
 * the current mode, without the automatic routing profiles.
 */
export function useRegenerateModelOptions(): readonly RegenerateModelOption[] {
  const models = useChatModelStore((state) => state.models);
  return useMemo(
    () =>
      models
        .filter((model) => !isAutoModeModelId(model.id))
        .map((model) => ({ id: model.id, name: model.name })),
    [models],
  );
}
