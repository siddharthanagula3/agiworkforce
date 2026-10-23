'use client';

import { useCallback, useEffect, useState } from 'react';
import { FREE_QUOTA_CATALOGUE_PATH } from '@agiworkforce/cloud-contracts';
import { orderedReadyFreeMedia } from '@/features/models/lib/free-media';
import type { FreeQuotaCatalogue, FreeQuotaModel } from '@/features/models/lib/free-quota-types';

export type PromotionalMediaModel = Pick<
  FreeQuotaModel,
  'key' | 'displayName' | 'category' | 'status' | 'outputSize' | 'durationSeconds'
>;

export interface PromotionalMedia {
  models: PromotionalMediaModel[];
  issuer: string | null;
  status: 'loading' | 'ready' | 'error';
  retry: () => void;
}

type Settled = Pick<PromotionalMedia, 'models' | 'issuer'> & {
  attempt: number;
  failed: boolean;
};

const NOT_OFFERED_STATUSES: ReadonlySet<number> = new Set([401, 403, 404]);
const NO_MODELS: PromotionalMediaModel[] = [];

function settle(catalogue: FreeQuotaCatalogue | null, attempt: number): Settled {
  return {
    attempt,
    failed: false,
    issuer: catalogue?.issuer ?? null,
    models: catalogue ? orderedReadyFreeMedia(catalogue) : NO_MODELS,
  };
}

export function usePromotionalMediaModels(enabled: boolean): PromotionalMedia {
  const [settled, setSettled] = useState<Settled | null>(null);
  const [attempt, setAttempt] = useState(0);

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
  }, [attempt, enabled]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  if (!enabled) return { models: NO_MODELS, issuer: null, status: 'ready', retry };
  if (!settled || settled.attempt !== attempt) {
    return { models: NO_MODELS, issuer: null, status: 'loading', retry };
  }
  return {
    models: settled.models,
    issuer: settled.issuer,
    status: settled.failed ? 'error' : 'ready',
    retry,
  };
}
