/**
 * Project Store · Web managed-cloud view model.
 *
 * The shared Zustand store is deliberately memory-only. This adapter binds it
 * to one authenticated Web account at a time and rejects late responses from
 * a prior account. Web is Cloud-only: browser-local rows are never merged into
 * the managed project list and are never used as an offline fallback.
 *
 * The `Project` type is also re-exported here so web components that import
 * `@features/projects/stores/project-store` continue to compile without
 * changes.
 */

import { useChatProjectStore } from '@agiworkforce/unified-chat';
import { toUserMessageWithStatus } from '@agiworkforce/unified-chat';
import type { Project as UnifiedProject } from '@agiworkforce/unified-chat';
import { create } from 'zustand';
import { resetProjectMetaStore } from './project-meta-store';

export const useProjectStore: typeof useChatProjectStore = useChatProjectStore;
export type { UnifiedProject as Project };

export type ManagedCloudProjectSessionStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'
  | 'signed-out';

interface ManagedCloudProjectSessionState {
  accountId: string | null;
  status: ManagedCloudProjectSessionStatus;
  error: string | null;
  /** A full page came back, so the server may hold more than is loaded. */
  hasMore: boolean;
  isLoadingMore: boolean;
}

export const useManagedCloudProjectSessionStore = create<ManagedCloudProjectSessionState>(() => ({
  accountId: null,
  status: 'idle',
  error: null,
  hasMore: false,
  isLoadingMore: false,
}));

export type ListManagedCloudProjectsPage = (page: {
  limit: number;
  offset: number;
}) => Promise<UnifiedProject[]>;

interface HydrateManagedCloudProjectStoreInput {
  accountId: string;
  listProjects: ListManagedCloudProjectsPage;
  pageSize: number;
  force?: boolean;
}

interface LoadMoreManagedCloudProjectsInput {
  accountId: string;
  listProjects: ListManagedCloudProjectsPage;
  pageSize: number;
}

function mergeById(loaded: UnifiedProject[], incoming: UnifiedProject[]): UnifiedProject[] {
  const seen = new Set(loaded.map((project) => project.id));
  return [...loaded, ...incoming.filter((project) => !seen.has(project.id))];
}

let hydrationGeneration = 0;
let inFlightHydration: { accountId: string; promise: Promise<void> } | null = null;

function clearProjectViewModel(): void {
  useChatProjectStore.setState({ projects: [], activeProjectId: null });
}

export function hydrateManagedCloudProjectStore({
  accountId,
  listProjects,
  pageSize,
  force = false,
}: HydrateManagedCloudProjectStoreInput): Promise<void> {
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId) {
    resetManagedCloudProjectStore();
    return Promise.resolve();
  }

  const session = useManagedCloudProjectSessionStore.getState();
  if (!force && session.accountId === normalizedAccountId && session.status === 'ready') {
    return Promise.resolve();
  }
  if (!force && inFlightHydration?.accountId === normalizedAccountId) {
    return inFlightHydration.promise;
  }

  const generation = ++hydrationGeneration;
  if (session.accountId !== normalizedAccountId) {
    resetProjectMetaStore();
  }
  clearProjectViewModel();
  useManagedCloudProjectSessionStore.setState({
    accountId: normalizedAccountId,
    status: 'loading',
    error: null,
  });

  const promise = (async () => {
    try {
      const projects = await listProjects({ limit: pageSize, offset: 0 });
      const current = useManagedCloudProjectSessionStore.getState();
      if (generation !== hydrationGeneration || current.accountId !== normalizedAccountId) return;

      useChatProjectStore.setState({ projects: [...projects], activeProjectId: null });
      useManagedCloudProjectSessionStore.setState({
        accountId: normalizedAccountId,
        status: 'ready',
        error: null,
        hasMore: projects.length >= pageSize,
        isLoadingMore: false,
      });
    } catch (error) {
      const current = useManagedCloudProjectSessionStore.getState();
      if (generation !== hydrationGeneration || current.accountId !== normalizedAccountId) return;

      clearProjectViewModel();
      useManagedCloudProjectSessionStore.setState({
        accountId: normalizedAccountId,
        status: 'error',
        error: toUserMessageWithStatus(error, 'Failed to load projects'),
        hasMore: false,
        isLoadingMore: false,
      });
    } finally {
      if (
        generation === hydrationGeneration &&
        inFlightHydration?.accountId === normalizedAccountId
      ) {
        inFlightHydration = null;
      }
    }
  })();

  inFlightHydration = { accountId: normalizedAccountId, promise };
  return promise;
}

export function resetManagedCloudProjectStore(): void {
  hydrationGeneration += 1;
  inFlightHydration = null;
  clearProjectViewModel();
  resetProjectMetaStore();
  useManagedCloudProjectSessionStore.setState({
    accountId: null,
    status: 'signed-out',
    error: null,
    hasMore: false,
    isLoadingMore: false,
  });
}

/**
 * W07: the next page starts after the rows still held, not after a count echoed
 * when the last page arrived. Archiving or deleting a loaded project shifts
 * every later row down by one, so resuming at a stale offset would step over
 * exactly as many rows as had been removed and they could never be reached.
 * Merging by id absorbs the overlap a locally created project would otherwise
 * cause.
 */
export async function loadMoreManagedCloudProjects({
  accountId,
  listProjects,
  pageSize,
}: LoadMoreManagedCloudProjectsInput): Promise<void> {
  const session = useManagedCloudProjectSessionStore.getState();
  if (session.accountId !== accountId || session.status !== 'ready') return;
  if (!session.hasMore || session.isLoadingMore) return;

  const generation = hydrationGeneration;
  useManagedCloudProjectSessionStore.setState({ isLoadingMore: true });

  const loaded = useChatProjectStore.getState().projects;
  try {
    const page = await listProjects({ limit: pageSize, offset: loaded.length });
    const current = useManagedCloudProjectSessionStore.getState();
    if (generation !== hydrationGeneration || current.accountId !== accountId) return;

    const merged = mergeById(useChatProjectStore.getState().projects, page);
    useChatProjectStore.setState({ projects: merged });
    useManagedCloudProjectSessionStore.setState({
      hasMore: page.length >= pageSize,
      isLoadingMore: false,
    });
  } catch (error) {
    const current = useManagedCloudProjectSessionStore.getState();
    if (generation !== hydrationGeneration || current.accountId !== accountId) return;
    useManagedCloudProjectSessionStore.setState({
      isLoadingMore: false,
      error: toUserMessageWithStatus(error, 'Failed to load more projects'),
    });
  }
}

export function getManagedCloudProjectsForAccount(
  accountId: string | null | undefined,
): UnifiedProject[] {
  const session = useManagedCloudProjectSessionStore.getState();
  if (!accountId || session.accountId !== accountId || session.status !== 'ready') return [];
  return useChatProjectStore.getState().projects;
}

export function getActiveProjectInstructions(accountId: string): string {
  const session = useManagedCloudProjectSessionStore.getState();
  if (session.status !== 'ready' || session.accountId !== accountId) return '';
  return useChatProjectStore.getState().getActiveProjectInstructions();
}
