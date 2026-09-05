'use client';

import { useEffect } from 'react';
import { useSession } from '@/lib/identity/client';
import { logger } from '@shared/lib/logger';

import {
  ArtifactSyncCursorRejectedError,
  pullArtifactCloudChanges,
  pushArtifactCloudChanges,
} from '../services/artifact-cloud-sync';
import { _sharedArtifactStore, useArtifactsStore } from '../stores/artifacts-store';
import {
  clearArtifactSyncCursor,
  readArtifactSyncCursor,
  writeArtifactSyncCursor,
} from '../lib/artifact-sync-cursor-storage';

const SYNC_INTERVAL_MS = 30_000;
const LOCAL_EDIT_PUSH_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

export function useArtifactCloudSync(): void {
  const { getToken, isLoaded, userId } = useSession();
  const applyCloudArtifactDeltas = useArtifactsStore((state) => state.applyCloudArtifactDeltas);
  const collectArtifactPushBatch = useArtifactsStore((state) => state.collectArtifactPushBatch);
  const applyArtifactPushResult = useArtifactsStore((state) => state.applyArtifactPushResult);
  const clearCloudArtifacts = useArtifactsStore((state) => state.clearCloudArtifacts);
  const setCloudSyncStatus = useArtifactsStore((state) => state.setCloudSyncStatus);

  useEffect(() => {
    clearCloudArtifacts();
    if (!isLoaded || !userId) return;

    const activeUserId = userId;
    let stopped = false;
    let inFlight = false;
    let cursor = readArtifactSyncCursor(activeUserId);
    let failureCount = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abortController = new AbortController();

    // A hidden tab does not poll. The loop used to reschedule unconditionally,
    // so one forgotten background tab kept a 30s request going indefinitely and
    // the database never reached its idle-suspend window - an endpoint held
    // awake around the clock bills roughly 180 CU-hours a month at the 0.25 CU
    // floor, for a tab nobody is looking at. Returning to the tab syncs at
    // once via handleVisibilityChange, so nothing is stale on screen.
    const schedule = (delayMs: number) => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        timer = undefined;
        return;
      }
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
        writeArtifactSyncCursor(activeUserId, cursor);

        const pending = collectArtifactPushBatch();
        const pushResult = await pushArtifactCloudChanges({
          artifacts: pending,
          getToken,
          signal: abortController.signal,
        });
        if (stopped) return;
        if (pushResult) applyArtifactPushResult(pushResult);

        failureCount = 0;
        setCloudSyncStatus('synced');
        schedule(SYNC_INTERVAL_MS);
      } catch (error) {
        if (stopped || abortController.signal.aborted) return;
        if (error instanceof ArtifactSyncCursorRejectedError) {
          clearArtifactSyncCursor(activeUserId);
          cursor = readArtifactSyncCursor(activeUserId);
        }
        failureCount += 1;
        const message = error instanceof Error ? error.message : 'Artifact sync failed';
        logger.warn('[artifact-cloud-sync] sync failed; retry scheduled', error);
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

    const unsubscribeFromLocalArtifacts = _sharedArtifactStore.subscribe(() => {
      if (stopped || inFlight) return;
      if (collectArtifactPushBatch().length === 0) return;
      schedule(LOCAL_EDIT_PUSH_DELAY_MS);
    });

    window.addEventListener('online', requestImmediateSync);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    void syncNow();

    return () => {
      stopped = true;
      abortController.abort();
      if (timer) clearTimeout(timer);
      unsubscribeFromLocalArtifacts();
      window.removeEventListener('online', requestImmediateSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearCloudArtifacts();
    };
  }, [
    applyArtifactPushResult,
    applyCloudArtifactDeltas,
    clearCloudArtifacts,
    collectArtifactPushBatch,
    getToken,
    isLoaded,
    setCloudSyncStatus,
    userId,
  ]);
}
