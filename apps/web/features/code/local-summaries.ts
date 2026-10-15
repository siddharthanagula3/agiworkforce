'use client';

import { useSyncExternalStore } from 'react';

const running = new Set<string>();
const listeners = new Set<() => void>();

function key(rootId: string, threadId: string): string {
  return `${rootId}\u0000${threadId}`;
}

function changed(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Run one summary of a local session, marking the session as being summarized
 * for as long as it takes. Whichever control started it, the panel reads the
 * mark to show that it is working and to offer a way to stop it.
 */
export async function runThreadSummary<T>(
  rootId: string,
  threadId: string,
  summarize: () => Promise<T>,
): Promise<T> {
  const id = key(rootId, threadId);
  running.add(id);
  changed();
  try {
    return await summarize();
  } finally {
    running.delete(id);
    changed();
  }
}

export function useThreadSummarizing(rootId: string, threadId: string): boolean {
  const id = key(rootId, threadId);
  return useSyncExternalStore(
    subscribe,
    () => running.has(id),
    () => false,
  );
}
