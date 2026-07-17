'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { logger } from '@shared/lib/logger';

import { pullArtifactCloudChanges } from '../services/artifact-cloud-sync';
import { useArtifactsStore } from '../stores/artifacts-store';

const SYNC_INTERVAL_MS = 30_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

/**
 * Keep the Web artifact overlay current with first-class Managed Cloud
 * artifacts created or edited on Desktop. The overlay is intentionally
 * memory-only and starts from cursor zero for each authenticated mount, so a
 * reload or account switch can never retain a cursor without its matching
 * per-user data snapshot.
 */
export function useArtifactCloudSync(): void {
  const { getToken, isLoaded, userId } = useAuth();
  const applyCloudArtifactDeltas = useArtifactsStore((state) => state.applyCloudArtifactDeltas);
  const clearCloudArtifacts = useArtifactsStore((state) => state.clearCloudArtifacts);
  const setCloudSyncStatus = useArtifactsStore((state) => state.setCloudSyncStatus);

  useEffect(() => {
    clearCloudArtifacts();
    if (!isLoaded || !userId) return;

    let stopped = false;
    let inFlight = false;
    let cursor = '0';
    let failureCount = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abortController = new AbortController();

    const schedule = (delayMs: number) => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void syncNow(), delayMs);
    };

    const syncNow = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      setCloudSyncStatus('syncing');
      try {
        cursor = await pullArtifactCloudChanges({
          cursor,
          getToken,
          applyDeltas: applyCloudArtifactDeltas,
          signal: abortController.signal,
        });
        if (stopped) return;
        failureCount = 0;
        setCloudSyncStatus('synced');
        schedule(SYNC_INTERVAL_MS);
      } catch (error) {
        if (stopped || abortController.signal.aborted) return;
        failureCount += 1;
        const message = error instanceof Error ? error.message : 'Artifact sync failed';
        logger.warn('[artifact-cloud-sync] pull failed; retry scheduled', error);
        setCloudSyncStatus('error', message);
        schedule(Math.min(SYNC_INTERVAL_MS * 2 ** (failureCount - 1), MAX_RETRY_DELAY_MS));
      } finally {
        inFlight = false;
      }
    };

    const requestImmediateSync = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      void syncNow();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestImmediateSync();
    };

    window.addEventListener('online', requestImmediateSync);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    void syncNow();

    return () => {
      stopped = true;
      abortController.abort();
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', requestImmediateSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearCloudArtifacts();
    };
  }, [
    applyCloudArtifactDeltas,
    clearCloudArtifacts,
    getToken,
    isLoaded,
    setCloudSyncStatus,
    userId,
  ]);
}
