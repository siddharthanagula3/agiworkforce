'use client';

import {
  MANAGED_CLOUD_MAX_DRAFT_LENGTH,
  managedCloudConversationPath,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';

export type DraftSaveResult = 'saved' | 'failed' | 'conflict';

const observedDraftRevisions = new Map<string, string | null>();

export function observeConversationDraftRevision(
  conversationId: string,
  draftUpdatedAt: string | null | undefined,
): void {
  if (draftUpdatedAt === undefined) return;
  const observed = observedDraftRevisions.get(conversationId);
  if (observed && (!draftUpdatedAt || Date.parse(draftUpdatedAt) < Date.parse(observed))) return;
  observedDraftRevisions.set(conversationId, draftUpdatedAt);
}

export function clearObservedConversationDraftRevisions(): void {
  observedDraftRevisions.clear();
}

/**
 * Park the composer's unsent text on the conversation so it survives a reload
 * and reaches the user's other devices (§11 Draft persistence).
 *
 * Its own request rather than part of `updateConversation`: a draft write must
 * not bump the conversation's `updated_at` (which orders the sidebar) or its
 * version, and it happens while someone is typing. The caller handles retry
 * and user-visible exhaustion without treating a failed write as saved.
 */
export async function saveConversationDraft(
  conversationId: string,
  draft: string,
  getAuthHeaders: () => Promise<HeadersInit>,
): Promise<DraftSaveResult> {
  try {
    const headers = await addCsrfHeaders({
      'Content-Type': 'application/json',
      ...(await getAuthHeaders()),
    });
    const response = await fetch(managedCloudConversationPath(conversationId), {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        draft: draft.slice(0, MANAGED_CLOUD_MAX_DRAFT_LENGTH) || null,
        draftUpdatedAt: observedDraftRevisions.get(conversationId) ?? null,
      }),
    });
    if (response.status === 409) return 'conflict';
    if (!response.ok) return 'failed';
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('saved' in payload) || !payload.saved) {
      return 'failed';
    }
    const draftUpdatedAt = 'draftUpdatedAt' in payload ? payload.draftUpdatedAt : undefined;
    if (typeof draftUpdatedAt !== 'string' || Number.isNaN(Date.parse(draftUpdatedAt))) {
      return 'failed';
    }
    observedDraftRevisions.set(conversationId, draftUpdatedAt);
    return 'saved';
  } catch {
    return 'failed';
  }
}
