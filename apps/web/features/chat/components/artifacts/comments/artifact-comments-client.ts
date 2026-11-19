'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  artifactCommentPath,
  artifactCommentsPath,
  canCommentOnArtifact,
  type ArtifactComment,
  type ArtifactCommentAnchor,
  type ArtifactCommentCreateRequest,
  type ArtifactCommentListResponse,
  type ArtifactCommentResponse,
  type ArtifactCommentUpdateRequest,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';

export type { ArtifactComment, ArtifactCommentAnchor };

export interface ArtifactCommentThread {
  root: ArtifactComment;
  replies: ArtifactComment[];
}

export function canCommentOn(artifactId: string): boolean {
  return canCommentOnArtifact(artifactId);
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string | { message?: string };
  };
  const message = typeof body.error === 'string' ? body.error : body.error?.message;
  return new Error(message || fallback);
}

export function groupThreads(comments: readonly ArtifactComment[]): ArtifactCommentThread[] {
  const threads = new Map<string, ArtifactCommentThread>();
  for (const comment of comments) {
    if (!comment.parentId) threads.set(comment.id, { root: comment, replies: [] });
  }
  for (const comment of comments) {
    if (comment.parentId) threads.get(comment.parentId)?.replies.push(comment);
  }
  return [...threads.values()];
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; comments: ArtifactComment[] }
  | { status: 'failed'; error: Error };

const states = new Map<string, LoadState>();
const listeners = new Map<string, Set<() => void>>();
const IDLE: LoadState = { status: 'idle' };

function readState(artifactId: string): LoadState {
  return states.get(artifactId) ?? IDLE;
}

function writeState(artifactId: string, next: LoadState): void {
  states.set(artifactId, next);
  listeners.get(artifactId)?.forEach((listener) => listener());
}

function subscribe(artifactId: string, listener: () => void): () => void {
  const set = listeners.get(artifactId) ?? new Set();
  set.add(listener);
  listeners.set(artifactId, set);
  return () => set.delete(listener);
}

function currentComments(artifactId: string): ArtifactComment[] {
  const state = readState(artifactId);
  return state.status === 'ready' ? state.comments : [];
}

interface PendingRead {
  upserted: Map<string, ArtifactComment>;
  removed: Set<string>;
}

const pendingReads = new Map<string, PendingRead>();

function recordUpsert(artifactId: string, comment: ArtifactComment): void {
  const pending = pendingReads.get(artifactId);
  if (!pending) return;
  pending.removed.delete(comment.id);
  pending.upserted.set(comment.id, comment);
}

function recordRemoval(artifactId: string, id: string): void {
  const pending = pendingReads.get(artifactId);
  if (!pending) return;
  pending.upserted.delete(id);
  pending.removed.add(id);
}

function reconcileSnapshot(
  snapshot: readonly ArtifactComment[],
  pending: PendingRead,
): ArtifactComment[] {
  const merged = snapshot
    .filter((entry) => !pending.removed.has(entry.id))
    .filter((entry) => !entry.parentId || !pending.removed.has(entry.parentId))
    .map((entry) => pending.upserted.get(entry.id) ?? entry);
  const known = new Set(merged.map((entry) => entry.id));
  for (const [id, entry] of pending.upserted) if (!known.has(id)) merged.push(entry);
  return merged;
}

export async function loadArtifactComments(artifactId: string): Promise<void> {
  if (!canCommentOn(artifactId) || pendingReads.has(artifactId)) return;
  const pending: PendingRead = { upserted: new Map(), removed: new Set() };
  pendingReads.set(artifactId, pending);
  if (readState(artifactId).status !== 'ready') writeState(artifactId, { status: 'loading' });
  try {
    const response = await fetch(artifactCommentsPath(artifactId), { credentials: 'include' });
    if (!response.ok) throw await readError(response, 'Comments could not be loaded');
    const body = (await response.json()) as Partial<ArtifactCommentListResponse>;
    if (pendingReads.get(artifactId) !== pending) return;
    pendingReads.delete(artifactId);
    writeState(artifactId, {
      status: 'ready',
      comments: reconcileSnapshot(Array.isArray(body.comments) ? body.comments : [], pending),
    });
  } catch (error) {
    if (pendingReads.get(artifactId) !== pending) return;
    pendingReads.delete(artifactId);
    if (readState(artifactId).status === 'ready') {
      if (pending.upserted.size > 0 || pending.removed.size > 0)
        void loadArtifactComments(artifactId);
      return;
    }
    writeState(artifactId, {
      status: 'failed',
      error: error instanceof Error ? error : new Error('Comments could not be loaded'),
    });
  }
}

export function resetArtifactCommentsCache(): void {
  states.clear();
  pendingReads.clear();
}

async function mutate(path: string, init: RequestInit, fallback: string): Promise<Response> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: await addCsrfHeaders(init.body ? { 'Content-Type': 'application/json' } : {}),
  });
  if (!response.ok) throw await readError(response, fallback);
  return response;
}

export function useArtifactComments(artifactId: string) {
  const state = useSyncExternalStore(
    useCallback((listener) => subscribe(artifactId, listener), [artifactId]),
    () => readState(artifactId),
    () => IDLE,
  );

  const upsert = (comment: ArtifactComment) => {
    recordUpsert(artifactId, comment);
    const comments = currentComments(artifactId);
    writeState(artifactId, {
      status: 'ready',
      comments: comments.some((entry) => entry.id === comment.id)
        ? comments.map((entry) => (entry.id === comment.id ? comment : entry))
        : [...comments, comment],
    });
  };

  const create = async (
    input: Pick<ArtifactCommentCreateRequest, 'body' | 'anchor'> & { parentId?: string },
  ): Promise<ArtifactComment> => {
    const response = await mutate(
      artifactCommentsPath(artifactId),
      { method: 'POST', body: JSON.stringify(input) },
      'The comment was not saved',
    );
    const comment = ((await response.json()) as ArtifactCommentResponse).comment;
    upsert(comment);
    return comment;
  };

  const update = async (input: { id: string } & ArtifactCommentUpdateRequest) => {
    const { id, ...change } = input;
    const response = await mutate(
      artifactCommentPath(artifactId, id),
      { method: 'PATCH', body: JSON.stringify(change) },
      'The comment was not changed',
    );
    upsert(((await response.json()) as ArtifactCommentResponse).comment);
  };

  const remove = async (id: string) => {
    await mutate(
      artifactCommentPath(artifactId, id),
      { method: 'DELETE' },
      'The comment was not deleted',
    );
    recordRemoval(artifactId, id);
    writeState(artifactId, {
      status: 'ready',
      comments: currentComments(artifactId).filter(
        (comment) => comment.id !== id && comment.parentId !== id,
      ),
    });
  };

  return {
    state,
    comments: state.status === 'ready' ? state.comments : [],
    load: () => loadArtifactComments(artifactId),
    create,
    update,
    remove,
  };
}
