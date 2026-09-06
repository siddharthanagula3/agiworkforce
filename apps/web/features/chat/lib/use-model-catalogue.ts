'use client';

import { useEffect, useState } from 'react';
import type { ModelCatalogueEntry, ModelCatalogueResponse } from '@/app/api/models/catalogue/route';

const MODEL_CATALOGUE_ENDPOINT = '/api/models/catalogue';

export interface ModelCatalogueDeveloper {
  key: string;
  label: string;
  admittedCount: number;
  totalCount: number;
}

export interface ModelCatalogueState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  entries: readonly ModelCatalogueEntry[];
  developers: readonly ModelCatalogueDeveloper[];
  count: number;
  planLabel: string;
}

const EMPTY_STATE: ModelCatalogueState = {
  status: 'idle',
  entries: [],
  developers: [],
  count: 0,
  planLabel: '',
};

function groupDevelopers(
  entries: readonly ModelCatalogueEntry[],
): readonly ModelCatalogueDeveloper[] {
  const byDeveloper = new Map<string, ModelCatalogueDeveloper>();
  for (const entry of entries) {
    const current = byDeveloper.get(entry.developer) ?? {
      key: entry.developer,
      label: entry.developerLabel,
      admittedCount: 0,
      totalCount: 0,
    };
    byDeveloper.set(entry.developer, {
      ...current,
      admittedCount: current.admittedCount + (entry.admitted ? 1 : 0),
      totalCount: current.totalCount + 1,
    });
  }
  return [...byDeveloper.values()].sort(
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
          developers: groupDevelopers(body.models),
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
