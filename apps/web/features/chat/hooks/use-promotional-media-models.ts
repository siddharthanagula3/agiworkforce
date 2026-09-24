'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FreeQuotaCatalogue, FreeQuotaModel } from '@/features/models/lib/free-quota-types';

export type PromotionalMediaModel = Pick<
  FreeQuotaModel,
  'key' | 'displayName' | 'category' | 'status' | 'outputSize' | 'durationSeconds'
>;

export function usePromotionalMediaModels(enabled: boolean) {
  const [models, setModels] = useState<PromotionalMediaModel[]>([]);
  const [issuer, setIssuer] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setModels([]);
      setIssuer(null);
      setStatus('ready');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    void fetch('/api/models/free-quota', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Promotional media availability could not be checked');
        const catalogue = (await response.json()) as FreeQuotaCatalogue | null;
        if (controller.signal.aborted) return;
        setIssuer(catalogue?.issuer ?? null);
        setModels(
          catalogue?.models.filter(
            (model) =>
              (model.category === 'image' || model.category === 'video') &&
              model.status === 'ready',
          ) ?? [],
        );
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [attempt, enabled]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return { models, issuer, status, retry };
}
