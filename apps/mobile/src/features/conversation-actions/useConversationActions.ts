import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { archiveConversation, restoreArchivedConversation } from '@/src/features/archived-chats';
import { showToast } from '@/src/shared/components/Toast';
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateOwned,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';
import { executionModeForConversation } from '@/src/features/chat/utils/conversationMode';
import { visibleThreadFor } from '@/src/features/chat/utils/conversationThread';
import { useProjectStore } from '@/src/features/projects/store';
import { confirmShareConversation } from '@/src/features/shared-links/shareConversation';
import { useChatStore } from '@/stores/chatStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { getConversationMessageStore } from '@/stores/chat/conversationRepository';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import type { ConversationSummary } from '@/types/chat';

export interface ConversationMenuAction {
  key: string;
  label: string;
  destructive?: boolean;
  selected?: boolean;
  run: () => void;
}

export interface ConversationMenuState {
  visible: boolean;
  title: string;
  actions: ConversationMenuAction[];
  close: () => void;
}

export interface ConversationRenameState {
  visible: boolean;
  conversationId: string | null;
  title: string;
  text: string;
  setText: (text: string) => void;
  submit: () => void;
  cancel: () => void;
  menu: ConversationMenuState;
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

interface OpenMenu {
  title: string;
  actions: ConversationMenuAction[];
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
 * account that is now signed in. The list is a sheet rather than an `Alert`
 * because Android renders at most three alert buttons, which dropped Delete
 * and Cancel from a Cloud chat's five-action menu.
 */
export function useConversationActions(): ConversationActions {
  const conversations = useChatStore((s) => s.conversations);
  const cloudConversations = useChatCloudMessageStore((s) => s.conversations);
  const pinConversation = useChatStore((s) => s.pinConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const markConversationRead = useChatStore((s) => s.markConversationRead);
  const markConversationUnread = useChatStore((s) => s.markConversationUnread);
  const moveConversationToProject = useChatStore((s) => s.moveConversationToProject);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const localProjects = useProjectStore((s) => s.projects);
  const cloudProjects = useCloudProjectStore((s) => s.projects);

  const [pendingRename, setPendingRename] = useState<PendingRename | null>(null);
  const [renameText, setRenameText] = useState('');
  const [openMenu, setOpenMenu] = useState<OpenMenu | null>(null);

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
            const cloudStore = useChatCloudMessageStore.getState();
            const index = cloudStore.conversations.findIndex((c) => c.id === conversationId);
            cloudStore.removeCloudConversation(conversationId);
            showToast('Chat archived. Find it in Settings, Archived chats.', {
              label: 'Undo',
              onPress: () => {
                void (async () => {
                  try {
                    await restoreArchivedConversation(conversationId);
                    if (!isAccountScopedUiStateOwned(ownership)) return;
                    useChatCloudMessageStore
                      .getState()
                      .restoreCloudConversation(
                        { ...conversation, pinned: false },
                        Math.max(0, index),
                      );
                  } catch {
                    Alert.alert(
                      'Could not unarchive',
                      'Find the chat in Settings, Archived chats.',
                    );
                  }
                })();
              },
            });
          } catch {
            Alert.alert('Could not archive', 'Check your connection and try again.');
          }
        })();
      });

      const share = guard(() =>
        confirmShareConversation({
          conversationId,
          title: title || 'Chat',
          modelId: conversation.model ?? null,
          isCurrent: () => isAccountScopedUiStateOwned(ownership),
          readMessages: async () => {
            await loadMessages(conversationId);
            const state = getConversationMessageStore(conversationId).getState();
            const thread = visibleThreadFor(
              state.messages[conversationId] ?? [],
              state.conversations.find((c) => c.id === conversationId),
            );
            if (thread.length === 0) throw new Error('This chat has no messages to share yet.');
            return thread.map((message) => ({
              role: message.role,
              content: message.content,
              ...(message.createdAt ? { createdAt: message.createdAt } : {}),
            }));
          },
        }),
      );

      const moveTo = (projectId: string | null, projectName: string | null) =>
        guard(() => {
          void moveConversationToProject(conversationId, projectId).then((moved) => {
            if (!isAccountScopedUiStateOwned(ownership)) return;
            if (!moved) {
              Alert.alert('Could not move chat', 'Check your connection and try again.');
              return;
            }
            showToast(projectName ? `Moved to ${projectName}` : 'Removed from project');
          });
        });

      const projects = isCloudConversation
        ? cloudProjects
            .filter((p) => p.deletedAt === null && !p.isArchived)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : localProjects;

      const move = guard(() => {
        const current = conversation.projectId ?? null;
        setOpenMenu({
          title: 'Move to project',
          actions: [
            ...projects
              .filter((p) => p.id !== current)
              .map((p) => ({ key: `project-${p.id}`, label: p.name, run: moveTo(p.id, p.name) })),
            ...(current
              ? [{ key: 'project-none', label: 'Remove from project', run: moveTo(null, null) }]
              : []),
          ],
        });
      });

      const canMove =
        projects.some((p) => p.id !== conversation.projectId) || !!conversation.projectId;
      const unread = conversation.unread === true;

      const actions: ConversationMenuAction[] = [
        ...(isCloudConversation && !conversation.temporary
          ? [{ key: 'share', label: 'Share', run: share }]
          : []),
        {
          key: 'rename',
          label: 'Rename',
          run: guard(() => {
            setRenameText(conversation.title ?? '');
            setPendingRename({ conversationId, title: title || 'Chat', ownership });
          }),
        },
        {
          key: 'pin',
          label: pinned ? 'Unpin' : 'Pin',
          run: guard(() => void pinConversation(conversationId)),
        },
        ...(canMove ? [{ key: 'move', label: 'Move to project', run: move }] : []),
        {
          key: 'unread',
          label: unread ? 'Mark as read' : 'Mark as unread',
          run: guard(() =>
            unread ? markConversationRead(conversationId) : markConversationUnread(conversationId),
          ),
        },
        ...(isCloudConversation ? [{ key: 'archive', label: 'Archive', run: archive }] : []),
        {
          key: 'delete',
          label: 'Delete',
          destructive: true,
          run: guard(() =>
            Alert.alert(
              'Delete chat?',
              'This chat and its messages are removed from every device on this account. You can restore it from Recently deleted in Settings on the web.',
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
      ];

      setOpenMenu({ title: title || 'Chat', actions });
    },
    [
      cloudConversations,
      cloudProjects,
      conversations,
      localProjects,
      deleteConversation,
      loadMessages,
      markConversationRead,
      markConversationUnread,
      moveConversationToProject,
      pinConversation,
    ],
  );

  const closeMenu = useCallback(() => setOpenMenu(null), []);

  const menu = useMemo<ConversationMenuState>(
    () => ({
      visible: openMenu !== null,
      title: openMenu?.title ?? '',
      actions: openMenu?.actions ?? [],
      close: closeMenu,
    }),
    [closeMenu, openMenu],
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
      conversationId: pendingRename?.conversationId ?? null,
      title: pendingRename?.title ?? '',
      text: renameText,
      setText: setRenameText,
      submit: submitRename,
      cancel: cancelRename,
      menu,
    },
  };
}
