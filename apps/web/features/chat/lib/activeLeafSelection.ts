import { managedCloudConversationPath } from '@agiworkforce/cloud-contracts';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { readChatMutationError } from './chatMutationError';

const SELECTION_FAILURE_MESSAGE = 'Failed to select this response';

/**
 * Records which variant the reader is on. `keepalive` is load-bearing: paging is
 * usually the last thing someone does before reloading or opening another chat,
 * and without it the browser cancels this write as the document goes away, so
 * the next load comes back on the newest variant rather than the chosen one.
 */
export async function putActiveLeafMessageId(params: {
  conversationId: string;
  activeLeafMessageId: string | null;
  authToken: string;
}): Promise<void> {
  const headers = await addCsrfHeaders({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${params.authToken}`,
  });
  const response = await fetch(managedCloudConversationPath(params.conversationId), {
    method: 'PUT',
    headers,
    body: JSON.stringify({ activeLeafMessageId: params.activeLeafMessageId }),
    keepalive: true,
  });

  if (!response.ok) {
    throw new Error(await readChatMutationError(response, SELECTION_FAILURE_MESSAGE));
  }
}
