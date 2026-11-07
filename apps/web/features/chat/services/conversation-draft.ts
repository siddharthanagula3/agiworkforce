'use client';

import {
  MANAGED_CLOUD_MAX_DRAFT_LENGTH,
  managedCloudConversationPath,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  createRequestAuthority,
  type RequestAuthority,
  type SessionAuthority,
} from '@/lib/identity/request-authority';

export interface DraftConflict {
  kind: 'conflict';
  theirs: string;
  theirsRevision: string | null;
}

export type DraftSaveResult = 'saved' | 'failed' | 'not_saved_yet' | 'superseded' | DraftConflict;

interface DraftSession {
  session: SessionAuthority;
  revisions: Map<string, string | null>;
  revisionChoices: Map<string, { revision: string | null }>;
  queues: Map<string, Promise<DraftSaveResult>>;
  requests: Set<RequestAuthority>;
}

let draftSession: DraftSession | null = null;
let draftAdmissionSession: SessionAuthority | null = null;
const draftOwnerSessions = new WeakMap<object, SessionAuthority>();

export function bindConversationDraftOwners(
  session: SessionAuthority,
  owners: Record<string, object>,
): void {
  if (!session.isCurrent()) return;
  const previous = draftAdmissionSession;
  if (previous && (
    !previous.isCurrent() || previous.userId !== session.userId || previous.sessionId !== session.sessionId
  )) {
    for (const owner of Object.values(owners)) {
      if (!draftOwnerSessions.has(owner)) draftOwnerSessions.set(owner, previous);
    }
  }
  draftAdmissionSession = session;
  for (const owner of Object.values(owners)) {
    if (!draftOwnerSessions.has(owner)) draftOwnerSessions.set(owner, session);
  }
}

export function isConversationDraftOwnerCurrent(owner: object, session: SessionAuthority): boolean {
  const original = draftOwnerSessions.get(owner);
  return original?.userId === session.userId && original.sessionId === session.sessionId &&
    original.isCurrent() && session.isCurrent();
}

function currentDraftSession(session: SessionAuthority): DraftSession | null {
  if (!session.isCurrent()) return null;
  if (
    draftSession?.session.userId === session.userId &&
    draftSession.session.sessionId === session.sessionId &&
    draftSession.session.isCurrent()
  ) return draftSession;
  clearObservedConversationDraftRevisions();
  draftSession = { session, revisions: new Map(), revisionChoices: new Map(), queues: new Map(), requests: new Set() };
  return draftSession;
}

export function observeConversationDraftRevision(
  conversationId: string,
  draftUpdatedAt: string | null | undefined,
  session: SessionAuthority,
): void {
  if (draftUpdatedAt === undefined) return;
  const owner = currentDraftSession(session);
  if (!owner) return;
  const observed = owner.revisions.get(conversationId);
  if (observed && (!draftUpdatedAt || Date.parse(draftUpdatedAt) < Date.parse(observed))) return;
  owner.revisions.set(conversationId, draftUpdatedAt);
}

export function adoptConversationDraftRevision(
  conversationId: string,
  draftUpdatedAt: string | null,
  session: SessionAuthority,
): void {
  currentDraftSession(session)?.revisionChoices.set(conversationId, { revision: draftUpdatedAt });
}

export function clearObservedConversationDraftRevisions(): void {
  for (const request of draftSession?.requests ?? []) request.retire();
  draftSession = null;
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
  session: SessionAuthority,
  canDispatch: () => boolean,
): Promise<DraftSaveResult> {
  const owner = currentDraftSession(session);
  if (!owner || !canDispatch()) return 'superseded';
  const previous = owner.queues.get(conversationId) ?? Promise.resolve();
  const queued = previous.then(() => writeConversationDraft(owner, conversationId, draft, canDispatch));
  owner.queues.set(conversationId, queued);
  void queued.finally(() => {
    if (owner.queues.get(conversationId) === queued) owner.queues.delete(conversationId);
  });
  return queued;
}

async function writeConversationDraft(
  owner: DraftSession,
  conversationId: string,
  draft: string,
  canDispatch: () => boolean,
): Promise<DraftSaveResult> {
  const authority = createRequestAuthority(
    owner.session,
    () => draftSession === owner,
    () => {
      if (!canDispatch()) throw new DOMException('Draft owner changed', 'AbortError');
    },
  );
  owner.requests.add(authority);
  try {
    authority.assertCurrent();
    if (!canDispatch()) return 'superseded';
    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    authority.assertCurrent();
    const revisionChoice = owner.revisionChoices.get(conversationId);
    const response = await authority.fetch(managedCloudConversationPath(conversationId), {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        draft: draft.slice(0, MANAGED_CLOUD_MAX_DRAFT_LENGTH) || null,
        draftUpdatedAt: revisionChoice ? revisionChoice.revision : owner.revisions.get(conversationId) ?? null,
      }),
    });
    if (response.status === 409) {
      const payload: unknown = await response.json();
      authority.assertCurrent();
      return readDraftConflict(payload);
    }
    if (response.status === 404) return 'not_saved_yet';
    if (!response.ok) return 'failed';
    const payload: unknown = await response.json();
    authority.assertCurrent();
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
    observeConversationDraftRevision(conversationId, draftUpdatedAt, owner.session);
    if (revisionChoice && owner.revisionChoices.get(conversationId) === revisionChoice) {
      owner.revisionChoices.delete(conversationId);
    }
    return 'saved';
  } catch {
    return authority.isCurrent() && canDispatch() ? 'failed' : 'superseded';
  } finally {
    owner.requests.delete(authority);
    authority.retire();
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
