'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelCatalogueEntry, ModelCatalogueResponse } from '@/app/api/models/catalogue/route';

const MODEL_CATALOGUE_ENDPOINT = '/api/models/catalogue';

export interface ModelCatalogueDeveloper {
  key: string;
  label: string;
  admittedCount: number;
  totalCount: number;
}

export type ModelCatalogueStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ModelCatalogueState {
  status: ModelCatalogueStatus;
  entries: readonly ModelCatalogueEntry[];
  developers: readonly ModelCatalogueDeveloper[];
  count: number;
  planLabel: string;
  retry: () => void;
}

interface CatalogueData {
  status: ModelCatalogueStatus;
  entries: readonly ModelCatalogueEntry[];
  developers: readonly ModelCatalogueDeveloper[];
  count: number;
  planLabel: string;
}

const EMPTY_DATA: CatalogueData = {
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
  const [data, setData] = useState<CatalogueData>(EMPTY_DATA);
  const [attempt, setAttempt] = useState(0);
  const loadedRef = useRef(false);

  const retry = useCallback(() => {
    if (loadedRef.current) return;
    setAttempt((previous) => previous + 1);
  }, []);

  useEffect(() => {
    if (!enabled || loadedRef.current) return;
    const controller = new AbortController();
    setData((previous) => ({ ...previous, status: 'loading' }));
    fetch(MODEL_CATALOGUE_ENDPOINT, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return (await response.json()) as ModelCatalogueResponse;
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        loadedRef.current = true;
        setData({
          status: 'ready',
          entries: body.models,
          developers: groupDevelopers(body.models),
          count: body.count,
          planLabel: body.planLabel,
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setData({ ...EMPTY_DATA, status: 'error' });
      });
    return () => controller.abort();
  }, [enabled, attempt]);

  return { ...data, retry };
}
