import { useCallback, useMemo } from 'react';
import {
  useChatStore as useSharedChatStore,
  type ConversationHeaderProps,
} from '@agiworkforce/unified-chat';
import { selectPrivacyMode, useAppModeStore } from '../../stores/appModeStore';
import { useChatStore, uuidToDbId } from '../../stores/chat/chatStore';

type TemporaryChatControl = NonNullable<ConversationHeaderProps['temporaryChat']>;

/**
 * The header's temporary-chat switch for Local mode. A temporary chat is never
 * written to SQLite or the stored chat list, the native runtime skips memory
 * for it, and it is discarded when the user leaves it. The switch only works
 * on an empty chat: a conversation cannot move in or out of history mid-thread.
 */
export function useTemporaryChatControl(): TemporaryChatControl | undefined {
  const privacyMode = useAppModeStore(selectPrivacyMode);
  const active = useChatStore((state) =>
    state.conversations.find((conversation) => conversation.id === state.activeConversationId),
  );
  const activeId = active?.id ?? null;
  const isTemporary = active?.incognito === true;
  const messageCount = useSharedChatStore((state) =>
    activeId ? (state.messagesByConversation[activeId]?.length ?? 0) : 0,
  );
  const canToggle =
    messageCount === 0 && (isTemporary || !activeId || uuidToDbId(activeId) === undefined);

  const onToggle = useCallback(() => {
    const store = useChatStore.getState();
    const previous = store.conversations.find(
      (conversation) => conversation.id === store.activeConversationId,
    );
    if (isTemporary) {
      store.createConversation('New chat');
      return;
    }
    store.createConversation('Temporary chat', { incognito: true });
    const previousIsEmptyDraft =
      previous &&
      uuidToDbId(previous.id) === undefined &&
      (useSharedChatStore.getState().messagesByConversation[previous.id]?.length ?? 0) === 0;
    if (previousIsEmptyDraft) void useChatStore.getState().deleteConversation(previous.id);
  }, [isTemporary]);

  return useMemo(
    () => (privacyMode === 'local' ? { active: isTemporary, canToggle, onToggle } : undefined),
    [privacyMode, isTemporary, canToggle, onToggle],
  );
}
