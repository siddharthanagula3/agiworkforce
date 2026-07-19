import { api } from '@/services/api';
import { managedCloudMessagePath } from '@agiworkforce/cloud-contracts';

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /HTTP 404\b/.test(error.message);
}

/**
 * Permanently delete Cloud message rows before replacing a transcript tail.
 * The endpoint is ownership-scoped server-side; 404 is idempotent success.
 */
export async function deleteCloudMessagesRemote(
  conversationId: string,
  messageIds: readonly string[],
): Promise<void> {
  for (const messageId of messageIds) {
    try {
      await api.delete(managedCloudMessagePath(conversationId, messageId));
    } catch (error) {
      if (isNotFound(error)) continue;
      throw error;
    }
  }
}

/**
 * Persist a per-message thumbs reaction on a Cloud conversation. The web app
 * PATCHes the SAME endpoint (`reaction` merged into message metadata), so the
 * rating is visible cross-surface. 404 is idempotent success (the message row
 * was deleted). Best-effort: callers update local state optimistically and do
 * not block the tap on the network.
 */
export async function setCloudMessageReactionRemote(
  conversationId: string,
  messageId: string,
  reaction: 'thumbsUp' | 'thumbsDown' | null,
): Promise<void> {
  try {
    await api.patch(managedCloudMessagePath(conversationId, messageId), { reaction });
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
}
