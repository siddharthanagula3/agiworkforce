import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { archiveConversation } from '@/src/features/archived-chats';
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateOwned,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';
import { executionModeForConversation } from '@/src/features/chat/utils/conversationMode';
import { useChatStore } from '@/stores/chatStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import type { ConversationSummary } from '@/types/chat';

export interface ConversationRenameState {
  visible: boolean;
  title: string;
  text: string;
  setText: (text: string) => void;
  submit: () => void;
  cancel: () => void;
}

export interface ConversationActions {
  openActions: (conversationId: string, title: string, pinned: boolean) => void;
  rename: ConversationRenameState;
}

interface PendingRename {
  conversationId: string;
  title: string;
  ownership: AccountScopedUiState;
}

function findConversation(
  conversationId: string,
  local: ReadonlyArray<ConversationSummary>,
  cloud: ReadonlyArray<ConversationSummary>,
): ConversationSummary | undefined {
  return local.find((c) => c.id === conversationId) ?? cloud.find((c) => c.id === conversationId);
}

/**
 * The chat row action sheet shared by the drawer and the Chats list. Every
 * mutation re-checks the account that owned the row when the sheet opened, so
 * an account switch between the tap and the confirmation cannot write into the
 * account that is now signed in.
 */
export function useConversationActions(): ConversationActions {
  const conversations = useChatStore((s) => s.conversations);
  const cloudConversations = useChatCloudMessageStore((s) => s.conversations);
  const pinConversation = useChatStore((s) => s.pinConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const renameConversation = useChatStore((s) => s.renameConversation);

  const [pendingRename, setPendingRename] = useState<PendingRename | null>(null);
  const [renameText, setRenameText] = useState('');

  const openActions = useCallback(
    (conversationId: string, title: string, pinned: boolean) => {
      const conversation = findConversation(conversationId, conversations, cloudConversations);
      if (!conversation) return;
      // `archived` is a column on web_conversations, so archiving only exists
      // for Cloud chats. Local Mode chats never leave the device and have no
      // archived set to move into.
      const isCloudConversation = executionModeForConversation(conversation) === 'cloud';
      const ownership = captureAccountScopedUiState(isCloudConversation ? 'cloud' : 'local');
      if (!ownership) return;

      const guard = (run: () => void) => () => {
        if (!isAccountScopedUiStateOwned(ownership)) return;
        run();
      };

      const archive = guard(() => {
        void (async () => {
          try {
            await archiveConversation(conversationId);
            // Only hide the row once the server has acknowledged the write; a
            // swallowed failure would leave the chat visibly gone here and
            // still present on web and desktop.
            if (!isAccountScopedUiStateOwned(ownership)) return;
            useChatCloudMessageStore.getState().removeCloudConversation(conversationId);
          } catch (error) {
            Alert.alert(
              'Could not archive',
              error instanceof Error ? error.message : 'Check your connection and try again.',
            );
          }
        })();
      });

      Alert.alert(title || 'Chat', undefined, [
        {
          text: 'Rename',
          onPress: guard(() => {
            setRenameText(conversation.title ?? '');
            setPendingRename({ conversationId, title: title || 'Chat', ownership });
          }),
        },
        {
          text: pinned ? 'Unpin' : 'Pin',
          onPress: guard(() => void pinConversation(conversationId)),
        },
        ...(isCloudConversation ? [{ text: 'Archive', onPress: archive }] : []),
        {
          text: 'Delete',
          style: 'destructive' as const,
          onPress: guard(() =>
            Alert.alert(
              'Delete chat?',
              'This chat and its messages are removed from every device on this account. It cannot be recovered.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: guard(() => void deleteConversation(conversationId)),
                },
              ],
            ),
          ),
        },
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    },
    [cloudConversations, conversations, deleteConversation, pinConversation],
  );

  const cancelRename = useCallback(() => {
    setPendingRename(null);
    setRenameText('');
  }, []);

  const submitRename = useCallback(() => {
    const pending = pendingRename;
    if (!pending) return;
    const trimmed = renameText.trim();
    if (trimmed && isAccountScopedUiStateOwned(pending.ownership)) {
      renameConversation(pending.conversationId, trimmed);
    }
    cancelRename();
  }, [cancelRename, pendingRename, renameConversation, renameText]);

  return {
    openActions,
    rename: {
      visible: pendingRename !== null,
      title: pendingRename?.title ?? '',
      text: renameText,
      setText: setRenameText,
      submit: submitRename,
      cancel: cancelRename,
    },
  };
}
