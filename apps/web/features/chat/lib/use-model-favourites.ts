'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCsrfToken } from '@/lib/client/csrf';

const PREFERENCES_ENDPOINT = '/api/settings/preferences';
const PREFERENCES_NAMESPACE = 'model-picker';
const FAVOURITES_KEY = 'favouriteModelIds';
const DEVICE_STORAGE_KEY = 'agi-model-picker-favourites';

function readDeviceFavourites(): string[] {
  try {
    const raw = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeDeviceFavourites(modelIds: readonly string[]): void {
  try {
    window.localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(modelIds));
  } catch {
    return;
  }
}

async function persistFavourites(modelIds: readonly string[]): Promise<void> {
  storedFavourites = Promise.resolve(modelIds);
  try {
    const csrf = await getCsrfToken();
    await fetch(PREFERENCES_ENDPOINT, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({
        namespace: PREFERENCES_NAMESPACE,
        value: { [FAVOURITES_KEY]: modelIds },
      }),
    });
  } catch {
    return;
  }
}

export interface ModelFavourites {
  favouriteModelIds: readonly string[];
  toggleFavourite: (modelId: string) => void;
}

let storedFavourites: Promise<readonly string[] | null> | null = null;

function loadStoredFavourites(): Promise<readonly string[] | null> {
  storedFavourites ??= fetch(`${PREFERENCES_ENDPOINT}?namespace=${PREFERENCES_NAMESPACE}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const body = (await response.json()) as { settings?: Record<string, unknown> };
      const stored = body.settings?.[FAVOURITES_KEY];
      return Array.isArray(stored)
        ? stored.filter((id): id is string => typeof id === 'string')
        : null;
    })
    .catch(() => {
      storedFavourites = null;
      return null;
    });
  return storedFavourites;
}

export function useModelFavourites(): ModelFavourites {
  const [favouriteModelIds, setFavouriteModelIds] = useState<readonly string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setFavouriteModelIds(readDeviceFavourites());
    void loadStoredFavourites().then((ids) => {
      if (cancelled || !ids) return;
      setFavouriteModelIds(ids);
      writeDeviceFavourites(ids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFavourite = useCallback((modelId: string) => {
    setFavouriteModelIds((previous) => {
      const next = previous.includes(modelId)
        ? previous.filter((id) => id !== modelId)
        : [...previous, modelId];
      writeDeviceFavourites(next);
      void persistFavourites(next);
      return next;
    });
  }, []);

  return { favouriteModelIds, toggleFavourite };
}
