import { useCallback, useState, useSyncExternalStore } from 'react';

const DRAFT_LIMIT = 100;

const drafts = new Map<string, unknown>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readAnswerDraft<T>(key: string): T | undefined {
  return drafts.get(key) as T | undefined;
}

export function writeAnswerDraft<T>(key: string, value: T | undefined): void {
  drafts.delete(key);
  if (value !== undefined) {
    drafts.set(key, value);
    if (drafts.size > DRAFT_LIMIT) {
      const oldest = drafts.keys().next().value;
      if (oldest !== undefined) drafts.delete(oldest);
    }
  }
  notify();
}

export function moveAnswerDraft(from: string, to: string): void {
  if (from === to || !drafts.has(from) || drafts.has(to)) return;
  const value = drafts.get(from);
  drafts.delete(from);
  drafts.set(to, value);
  notify();
}

export function hasAnswerDraftFor(messageId: string): boolean {
  const prefix = `${messageId}\u0000`;
  for (const key of drafts.keys()) if (key.startsWith(prefix)) return true;
  return false;
}

export function clearAnswerDrafts(): void {
  if (drafts.size === 0) return;
  drafts.clear();
  notify();
}

export type DraftUpdate<T> = T | ((current: T) => T);

/**
 * Chat rows are recycled by the list, so state a person typed into an answer
 * lives here under a key naming the message and the block, not in the row.
 * Without a key the state is the component's own.
 */
export function useAnswerDraft<T>(
  key: string | null,
  initial: T,
): [T, (update: DraftUpdate<T>) => void, () => void] {
  const [local, setLocal] = useState<T>(initial);
  const stored = useSyncExternalStore(
    subscribe,
    () => (key === null ? undefined : drafts.get(key)),
    () => undefined,
  ) as T | undefined;
  const value = key === null ? local : (stored ?? initial);

  const update = useCallback(
    (next: DraftUpdate<T>) => {
      if (key === null) {
        setLocal(next);
        return;
      }
      const current = (drafts.has(key) ? drafts.get(key) : initial) as T;
      writeAnswerDraft(
        key,
        typeof next === 'function' ? (next as (current: T) => T)(current) : next,
      );
    },
    [key, initial],
  );

  const reset = useCallback(() => {
    if (key === null) setLocal(initial);
    else writeAnswerDraft(key, undefined);
  }, [key, initial]);

  return [value, update, reset];
}
