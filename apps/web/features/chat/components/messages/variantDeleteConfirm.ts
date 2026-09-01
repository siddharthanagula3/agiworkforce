import type { DestructiveConfirmCopy } from '@shared/components/layout/sidebar-session-actions';

/**
 * Confirmation copy for deleting one response among its siblings.
 *
 * Every claim is checked against the route this action calls — DELETE
 * `/api/chat/conversations/[id]/messages/[messageId]?subtree=true`:
 *
 * - It collects the message and every row descended from it, so the count of
 *   what follows has to be named rather than left to the reader to guess.
 * - It is `delete from web_messages`, not a soft delete like the conversation
 *   route, so "cannot be undone" is literal.
 * - It repoints the reader at the newest surviving sibling's own tail, which is
 *   the same variant the pager shows by default — so the copy can promise where
 *   they land.
 */
function deleted(followerCount: number): string {
  if (followerCount < 1) return 'This response is deleted';
  if (followerCount === 1) return 'This response and the message that follows it are deleted';
  return `This response and the ${followerCount} messages that follow it are deleted`;
}

function surviving(siblingCount: number): string {
  if (siblingCount === 1) return 'The other answer to this message stays, and you are moved to it';
  return `The other ${siblingCount} answers to this message stay, and you are moved to the newest`;
}

export function variantDeleteConfirm(options: {
  /** Rows descended from this response, which go with it. */
  followerCount: number;
  /** Siblings left once this response is gone — never zero, or there is no variant to delete. */
  siblingCount: number;
}) {
  return {
    title: 'Delete this response?',
    description: `${deleted(options.followerCount)}. ${surviving(options.siblingCount)}. This cannot be undone.`,
    confirmText: 'Delete response',
    variant: 'destructive',
  } satisfies DestructiveConfirmCopy;
}
