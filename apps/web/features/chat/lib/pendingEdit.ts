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
 * Plan the rollback for regenerating the assistant message `assistantId`.
 *
 * Regeneration deletes the user turn being regenerated (the nearest preceding
 * user message), its assistant reply, and anything after, then re-sends the user
 * content. The rollback range MUST start at that user message — rolling back only
 * from the assistant leaves the original user message in place, so re-sending its
 * content produces a duplicate user message. Returns the user message index (so
 * the caller can read its content/attachments/metadata) plus the ids to delete,
 * or `null` if there's no regenerable user turn.
 */
export function planRegenerateRollback(
  messages: readonly MinimalMessage[],
  assistantId: string,
): { userIndex: number; rollbackIds: string[] } | null {
  const idx = messages.findIndex((m) => m.id === assistantId);
  if (idx <= 0) return null;
  let userIndex = -1;
  for (let i = idx - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      userIndex = i;
      break;
    }
  }
  if (userIndex < 0) return null;
  return { userIndex, rollbackIds: messages.slice(userIndex).map((m) => m.id) };
}

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
