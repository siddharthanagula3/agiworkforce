'use client';

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ManagedMediaModelAvailabilityResponseSchema,
  type ManagedMediaModelAdmission,
} from '@agiworkforce/cloud-contracts';
import { queryKeys } from '@shared/stores/query-client';

export type MediaModelAvailabilityStatus = 'loading' | 'ready' | 'error';

export interface MediaModelAvailabilityResult {
  status: MediaModelAvailabilityStatus;
  error: string | null;
  admissionFor: (modelId: string) => ManagedMediaModelAdmission | undefined;
  retry: () => void;
}

const MEDIA_AVAILABILITY_UNAVAILABLE_COPY =
  "We couldn't check which image and video models are available right now. Try again in a moment.";
const MEDIA_AVAILABILITY_TIMEOUT_COPY =
  'Checking image and video models took too long. Check your connection and try again.';
const MEDIA_AVAILABILITY_TIMEOUT_MS = 10_000;
const MEDIA_AVAILABILITY_RETRY_DELAY_MS = 500;
const MEDIA_AVAILABILITY_MAX_RETRY_AFTER_MS = 5_000;

class MediaAvailabilityTimeoutError extends Error {}

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

async function requestMediaModelAvailability(
  signal: AbortSignal,
): Promise<ManagedMediaModelAdmission[]> {
  let response: Response | undefined;
  for (let requestAttempt = 0; requestAttempt < 2; requestAttempt += 1) {
    response = await fetch('/api/media/availability', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    if (response.ok) break;
    const delay = requestAttempt === 0 ? retryDelayMs(response) : null;
    if (delay === null) break;
    await waitForRetry(delay, signal);
  }
  if (!response) throw new Error('Media availability check returned no response.');
  if (!response.ok) {
    throw new Error(`Media availability check failed (HTTP ${response.status}).`);
  }
  const parsed = ManagedMediaModelAvailabilityResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('Media availability response did not match the managed-media contract.');
  }
  return parsed.data.models;
}

async function fetchMediaModelAvailability({
  signal: outerSignal,
}: {
  signal: AbortSignal;
}): Promise<ManagedMediaModelAdmission[]> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  outerSignal.addEventListener('abort', forwardAbort, { once: true });

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    const timer = window.setTimeout(() => {
      controller.abort();
      reject(new MediaAvailabilityTimeoutError(MEDIA_AVAILABILITY_TIMEOUT_COPY));
    }, MEDIA_AVAILABILITY_TIMEOUT_MS);
    controller.signal.addEventListener('abort', () => window.clearTimeout(timer), { once: true });
  });

  try {
    return await Promise.race([requestMediaModelAvailability(controller.signal), timeoutPromise]);
  } finally {
    outerSignal.removeEventListener('abort', forwardAbort);
    controller.abort();
  }
}

export function useMediaModelAvailability(): MediaModelAvailabilityResult {
  const query = useQuery({
    queryKey: queryKeys.media.availability(),
    queryFn: ({ signal }) => fetchMediaModelAvailability({ signal }),
    retry: false,
    meta: { silent: true },
  });

  const admissions = useMemo(() => query.data ?? [], [query.data]);
  const byId = useMemo(
    () => new Map(admissions.map((admission) => [admission.model_id, admission])),
    [admissions],
  );
  const admissionFor = useCallback((modelId: string) => byId.get(modelId), [byId]);
  const retry = useCallback(() => {
    void query.refetch();
  }, [query]);

  const status: MediaModelAvailabilityStatus = query.isError
    ? 'error'
    : query.data
      ? 'ready'
      : 'loading';
  const error = query.isError
    ? query.error instanceof MediaAvailabilityTimeoutError
      ? MEDIA_AVAILABILITY_TIMEOUT_COPY
      : MEDIA_AVAILABILITY_UNAVAILABLE_COPY
    : null;

  return { status, error, admissionFor, retry };
}
