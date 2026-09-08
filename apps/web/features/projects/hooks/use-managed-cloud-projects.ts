'use client';

import { useCallback, useEffect } from 'react';
import { useSession } from '@/lib/identity/client';
import {
  hydrateManagedCloudProjectStore,
  loadMoreManagedCloudProjects,
  resetManagedCloudProjectStore,
  useManagedCloudProjectSessionStore,
  useProjectStore,
  type ListManagedCloudProjectsPage,
  type ManagedCloudProjectSessionStatus,
} from '../stores/project-store';
import { webManagedCloudProjects } from '../services/managed-cloud-projects';

/**
 * One page per request. The route caps limit at 100 and the list used to ask
 * for exactly that once, so an account past a hundred projects simply never saw
 * the rest. A shorter page keeps the first paint quick and makes the rest
 * reachable through the same control the sidebar recents use.
 */
export const MANAGED_CLOUD_PROJECTS_PAGE_SIZE = 50;

export interface ManagedCloudProjectsSession {
  accountId: string | null;
  projects: ReturnType<typeof useProjectStore.getState>['projects'];
  status: ManagedCloudProjectSessionStatus;
  error: string | null;
  isReady: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

const listPage: ListManagedCloudProjectsPage = ({ limit, offset }) =>
  webManagedCloudProjects.listProjects({ limit, offset });

export function useManagedCloudProjects(): ManagedCloudProjectsSession {
  const { isLoaded, isSignedIn, userId } = useSession();
  const projects = useProjectStore((state) => state.projects);
  const session = useManagedCloudProjectSessionStore();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      resetManagedCloudProjectStore();
      return;
    }

    void hydrateManagedCloudProjectStore({
      accountId: userId,
      listProjects: listPage,
      pageSize: MANAGED_CLOUD_PROJECTS_PAGE_SIZE,
    });
  }, [isLoaded, isSignedIn, userId]);

  const retry = useCallback(() => {
    if (!isSignedIn || !userId) return;
    void hydrateManagedCloudProjectStore({
      accountId: userId,
      listProjects: listPage,
      pageSize: MANAGED_CLOUD_PROJECTS_PAGE_SIZE,
      force: true,
    });
  }, [isSignedIn, userId]);

  const loadMore = useCallback(() => {
    if (!isSignedIn || !userId) return;
    void loadMoreManagedCloudProjects({
      accountId: userId,
      listProjects: listPage,
      pageSize: MANAGED_CLOUD_PROJECTS_PAGE_SIZE,
    });
  }, [isSignedIn, userId]);

  const scopeMatches = Boolean(userId) && session.accountId === userId;
  const status: ManagedCloudProjectSessionStatus = !isLoaded
    ? 'loading'
    : !isSignedIn || !userId
      ? 'signed-out'
      : scopeMatches
        ? session.status
        : 'loading';
  const isReady = status === 'ready' && scopeMatches;

  return {
    accountId: isSignedIn && userId ? userId : null,
    projects: isReady ? projects : [],
    status,
    error: scopeMatches ? session.error : null,
    isReady,
    hasMore: isReady && session.hasMore,
    isLoadingMore: scopeMatches && session.isLoadingMore,
    loadMore,
    retry,
  };
}
