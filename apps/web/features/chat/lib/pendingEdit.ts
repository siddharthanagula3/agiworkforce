/**
 * Pending-edit rollback coordination (data-loss-safe message editing).
 *
 * Editing a user message conceptually rewinds the conversation to that point and
 * lets the user resubmit a revised version. The destructive part — deleting the
 * edited message and every message after it — MUST NOT happen when the user
 * merely clicks "Edit". If it does and the user then abandons the edit (navigates
 * away, reloads, clears the composer), the messages are permanently gone.
 *
 * These two pure helpers split the decision from the side effect:
 *   - `planEditRollback` computes the range to delete and stashes it as a pending
 *     intent (the composer is prefilled separately). Nothing is deleted yet.
 *   - `consumePendingEdit` is called on the next send; only then does the caller
 *     perform the deletion, and only if the send targets the same conversation
 *     the edit began in.
 */

export interface PendingEditRollback {
  conversationId: string;
  /** Edited user message id + every message id after it, in order. */
  rollbackIds: string[];
}

interface MinimalMessage {
  id: string;
  role: string;
}

/**
 * Plan the rollback for an edit of `messageId` within `conversationId`.
 *
 * Returns the pending rollback (edited message + all subsequent messages) or
 * `null` if the target isn't an editable user message. No side effects: the
 * caller stashes the result and defers deletion until resubmission.
 */
export function planEditRollback(
  messages: readonly MinimalMessage[],
  messageId: string,
  conversationId: string,
): PendingEditRollback | null {
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return null;
  const target = messages[idx];
  if (!target || target.role !== 'user') return null;
  return {
    conversationId,
    rollbackIds: messages.slice(idx).map((m) => m.id),
  };
}

/**
 * `planRegenerateRollback` moved to `@agiworkforce/unified-chat`
 * (`packages/ui/unified-chat/src/lib/regenerateReplay.ts`) alongside the
 * regenerate replay decision it is always used with, so Desktop Cloud's
 * Regenerate rolls back over exactly the same range web does. Re-exported here
 * to keep web's import path (and its tests) unchanged.
 */
export { planRegenerateRollback } from '@agiworkforce/unified-chat';

/**
 * Resolve a stashed rollback at send time.
 *
 * Returns the ids to delete only when a pending edit exists AND the outgoing
 * message targets the conversation the edit began in. Otherwise returns `null`
 * (a normal, non-destructive send). Guarding on the conversation id prevents an
 * abandoned edit in conversation A from truncating conversation B.
 */
export function consumePendingEdit(
  pending: PendingEditRollback | null,
  sendConversationId: string,
): { rollbackIds: string[] } | null {
  if (!pending) return null;
  if (pending.conversationId !== sendConversationId) return null;
  if (pending.rollbackIds.length === 0) return null;
  return { rollbackIds: pending.rollbackIds };
}
