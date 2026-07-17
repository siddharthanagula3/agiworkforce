'use client';

import { useCallback, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import {
  hydrateManagedCloudProjectStore,
  resetManagedCloudProjectStore,
  useManagedCloudProjectSessionStore,
  useProjectStore,
  type ManagedCloudProjectSessionStatus,
} from '../stores/project-store';
import { webManagedCloudProjects } from '../services/managed-cloud-projects';

export interface ManagedCloudProjectsSession {
  accountId: string | null;
  projects: ReturnType<typeof useProjectStore.getState>['projects'];
  status: ManagedCloudProjectSessionStatus;
  error: string | null;
  isReady: boolean;
  retry: () => void;
}

/**
 * Bind the shared in-memory project view model to the current Clerk account.
 * The returned project list is empty until the fetched scope matches the
 * current account, so a render between auth change and effect execution cannot
 * flash the previous account's project metadata.
 */
export function useManagedCloudProjects(): ManagedCloudProjectsSession {
  const { isLoaded, isSignedIn, userId } = useAuth();
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
      listProjects: () => webManagedCloudProjects.listProjects({ limit: 100 }),
    });
  }, [isLoaded, isSignedIn, userId]);

  const retry = useCallback(() => {
    if (!isSignedIn || !userId) return;
    void hydrateManagedCloudProjectStore({
      accountId: userId,
      listProjects: () => webManagedCloudProjects.listProjects({ limit: 100 }),
      force: true,
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
    retry,
  };
}
