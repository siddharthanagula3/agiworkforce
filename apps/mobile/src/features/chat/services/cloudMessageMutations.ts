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
