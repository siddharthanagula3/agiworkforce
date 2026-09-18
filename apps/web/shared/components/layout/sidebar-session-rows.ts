/**
 * The recents list both web shells hand to the shared `<Sidebar>`.
 *
 * WebChatPage and WebAppShell each mapped conversations to `SidebarSession`
 * by hand, and the two copies had already drifted: only the chat shell hid
 * temporary conversations, and only the other shell set `unread`, so the same
 * conversation row showed a different list and a different kebab menu
 * depending on which route the user happened to be on. Same rationale as
 * `app-nav-items.ts` and `sidebar-session-actions.ts`: one definition, two
 * call sites.
 */

import type { SidebarSession } from '@agiworkforce/ui';

export interface SidebarSessionSource {
  id: string;
  title: string;
  updatedAt: Date | string;
  isPinned?: boolean;
  isStarred?: boolean;
  isArchived?: boolean;
  isTemporary?: boolean;
  projectId?: string | null;
  messageCount?: number;
}

export interface SidebarSessionRowOptions<T extends SidebarSessionSource> {
  isUnread: (conversationId: string) => boolean;
  /** Run state and AGI Work marks that only the live chat shell can observe. */
  decorate?: (conversation: T) => Partial<SidebarSession>;
}

export function toSidebarSessions<T extends SidebarSessionSource>(
  conversations: readonly T[],
  { isUnread, decorate }: SidebarSessionRowOptions<T>,
): SidebarSession[] {
  return conversations
    .filter((conversation) => !conversation.isTemporary)
    .map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      pinned: conversation.isPinned ?? false,
      starred: conversation.isStarred ?? false,
      archived: conversation.isArchived ?? false,
      projectId: conversation.projectId ?? undefined,
      messageCount: conversation.messageCount,
      unread: isUnread(conversation.id),
      ...decorate?.(conversation),
    }));
}
