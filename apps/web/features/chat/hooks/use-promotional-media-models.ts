'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  FREE_QUOTA_CATALOGUE_PATH,
  FreeQuotaCatalogueSchema,
  freeMediaAvailability,
  type FreeMediaAvailability,
  type FreeQuotaMediaCategory,
} from '@agiworkforce/cloud-contracts';
import {
  limitedFreeMedia,
  orderedReadyFreeMedia,
  type LimitedFreeMedia,
} from '@/features/models/lib/free-media';
import type { FreeQuotaCatalogue, FreeQuotaModel } from '@/features/models/lib/free-quota-types';

export type PromotionalMediaModel = Pick<
  FreeQuotaModel,
  'key' | 'displayName' | 'category' | 'status' | 'outputSize' | 'durationSeconds'
>;

export type LimitedPromotionalMedia = Record<FreeQuotaMediaCategory, LimitedFreeMedia | null>;

export interface PromotionalMedia {
  models: PromotionalMediaModel[];
  issuer: string | null;
  limited: LimitedPromotionalMedia;
  availability: Record<FreeQuotaMediaCategory, FreeMediaAvailability>;
  status: 'loading' | 'ready' | 'error';
  retry: () => void;
  refresh: () => void;
}

type Settled = Pick<PromotionalMedia, 'models' | 'issuer' | 'limited' | 'availability'> & {
  attempt: number;
  scopeKey: string;
  failed: boolean;
};

const UNKNOWN_AVAILABILITY = { image: 'unknown', video: 'unknown' } as const;
const NO_MODELS: PromotionalMediaModel[] = [];
const NOT_LIMITED: LimitedPromotionalMedia = { image: null, video: null };

function settle(catalogue: FreeQuotaCatalogue | null, attempt: number, scopeKey: string): Settled {
  return {
    attempt,
    scopeKey,
    availability: {
      image: freeMediaAvailability(catalogue, 'image'),
      video: freeMediaAvailability(catalogue, 'video'),
    },
    failed: false,
    issuer: catalogue?.issuer ?? null,
    models: catalogue ? orderedReadyFreeMedia(catalogue) : NO_MODELS,
    limited: {
      image: limitedFreeMedia(catalogue, 'image'),
      video: limitedFreeMedia(catalogue, 'video'),
    },
  };
}

export function usePromotionalMediaModels(enabled: boolean, scopeKey = ''): PromotionalMedia {
  const [settled, setSettled] = useState<Settled | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setSettled(null);
      return;
    }
    const controller = new AbortController();
    void fetch(FREE_QUOTA_CATALOGUE_PATH, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Promotional media availability could not be checked');
        return FreeQuotaCatalogueSchema.parse(await response.json());
      })
      .then((catalogue) => {
        if (!controller.signal.aborted) setSettled(settle(catalogue, attempt, scopeKey));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSettled({ ...settle(null, attempt, scopeKey), failed: true });
        }
      });
    return () => controller.abort();
  }, [attempt, enabled, scopeKey]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const refresh = retry;
  const actions = { retry, refresh };
  if (!enabled) {
    return { models: NO_MODELS, issuer: null, limited: NOT_LIMITED, availability: UNKNOWN_AVAILABILITY, status: 'ready', ...actions };
  }
  if (!settled || settled.attempt !== attempt || settled.scopeKey !== scopeKey) {
    return { models: NO_MODELS, issuer: null, limited: NOT_LIMITED, availability: UNKNOWN_AVAILABILITY, status: 'loading', ...actions };
  }
  return {
    models: settled.models,
    issuer: settled.issuer,
    limited: settled.limited,
    availability: settled.availability,
    status: settled.failed ? 'error' : 'ready',
    ...actions,
  };
}
