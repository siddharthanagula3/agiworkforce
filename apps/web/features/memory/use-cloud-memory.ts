'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { MemoryEditorDataAdapter } from '@agiworkforce/unified-chat';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  observeWorkspaceOwner,
  subscribeWorkspaceAdmission,
  workspaceOwnerIsCurrent,
} from '@/features/workspaces/lib/workspace-admission';
import {
  cloudMemoryScopeKey,
  createCloudMemoryController,
  UNAVAILABLE_MEMORY,
  type CloudMemoryController,
} from './cloud-memory-controller';

let cached: CloudMemoryController | null = null;
const cacheListeners = new Set<() => void>();
const readCache = () => cached;
const readServerCache = () => null;
const subscribeCache = (listener: () => void) => {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
};
function publishCache(next: CloudMemoryController | null) {
  if (cached === next) return;
  const previous = cached;
  cached = next;
  previous?.retire();
  for (const listener of cacheListeners) listener();
}
subscribeWorkspaceAdmission(() => {
  if (cached && !cached.isCurrent()) publishCache(null);
});

export function useCloudMemory(): CloudMemoryController | null {
  const workspace = useAccountWorkspaces();
  const capture = useSessionSnapshot();
  const owner = observeWorkspaceOwner(capture());
  const data = workspace.data;
  const epoch = owner?.epoch;
  const controller = useSyncExternalStore(subscribeCache, readCache, readServerCache);
  useLayoutEffect(() => {
    if (cached && !cached.isCurrent()) publishCache(null);
    if (
      !owner ||
      owner.phase !== 'admitted' ||
      !data ||
      owner.scopeKey !== cloudMemoryScopeKey(data) ||
      !workspaceOwnerIsCurrent(owner, owner.epoch)
    )
      return;
    if (
      !cached ||
      cached.owner !== owner ||
      cached.epoch !== owner.epoch ||
      cached.scopeKey !== owner.scopeKey
    ) {
      publishCache(createCloudMemoryController(owner, data));
    }
  }, [owner, epoch, data]);
  return controller &&
    controller.owner === owner &&
    controller.epoch === epoch &&
    controller.isCurrent()
    ? controller
    : null;
}

const subscribeUnavailable = () => () => {};
const getUnavailable = () => UNAVAILABLE_MEMORY;

export function useCloudMemorySnapshot(controller: CloudMemoryController | null) {
  return useSyncExternalStore(
    controller?.subscribe ?? subscribeUnavailable,
    controller?.getSnapshot ?? getUnavailable,
    getUnavailable,
  );
}

export function useMemoryView(controller: CloudMemoryController | null) {
  const lifetime = useRef<object | null>(null);
  useLayoutEffect(() => {
    const generation = {};
    lifetime.current = generation;
    return () => {
      if (lifetime.current === generation) lifetime.current = null;
    };
  }, [controller]);
  return useCallback(() => {
    const generation = lifetime.current;
    return () =>
      generation !== null && lifetime.current === generation && controller?.isCurrent() === true;
  }, [controller]);
}

export function useCloudMemoryAdapter(controller: CloudMemoryController) {
  const snapshot = useCloudMemorySnapshot(controller);
  const capture = useMemoryView(controller);
  const methods = useMemo(
    () => ({
      scope: 'cloud' as const,
      isCurrent: () => capture()(),
      hydrateFromServer: controller.hydrateFromServer,
      add: (text: string, source?: string) => controller.adapter(capture()).add(text, source),
      update: (id: string, text: string) => controller.adapter(capture()).update(id, text),
      setPinned: (id: string, pinned: boolean) =>
        controller.adapter(capture()).setPinned!(id, pinned),
      remove: (id: string) => controller.adapter(capture()).remove(id),
      clear: () => controller.adapter(capture()).clear(),
    }),
    [controller, capture],
  );
  return {
    ...methods,
    facts: snapshot.facts,
    syncStatus: snapshot.syncStatus,
    mutationBlocked: snapshot.writeBlocked,
  } satisfies MemoryEditorDataAdapter;
}
