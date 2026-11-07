import {
  MANAGED_CLOUD_CHAT_MAX_STORED_MESSAGE_LENGTH,
  managedCloudMessagePath,
} from '@agiworkforce/cloud-contracts';
import type { AssistantFenceEdit } from '@agiworkforce/unified-chat/assistant-fence';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { readChatMutationError } from './chatMutationError';

export async function persistAssistantFenceEdit(params: {
  conversationId: string;
  messageId: string;
  edit: AssistantFenceEdit;
  authToken: string;
}): Promise<{ content: string; editRevision: string }> {
  const response = await fetch(managedCloudMessagePath(params.conversationId, params.messageId), {
    method: 'PATCH',
    headers: await addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.authToken}`,
    }),
    body: JSON.stringify({ fenceEdit: params.edit }),
  });
  if (!response.ok) {
    throw new Error(await readChatMutationError(response, 'This edit could not be saved.'));
  }
  const saved: unknown = await response.json();
  if (
    !saved ||
    typeof saved !== 'object' ||
    !('content' in saved) ||
    typeof saved.content !== 'string' ||
    saved.content.length > MANAGED_CLOUD_CHAT_MAX_STORED_MESSAGE_LENGTH ||
    !('editRevision' in saved) ||
    typeof saved.editRevision !== 'string' ||
    !saved.editRevision
  ) {
    throw new Error('The server did not confirm the saved edit. Reopen the chat and try again.');
  }
  return { content: saved.content, editRevision: saved.editRevision };
}
