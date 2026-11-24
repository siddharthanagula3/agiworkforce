'use client';

import { useSyncExternalStore } from 'react';
import type { CloudCodeAgentTurn } from '@agiworkforce/cloud-contracts';

const emptyTurns: ReadonlyMap<string, string> = new Map();
let turns = emptyTurns;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(next: ReadonlyMap<string, string>) {
  turns = next;
  for (const listener of listeners) listener();
}

export function useCloudCodeBackgroundTurns(): ReadonlyMap<string, string> {
  return useSyncExternalStore(
    subscribe,
    () => turns,
    () => emptyTurns,
  );
}

export async function runCloudCodeBackgroundTurn(
  sessionId: string,
  send: () => Promise<CloudCodeAgentTurn>,
): Promise<CloudCodeAgentTurn> {
  update(new Map(turns).set(sessionId, new Date().toISOString()));
  try {
    return await send();
  } finally {
    const next = new Map(turns);
    next.delete(sessionId);
    update(next);
  }
}
