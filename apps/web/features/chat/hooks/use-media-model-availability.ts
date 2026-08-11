'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ManagedMediaModelAvailabilityResponseSchema,
  type ManagedMediaModelAdmission,
} from '@agiworkforce/cloud-contracts';

export type MediaModelAvailabilityStatus = 'loading' | 'ready' | 'error';

export interface MediaModelAvailabilityResult {
  status: MediaModelAvailabilityStatus;
  error: string | null;
  admissionFor: (modelId: string) => ManagedMediaModelAdmission | undefined;
  retry: () => void;
}

const MEDIA_AVAILABILITY_TIMEOUT_MS = 10_000;
const MEDIA_AVAILABILITY_RETRY_DELAY_MS = 500;
const MEDIA_AVAILABILITY_MAX_RETRY_AFTER_MS = 5_000;

function retryDelayMs(response: Response): number | null {
  if (response.status !== 429 && response.status < 500) return null;
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return MEDIA_AVAILABILITY_RETRY_DELAY_MS;

  const seconds = Number(retryAfter);
  const parsedDelay = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(retryAfter) - Date.now();
  if (!Number.isFinite(parsedDelay)) return MEDIA_AVAILABILITY_RETRY_DELAY_MS;
  return Math.min(
    MEDIA_AVAILABILITY_MAX_RETRY_AFTER_MS,
    Math.max(MEDIA_AVAILABILITY_RETRY_DELAY_MS, parsedDelay),
  );
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new Error('Media availability retry aborted'));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function useMediaModelAvailability(): MediaModelAvailabilityResult {
  const [status, setStatus] = useState<MediaModelAvailabilityStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [admissions, setAdmissions] = useState<ManagedMediaModelAdmission[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    setStatus('loading');
    setError(null);

    const timeout = window.setTimeout(() => {
      if (!mounted || controller.signal.aborted) return;
      controller.abort();
      setAdmissions([]);
      setStatus('error');
      setError('Media availability check timed out. Check your connection and retry.');
    }, MEDIA_AVAILABILITY_TIMEOUT_MS);

    void (async () => {
      try {
        let response: Response | undefined;
        for (let requestAttempt = 0; requestAttempt < 2; requestAttempt += 1) {
          response = await fetch('/api/media/availability', {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            signal: controller.signal,
          });
          if (response.ok) break;
          const delay = requestAttempt === 0 ? retryDelayMs(response) : null;
          if (delay === null) break;
          await waitForRetry(delay, controller.signal);
        }
        if (!response) throw new Error('Media availability check returned no response.');
        if (!response.ok) {
          throw new Error(`Media availability check failed (HTTP ${response.status}).`);
        }
        const parsed = ManagedMediaModelAvailabilityResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
          throw new Error('Media availability response did not match the managed-media contract.');
        }
        if (controller.signal.aborted) return;
        window.clearTimeout(timeout);
        setAdmissions(parsed.data.models);
        setStatus('ready');
      } catch (cause) {
        if (controller.signal.aborted) return;
        setAdmissions([]);
        setStatus('error');
        setError(cause instanceof Error ? cause.message : 'Could not check media availability.');
      }
    })();

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  const byId = useMemo(
    () => new Map(admissions.map((admission) => [admission.model_id, admission])),
    [admissions],
  );
  const admissionFor = useCallback((modelId: string) => byId.get(modelId), [byId]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { status, error, admissionFor, retry };
}
