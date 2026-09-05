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

export function useModelFavourites(): ModelFavourites {
  const [favouriteModelIds, setFavouriteModelIds] = useState<readonly string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setFavouriteModelIds(readDeviceFavourites());
    fetch(`${PREFERENCES_ENDPOINT}?namespace=${PREFERENCES_NAMESPACE}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { settings?: Record<string, unknown> };
      })
      .then((body) => {
        const stored = body?.settings?.[FAVOURITES_KEY];
        if (!Array.isArray(stored)) return;
        const ids = stored.filter((id): id is string => typeof id === 'string');
        setFavouriteModelIds(ids);
        writeDeviceFavourites(ids);
      })
      .catch(() => undefined);
    return () => controller.abort();
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
