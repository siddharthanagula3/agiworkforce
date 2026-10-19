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

export async function loadArtifactComments(artifactId: string): Promise<void> {
  if (!canCommentOn(artifactId) || readState(artifactId).status === 'loading') return;
  writeState(artifactId, { status: 'loading' });
  try {
    const response = await fetch(artifactCommentsPath(artifactId), { credentials: 'include' });
    if (!response.ok) throw await readError(response, 'Comments could not be loaded');
    const body = (await response.json()) as Partial<ArtifactCommentListResponse>;
    writeState(artifactId, {
      status: 'ready',
      comments: Array.isArray(body.comments) ? body.comments : [],
    });
  } catch (error) {
    writeState(artifactId, {
      status: 'failed',
      error: error instanceof Error ? error : new Error('Comments could not be loaded'),
    });
  }
}

export function resetArtifactCommentsCache(): void {
  states.clear();
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
