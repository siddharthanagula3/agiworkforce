'use client';

import { useCallback, useEffect } from 'react';
import { useSession } from '@/lib/identity/client';
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
