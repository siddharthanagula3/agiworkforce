'use client';

import { useEffect, useState } from 'react';
import type { ModelCatalogueEntry, ModelCatalogueResponse } from '@/app/api/models/catalogue/route';

const MODEL_CATALOGUE_ENDPOINT = '/api/models/catalogue';

export interface ModelCatalogueProvider {
  key: string;
  admittedCount: number;
  totalCount: number;
}

export interface ModelCatalogueState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  entries: readonly ModelCatalogueEntry[];
  providers: readonly ModelCatalogueProvider[];
  count: number;
  planLabel: string;
}

const EMPTY_STATE: ModelCatalogueState = {
  status: 'idle',
  entries: [],
  providers: [],
  count: 0,
  planLabel: '',
};

function groupProviders(
  entries: readonly ModelCatalogueEntry[],
): readonly ModelCatalogueProvider[] {
  const byProvider = new Map<string, ModelCatalogueProvider>();
  for (const entry of entries) {
    const current = byProvider.get(entry.provider) ?? {
      key: entry.provider,
      admittedCount: 0,
      totalCount: 0,
    };
    byProvider.set(entry.provider, {
      key: entry.provider,
      admittedCount: current.admittedCount + (entry.admitted ? 1 : 0),
      totalCount: current.totalCount + 1,
    });
  }
  return [...byProvider.values()].sort(
    (left, right) =>
      right.admittedCount - left.admittedCount ||
      right.totalCount - left.totalCount ||
      left.key.localeCompare(right.key),
  );
}

export function useModelCatalogue(enabled: boolean): ModelCatalogueState {
  const [state, setState] = useState<ModelCatalogueState>(EMPTY_STATE);

  useEffect(() => {
    if (!enabled || state.status === 'ready') return;
    const controller = new AbortController();
    setState((previous) => ({ ...previous, status: 'loading' }));
    fetch(MODEL_CATALOGUE_ENDPOINT, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return (await response.json()) as ModelCatalogueResponse;
      })
      .then((body) => {
        setState({
          status: 'ready',
          entries: body.models,
          providers: groupProviders(body.models),
          count: body.count,
          planLabel: body.planLabel,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ ...EMPTY_STATE, status: 'error' });
        void error;
      });
    return () => controller.abort();
  }, [enabled, state.status]);

  return state;
}
