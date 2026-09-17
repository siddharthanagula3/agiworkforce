'use client';

import {
  MANAGED_CLOUD_MAX_DRAFT_LENGTH,
  managedCloudConversationPath,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';

/**
 * Park the composer's unsent text on the conversation so it survives a reload
 * and reaches the user's other devices (§11 Draft persistence).
 *
 * Its own request rather than part of `updateConversation`: a draft write must
 * not bump the conversation's `updated_at` (which orders the sidebar) or its
 * version, and it happens while someone is typing. A failure is silent by
 * design: the local copy is already parked, so the only cost is that the other
 * device does not see this keystroke, and a toast on every debounce would be
 * worse than the thing it reports.
 */
export async function saveConversationDraft(
  conversationId: string,
  draft: string,
  getAuthHeaders: () => Promise<HeadersInit>,
): Promise<boolean> {
  try {
    const headers = await addCsrfHeaders({
      'Content-Type': 'application/json',
      ...(await getAuthHeaders()),
    });
    const response = await fetch(managedCloudConversationPath(conversationId), {
      method: 'PUT',
      headers,
      body: JSON.stringify({ draft: draft.slice(0, MANAGED_CLOUD_MAX_DRAFT_LENGTH) || null }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
