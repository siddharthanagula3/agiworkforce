/**
 * Confirmation copy for the sidebar's destructive session/project actions.
 *
 * WebChatPage and WebAppShell each mount their own Sidebar with their own
 * handlers, and both dialogs were hand-matched strings with nothing enforcing
 * sameness (duplication/chat-shells.md Finding 2, the sibling nav-items array
 * had already drifted under exactly this pattern, which is why
 * `app-nav-items.ts` exists). One definition, two call sites.
 */

import { toast } from 'sonner';

export interface DestructiveConfirmCopy {
  title: string;
  description: string;
  confirmLabel: string;
}

/**
 * The row menu closes the instant an item is chosen, so a mutation that fails
 * after that point leaves the user looking at an unchanged row with nothing to
 * read. `useConversations` reports every one of these as `false` and records
 * the reason in the chat store, which no shell outside `/chat` renders. The
 * project half of the same menu has said so through a toast since it was
 * written (`sidebar-project-actions.ts`); this is the conversation half.
 */
export type SessionRowAction =
  'rename' | 'pin' | 'unpin' | 'archive' | 'restore' | 'moveToProject' | 'delete';

const SESSION_ROW_ACTION_FAILURE: Record<SessionRowAction, string> = {
  rename: 'Could not rename this conversation',
  pin: 'Could not pin this conversation',
  unpin: 'Could not unpin this conversation',
  archive: 'Could not archive this conversation',
  restore: 'Could not restore this conversation',
  moveToProject: 'Could not move this conversation',
  delete: 'Could not delete this conversation',
};

export function sessionRowActionFailureMessage(action: SessionRowAction): string {
  return SESSION_ROW_ACTION_FAILURE[action];
}

export async function runSessionRowAction(
  action: SessionRowAction,
  run: () => Promise<boolean>,
): Promise<boolean> {
  const succeeded = await run();
  if (!succeeded) toast.error(SESSION_ROW_ACTION_FAILURE[action]);
  return succeeded;
}

export function conversationHref(conversationId: string): string {
  return `/chat/${encodeURIComponent(conversationId)}`;
}

export function conversationShareHref(conversationId: string): string {
  return `${conversationHref(conversationId)}?share=true`;
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
    confirmLabel: 'Delete conversation',
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
    confirmLabel: 'Delete project',
  } satisfies DestructiveConfirmCopy;
}
