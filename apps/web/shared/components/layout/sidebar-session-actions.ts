/**
 * Confirmation copy for the sidebar's destructive session/project actions.
 *
 * WebChatPage and WebAppShell each mount their own Sidebar with their own
 * handlers, and both dialogs were hand-matched strings with nothing enforcing
 * sameness (duplication/chat-shells.md Finding 2, the sibling nav-items array
 * had already drifted under exactly this pattern, which is why
 * `app-nav-items.ts` exists). One definition, two call sites.
 */

export interface DestructiveConfirmCopy {
  title: string;
  description: string;
  confirmText: string;
  variant: 'destructive';
}

function quoted(label: string | null | undefined, fallback: string): string {
  return label?.trim() ? `“${label.trim()}”` : fallback;
}

/**
 * agentic-modes-gap-07 / MEDIA-DELETE-11: the copy names what survives, and
 * every claim is checked against the server rather than assumed.
 *
 * - DELETE /api/chat/conversations/[id] stamps `deleted_at` on the conversation
 *   only, so "removed from your chats" is the honest scope.
 * - `media_assets` is listed by owner with no join to conversations, and its
 *   `conversation_id` foreign key is ON DELETE SET NULL, so generated images and
 *   videos genuinely outlive the chat.
 * - Schedules are deliberately NOT named: `scheduled_tasks` has no conversation
 *   column, so no schedule can be bound to a conversation in the first place.
 */
export function conversationDeleteConfirm(title: string | null | undefined) {
  return {
    title: 'Delete conversation?',
    description: `${quoted(title, 'This conversation')} and every message in it will be removed from your chats. This cannot be undone. Images and videos generated here stay in your library.`,
    confirmText: 'Delete conversation',
    variant: 'destructive',
  } satisfies DestructiveConfirmCopy;
}

/**
 * WEB-130: DELETE /api/projects/[id] stamps `deleted_at` on the project, moves
 * its conversations out, and soft-deletes its knowledge files while erasing the
 * stored source bytes, so the sources genuinely go, but the project row itself
 * is retained rather than erased, which is why nothing here promises a purge.
 */
export function projectDeleteConfirm(name: string | null | undefined) {
  return {
    title: 'Delete project?',
    description: `${quoted(name, 'This project')} and its instructions will be removed from your workspace, and the files you added as project sources will be deleted. Conversations in this project will be moved to “All Chats”. This cannot be undone.`,
    confirmText: 'Delete project',
    variant: 'destructive',
  } satisfies DestructiveConfirmCopy;
}
