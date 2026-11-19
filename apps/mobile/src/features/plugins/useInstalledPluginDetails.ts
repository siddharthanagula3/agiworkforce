import { useEffect, useMemo, useRef, useState } from 'react';
import type { PluginDirectoryEntryWire } from '@agiworkforce/cloud-contracts';

import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { PLUGIN_DETAIL_CONCURRENCY, type InstalledPluginDetail } from './pluginsModel';
import { fetchPlugin } from './service';

export interface InstalledPluginDetails {
  details: ReadonlyMap<string, InstalledPluginDetail>;
  settled: boolean;
}

export function useInstalledPluginDetails(
  ids: readonly string[],
  known: ReadonlyMap<string, PluginDirectoryEntryWire>,
  attempt: number,
): InstalledPluginDetails {
  const { ownerId } = useCloudFeatureAccess();
  const [fetched, setFetched] = useState<ReadonlyMap<string, InstalledPluginDetail>>(new Map());
  const requested = useRef(new Set<string>());
  const failed = useRef(new Set<string>());
  const lastAttempt = useRef(attempt);
  const idsKey = ids.join('\n');
  const idList = useMemo(() => (idsKey ? idsKey.split('\n') : []), [idsKey]);

  useEffect(() => {
    if (lastAttempt.current !== attempt) {
      lastAttempt.current = attempt;
      failed.current.forEach((id) => requested.current.delete(id));
      failed.current.clear();
    }
    const pending = idList.filter((id) => !known.has(id) && !requested.current.has(id));
    if (pending.length === 0) return;
    const account = captureCloudAccountEpoch();
    if (!account) return;
    const controller = new AbortController();
    const unsettled = new Set(pending);
    const requestedIds = requested.current;
    pending.forEach((id) => requestedIds.add(id));
    const settle = (id: string, detail: InstalledPluginDetail) => {
      if (controller.signal.aborted) return;
      unsettled.delete(id);
      if (!isCloudAccountEpochCurrent(account)) {
        requestedIds.delete(id);
        return;
      }
      if (detail.status === 'failed') failed.current.add(id);
      setFetched((current) => new Map(current).set(id, detail));
    };
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length && !controller.signal.aborted) {
        const id = pending[cursor++]!;
        try {
          settle(id, { status: 'loaded', entry: await fetchPlugin(id, controller.signal) });
        } catch {
          settle(id, { status: 'failed' });
        }
      }
    };
    for (let slot = 0; slot < Math.min(PLUGIN_DETAIL_CONCURRENCY, pending.length); slot += 1) {
      void worker();
    }
    return () => {
      controller.abort();
      unsettled.forEach((id) => requestedIds.delete(id));
    };
  }, [attempt, idList, known, ownerId]);

  const details = useMemo(() => {
    const merged = new Map<string, InstalledPluginDetail>(fetched);
    for (const id of idList) {
      const entry = known.get(id);
      if (entry) merged.set(id, { status: 'loaded', entry });
    }
    return merged;
  }, [fetched, idList, known]);

  return { details, settled: idList.every((id) => details.has(id)) };
}
