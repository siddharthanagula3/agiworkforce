import { api } from '@/services/api';
import { managedCloudMessagePath } from '@agiworkforce/cloud-contracts';
import {
  assertCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /HTTP 404\b/.test(error.message);
}

export async function deleteCloudMessagesRemote(
  conversationId: string,
  messageIds: readonly string[],
  accountEpoch?: CloudAccountEpoch | null,
): Promise<void> {
  for (const messageId of messageIds) {
    if (accountEpoch !== undefined) assertCloudAccountEpochCurrent(accountEpoch);
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
  accountEpoch?: CloudAccountEpoch | null,
): Promise<void> {
  if (accountEpoch !== undefined) assertCloudAccountEpochCurrent(accountEpoch);
  try {
    await api.patch(managedCloudMessagePath(conversationId, messageId), { reaction });
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
}
