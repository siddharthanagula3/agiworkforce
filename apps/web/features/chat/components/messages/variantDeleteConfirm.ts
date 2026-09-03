import type { DestructiveConfirmCopy } from '@shared/components/layout/sidebar-session-actions';

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
  siblingCount: number;
}) {
  return {
    title: 'Delete this response?',
    description: `${deleted(options.followerCount)}. ${surviving(options.siblingCount)}. This cannot be undone.`,
    confirmText: 'Delete response',
    variant: 'destructive',
  } satisfies DestructiveConfirmCopy;
}
