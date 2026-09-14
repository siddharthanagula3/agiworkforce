'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  localModelBelowMinimumReason,
  partitionLocalModels,
  type LocalModel,
  type LocalModelSnapshot,
} from '@agiworkforce/local-runtime-contract';
import { useDesktopHost } from '../lib/host';
import { listLocalModels, readLocalModelSnapshot } from '../lib/runtime-client';

export interface LocalModelsState {
  available: boolean;
  granted: boolean;
  models: LocalModel[];
  hiddenReasons: string[];
  servers: LocalModelSnapshot['servers'];
  error: string | null;
  grant: () => Promise<void>;
  refresh: () => Promise<void>;
}

const GRANT_REFUSED = 'Local models stay off until you allow them.';

/**
 * What the page knows about models on this machine.
 *
 * Status is read without a grant so the picker can offer the section at all;
 * the model names themselves are behind `local.inference`, so nothing lists
 * what the user has installed until they ask for it.
 */
export function useLocalModels(active: boolean): LocalModelsState {
  const host = useDesktopHost();
  const [snapshot, setSnapshot] = useState<LocalModelSnapshot | null>(null);
  const [models, setModels] = useState<LocalModel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!host) return;
    try {
      const next = await readLocalModelSnapshot();
      setSnapshot(next);
      setError(null);
      if (!next.granted) {
        setModels([]);
        return;
      }
      setModels(await listLocalModels());
    } catch {
      setSnapshot(null);
      setModels([]);
    }
  }, [host]);

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, refresh]);

  const grant = useCallback(async () => {
    try {
      setModels(await listLocalModels());
      setSnapshot(await readLocalModelSnapshot());
      setError(null);
    } catch {
      setError(GRANT_REFUSED);
    }
  }, []);

  const { usable, hidden } = useMemo(() => partitionLocalModels(models), [models]);
  const hiddenReasons = useMemo(() => hidden.map(localModelBelowMinimumReason), [hidden]);

  const servers = snapshot?.servers ?? [];
  return {
    available: host !== null && servers.some((server) => server.reachable),
    granted: snapshot?.granted === true,
    models: usable,
    hiddenReasons,
    servers,
    error,
    grant,
    refresh,
  };
}
