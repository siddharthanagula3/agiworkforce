'use client';

import { useCallback, useEffect, useState } from 'react';
import { FREE_QUOTA_CATALOGUE_PATH } from '@agiworkforce/cloud-contracts';
import type { FreeQuotaCatalogue } from '@/features/models/lib/free-quota-types';

const EXPERIENTIAL_FREE_CATALOGUE_PATH = '/api/models/experiential-free';
const NOT_OFFERED_STATUSES: ReadonlySet<number> = new Set([401, 403, 404]);

export type FreeModelSourceStatus = 'loading' | 'ready' | 'hidden' | 'error';

export interface FreeModelSource {
  status: FreeModelSourceStatus;
  catalogue: FreeQuotaCatalogue | null;
  retry: () => void;
}

export interface FreeModelSources {
  quota: FreeModelSource;
  experiential: FreeModelSource;
}

type SourceState = Omit<FreeModelSource, 'retry'>;

const LOADING: SourceState = { status: 'loading', catalogue: null };
const HIDDEN: SourceState = { status: 'hidden', catalogue: null };

async function readCatalogue(endpoint: string, signal: AbortSignal): Promise<SourceState> {
  const response = await fetch(endpoint, { signal, cache: 'no-store' });
  if (NOT_OFFERED_STATUSES.has(response.status)) return HIDDEN;
  if (!response.ok) throw new Error(`Free models could not be loaded (${response.status})`);
  const catalogue = (await response.json()) as FreeQuotaCatalogue | null;
  return catalogue ? { status: 'ready', catalogue } : HIDDEN;
}

function useFreeModelSource(endpoint: string, enabled: boolean): FreeModelSource {
  const [state, setState] = useState<SourceState>(LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState((current) =>
      current.status === 'ready' ? current : { status: 'loading', catalogue: current.catalogue },
    );
    readCatalogue(endpoint, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setState(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState((current) => ({ status: 'error', catalogue: current.catalogue }));
        }
      });
    return () => controller.abort();
  }, [attempt, enabled, endpoint]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return { ...state, retry };
}

export function useFreeModelSources(enabled: boolean): FreeModelSources {
  return {
    quota: useFreeModelSource(FREE_QUOTA_CATALOGUE_PATH, enabled),
    experiential: useFreeModelSource(EXPERIENTIAL_FREE_CATALOGUE_PATH, enabled),
  };
}
