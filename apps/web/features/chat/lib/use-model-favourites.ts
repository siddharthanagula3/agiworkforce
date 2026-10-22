'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FAVOURITE_MODEL_IDS_KEY, MODEL_PICKER_PREFERENCES_NAMESPACE } from '@agiworkforce/types';
import { getCsrfToken } from '@/lib/client/csrf';

const PREFERENCES_ENDPOINT = '/api/settings/preferences';
const DEVICE_STORAGE_KEY = 'agi-model-picker-favourites';
const SAVE_FAILED_COPY = 'Your favourite models could not be saved. Try again.';

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

async function persistFavourites(modelIds: readonly string[]): Promise<boolean> {
  try {
    const csrf = await getCsrfToken();
    const response = await fetch(PREFERENCES_ENDPOINT, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({
        namespace: MODEL_PICKER_PREFERENCES_NAMESPACE,
        value: { [FAVOURITE_MODEL_IDS_KEY]: modelIds },
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface ModelFavourites {
  favouriteModelIds: readonly string[];
  toggleFavourite: (modelId: string) => void;
}

let storedFavourites: Promise<readonly string[] | null> | null = null;
let favouritesGeneration = 0;

export function invalidateModelFavouritesCache(): void {
  storedFavourites = null;
  favouritesGeneration += 1;
}

function loadStoredFavourites(): Promise<readonly string[] | null> {
  if (storedFavourites) return storedFavourites;
  const requestGeneration = favouritesGeneration;
  const request = fetch(`${PREFERENCES_ENDPOINT}?namespace=${MODEL_PICKER_PREFERENCES_NAMESPACE}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const body = (await response.json()) as { settings?: Record<string, unknown> };
      const stored = body.settings?.[FAVOURITE_MODEL_IDS_KEY];
      const ids = Array.isArray(stored)
        ? stored.filter((id): id is string => typeof id === 'string')
        : null;
      return requestGeneration === favouritesGeneration ? ids : null;
    })
    .catch(() => {
      if (requestGeneration === favouritesGeneration && storedFavourites === request) {
        storedFavourites = null;
      }
      return null;
    });
  storedFavourites = request;
  return request;
}

export function useModelFavourites(): ModelFavourites {
  const [favouriteModelIds, setFavouriteModelIds] = useState<readonly string[]>([]);
  const currentRef = useRef<readonly string[]>([]);

  const apply = useCallback((ids: readonly string[]) => {
    currentRef.current = ids;
    setFavouriteModelIds(ids);
    writeDeviceFavourites(ids);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const deviceIds = readDeviceFavourites();
    currentRef.current = deviceIds;
    setFavouriteModelIds(deviceIds);
    void loadStoredFavourites().then((ids) => {
      if (cancelled || !ids) return;
      apply(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const toggleFavourite = useCallback(
    (modelId: string) => {
      const previous = currentRef.current;
      const next = previous.includes(modelId)
        ? previous.filter((id) => id !== modelId)
        : [...previous, modelId];
      apply(next);
      storedFavourites = Promise.resolve(next);
      void persistFavourites(next).then((saved) => {
        if (saved) return;
        storedFavourites = null;
        if (currentRef.current === next) apply(previous);
        toast.error(SAVE_FAILED_COPY);
      });
    },
    [apply],
  );

  return { favouriteModelIds, toggleFavourite };
}
