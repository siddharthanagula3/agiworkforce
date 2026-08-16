import { api } from '@/services/api';
import { managedCloudMessagePath } from '@agiworkforce/cloud-contracts';

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /HTTP 404\b/.test(error.message);
}

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
