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
import type { Project as UnifiedProject } from '@agiworkforce/unified-chat';
import { create } from 'zustand';
import { resetProjectMetaStore } from './project-meta-store';

// Explicit type annotation prevents TS4023 "cannot be named" errors when
// the internal ProjectState from the package is not publicly exported.
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
}

export const useManagedCloudProjectSessionStore = create<ManagedCloudProjectSessionState>(() => ({
  accountId: null,
  status: 'idle',
  error: null,
}));

interface HydrateManagedCloudProjectStoreInput {
  accountId: string;
  listProjects: () => Promise<UnifiedProject[]>;
  force?: boolean;
}

let hydrationGeneration = 0;
let inFlightHydration: { accountId: string; promise: Promise<void> } | null = null;

function clearProjectViewModel(): void {
  useChatProjectStore.setState({ projects: [], activeProjectId: null });
}

/**
 * Replace the in-memory project view model with one account's canonical Cloud
 * rows. Starting a different account clears prior rows synchronously, and the
 * generation check prevents a late response from restoring them.
 */
export function hydrateManagedCloudProjectStore({
  accountId,
  listProjects,
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
      const projects = await listProjects();
      const current = useManagedCloudProjectSessionStore.getState();
      if (generation !== hydrationGeneration || current.accountId !== normalizedAccountId) return;

      // Empty is authoritative. Retaining the previous cache here would expose
      // another account's project names after sign-out/account switch.
      useChatProjectStore.setState({ projects: [...projects], activeProjectId: null });
      useManagedCloudProjectSessionStore.setState({
        accountId: normalizedAccountId,
        status: 'ready',
        error: null,
      });
    } catch (error) {
      const current = useManagedCloudProjectSessionStore.getState();
      if (generation !== hydrationGeneration || current.accountId !== normalizedAccountId) return;

      clearProjectViewModel();
      useManagedCloudProjectSessionStore.setState({
        accountId: normalizedAccountId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to load projects',
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

/** Clear all account-owned project metadata from the Web process. */
export function resetManagedCloudProjectStore(): void {
  hydrationGeneration += 1;
  inFlightHydration = null;
  clearProjectViewModel();
  resetProjectMetaStore();
  useManagedCloudProjectSessionStore.setState({
    accountId: null,
    status: 'signed-out',
    error: null,
  });
}

/** Fail-closed selector for callers that know the current Clerk account id. */
export function getManagedCloudProjectsForAccount(
  accountId: string | null | undefined,
): UnifiedProject[] {
  const session = useManagedCloudProjectSessionStore.getState();
  if (!accountId || session.accountId !== accountId || session.status !== 'ready') return [];
  return useChatProjectStore.getState().projects;
}

/**
 * Static accessor for use outside React components (e.g., in service functions).
 * Returns the instructions for the currently active project.
 */
export function getActiveProjectInstructions(accountId: string): string {
  const session = useManagedCloudProjectSessionStore.getState();
  if (session.status !== 'ready' || session.accountId !== accountId) return '';
  return useChatProjectStore.getState().getActiveProjectInstructions();
}
