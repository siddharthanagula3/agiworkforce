'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  FREE_QUOTA_CATALOGUE_PATH,
  type FreeQuotaMediaCategory,
} from '@agiworkforce/cloud-contracts';
import {
  limitedFreeMedia,
  orderedReadyFreeMedia,
  type LimitedFreeMedia,
} from '@/features/models/lib/free-media-offer';
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
  status: 'loading' | 'ready' | 'error';
  retry: () => void;
  refresh: () => void;
}

type Settled = Pick<PromotionalMedia, 'models' | 'issuer' | 'limited'> & {
  attempt: number;
  failed: boolean;
};

const NOT_OFFERED_STATUSES: ReadonlySet<number> = new Set([401, 403, 404]);
const NO_MODELS: PromotionalMediaModel[] = [];
const NOT_LIMITED: LimitedPromotionalMedia = { image: null, video: null };

function settle(catalogue: FreeQuotaCatalogue | null, attempt: number): Settled {
  return {
    attempt,
    failed: false,
    issuer: catalogue?.issuer ?? null,
    models: catalogue ? orderedReadyFreeMedia(catalogue) : NO_MODELS,
    limited: {
      image: limitedFreeMedia(catalogue, 'image'),
      video: limitedFreeMedia(catalogue, 'video'),
    },
  };
}

export function usePromotionalMediaModels(enabled: boolean): PromotionalMedia {
  const [settled, setSettled] = useState<Settled | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch(FREE_QUOTA_CATALOGUE_PATH, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (NOT_OFFERED_STATUSES.has(response.status)) return null;
        if (!response.ok) throw new Error('Promotional media availability could not be checked');
        return (await response.json()) as FreeQuotaCatalogue | null;
      })
      .then((catalogue) => {
        if (!controller.signal.aborted) setSettled(settle(catalogue, attempt));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSettled({ ...settle(null, attempt), failed: true });
        }
      });
    return () => controller.abort();
  }, [attempt, enabled, revision]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);
  const actions = { retry, refresh };
  if (!enabled) {
    return { models: NO_MODELS, issuer: null, limited: NOT_LIMITED, status: 'ready', ...actions };
  }
  if (!settled || settled.attempt !== attempt) {
    return { models: NO_MODELS, issuer: null, limited: NOT_LIMITED, status: 'loading', ...actions };
  }
  return {
    models: settled.models,
    issuer: settled.issuer,
    limited: settled.limited,
    status: settled.failed ? 'error' : 'ready',
    ...actions,
  };
}
