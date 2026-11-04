'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { MemoryEditorDataAdapter } from '@agiworkforce/unified-chat';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import { observeWorkspaceOwner, subscribeWorkspaceAdmission } from '@/features/workspaces/lib/workspace-admission';
import {
  cloudMemoryScopeKey, createCloudMemoryController, UNAVAILABLE_MEMORY,
  type CloudMemoryController,
} from './cloud-memory-controller';

let cached: CloudMemoryController | null = null;
subscribeWorkspaceAdmission(() => {
  if (cached && !cached.isCurrent()) {
    cached.retire();
    cached = null;
  }
});

export function useCloudMemory(): CloudMemoryController | null {
  const workspace = useAccountWorkspaces();
  const capture = useSessionSnapshot();
  const owner = observeWorkspaceOwner(capture());
  const data = workspace.data;
  if (cached && !cached.isCurrent()) {
    cached.retire();
    cached = null;
  }
  if (!owner || owner.phase !== 'admitted' || !data || owner.scopeKey !== cloudMemoryScopeKey(data)) return null;
  if (!cached || cached.owner !== owner || cached.epoch !== owner.epoch || cached.scopeKey !== owner.scopeKey) {
    cached?.retire();
    cached = createCloudMemoryController(owner, data);
  }
  return cached;
}

const subscribeUnavailable = () => () => {};
const getUnavailable = () => UNAVAILABLE_MEMORY;

export function useCloudMemorySnapshot(controller: CloudMemoryController | null) {
  return useSyncExternalStore(controller?.subscribe ?? subscribeUnavailable,
    controller?.getSnapshot ?? getUnavailable, getUnavailable);
}

export function useMemoryView(controller: CloudMemoryController | null) {
  const lifetime = useRef<object | null>(null);
  useLayoutEffect(() => {
    const generation = {};
    lifetime.current = generation;
    return () => { if (lifetime.current === generation) lifetime.current = null; };
  }, [controller]);
  return useCallback(() => {
    const generation = lifetime.current;
    return () => generation !== null && lifetime.current === generation && controller?.isCurrent() === true;
  }, [controller]);
}

export function useCloudMemoryAdapter(controller: CloudMemoryController) {
  const snapshot = useCloudMemorySnapshot(controller);
  const capture = useMemoryView(controller);
  const methods = useMemo(() => ({
    scope: 'cloud' as const,
    isCurrent: () => capture()(),
    hydrateFromServer: controller.hydrateFromServer,
    add: (text: string, source?: string) => controller.adapter(capture()).add(text, source),
    update: (id: string, text: string) => controller.adapter(capture()).update(id, text),
    setPinned: (id: string, pinned: boolean) => controller.adapter(capture()).setPinned!(id, pinned),
    remove: (id: string) => controller.adapter(capture()).remove(id),
    clear: () => controller.adapter(capture()).clear(),
  }), [controller, capture]);
  return { ...methods, facts: snapshot.facts, syncStatus: snapshot.syncStatus, mutationBlocked: snapshot.writeBlocked } satisfies MemoryEditorDataAdapter;
}
