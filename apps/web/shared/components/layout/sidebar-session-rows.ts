/** The recents list both web shells hand to the shared `<Sidebar>`. */

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
