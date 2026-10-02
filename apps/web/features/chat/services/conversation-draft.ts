'use client';

import {
  MANAGED_CLOUD_MAX_DRAFT_LENGTH,
  managedCloudConversationPath,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';

export interface DraftConflict {
  kind: 'conflict';
  theirs: string;
  theirsRevision: string | null;
}

export type DraftSaveResult = 'saved' | 'failed' | DraftConflict;

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

export function adoptConversationDraftRevision(
  conversationId: string,
  draftUpdatedAt: string | null,
): void {
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
    if (response.status === 409) return readDraftConflict(await response.json());
    if (!response.ok) return 'failed';
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('saved' in payload) || !payload.saved) {
      return 'failed';
    }
    const draftUpdatedAt = 'draftUpdatedAt' in payload ? payload.draftUpdatedAt : undefined;
    if (
      draftUpdatedAt !== null &&
      (typeof draftUpdatedAt !== 'string' || Number.isNaN(Date.parse(draftUpdatedAt)))
    ) {
      return 'failed';
    }
    observedDraftRevisions.set(conversationId, draftUpdatedAt);
    return 'saved';
  } catch {
    return 'failed';
  }
}

function readDraftConflict(payload: unknown): DraftSaveResult {
  if (!payload || typeof payload !== 'object' || !('current' in payload)) return 'failed';
  const current = payload.current;
  if (!current || typeof current !== 'object') return 'failed';
  const theirs = 'draft' in current ? current.draft : undefined;
  const revision = 'draftUpdatedAt' in current ? current.draftUpdatedAt : undefined;
  if (typeof theirs !== 'string') return 'failed';
  if (revision !== null && (typeof revision !== 'string' || Number.isNaN(Date.parse(revision)))) {
    return 'failed';
  }
  return { kind: 'conflict', theirs, theirsRevision: revision };
}
