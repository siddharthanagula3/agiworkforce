
export interface PendingEditRollback {
  conversationId: string;
  rollbackIds: string[];
}

interface MinimalMessage {
  id: string;
  role: string;
}

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

export function consumePendingEdit(
  pending: PendingEditRollback | null,
  sendConversationId: string,
): { rollbackIds: string[] } | null {
  if (!pending) return null;
  if (pending.conversationId !== sendConversationId) return null;
  if (pending.rollbackIds.length === 0) return null;
  return { rollbackIds: pending.rollbackIds };
}
