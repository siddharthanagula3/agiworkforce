'use client';

import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';
import type { StepUpAction } from '@/lib/server/step-up/actions';

export const STEP_UP_TOKEN_HEADER = 'x-step-up-token';
export const STEP_UP_ERROR_CODE = 'STEP_UP_REQUIRED';

export interface StepUpChallenge {
  action: StepUpAction;
  consequence: string;
  freshnessSeconds: number;
  resourceId: string | null;
}

export type StepUpSend = (headers: Record<string, string>) => Promise<Response>;
export type StepUpSatisfier = (challenge: StepUpChallenge) => Promise<string | null>;

/** A person who dismissed the challenge did not fail, so callers do not alarm them. */
export class StepUpCancelledError extends Error {
  constructor() {
    super('Confirmation cancelled.');
    this.name = 'StepUpCancelledError';
  }
}

export function isStepUpCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'StepUpCancelledError';
}

interface StepUpRefusalBody {
  error?: {
    code?: string;
    message?: string;
    details?: { action?: string; consequence?: string; freshnessSeconds?: number };
  };
}

export async function readStepUpChallenge(
  response: Response,
  resourceId: string | null = null,
): Promise<StepUpChallenge | null> {
  if (response.status !== 403) return null;
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as StepUpRefusalBody | null;
  const refusal = body?.error;
  if (refusal?.code !== STEP_UP_ERROR_CODE || typeof refusal.details?.action !== 'string') {
    return null;
  }
  return {
    action: refusal.details.action as StepUpAction,
    consequence:
      refusal.details.consequence ??
      refusal.message ??
      'Confirm it is you with a second factor before completing this action.',
    freshnessSeconds: refusal.details.freshnessSeconds ?? 0,
    resourceId,
  };
}

/**
 * Sends the request, and when the route answers STEP_UP_REQUIRED asks `satisfy`
 * for a fresh proof and sends it exactly once more with the grant attached.
 */
export async function fetchWithStepUp(
  send: StepUpSend,
  satisfy: StepUpSatisfier,
  resourceId: string | null = null,
): Promise<Response> {
  const first = await send({});
  const challenge = await readStepUpChallenge(first, resourceId);
  if (!challenge) return first;

  const token = await satisfy(challenge);
  if (!token) throw new StepUpCancelledError();

  return send({ [STEP_UP_TOKEN_HEADER]: token });
}

export interface AuthorizedJsonRequest {
  method: string;
  body?: unknown;
}

export async function sendAuthorizedJson(
  url: string,
  init: AuthorizedJsonRequest,
  headers: Record<string, string> = {},
): Promise<Response> {
  const authToken = await getAuthToken();
  if (!authToken) throw new Error('User not authenticated');

  return fetch(url, {
    method: init.method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-csrf-token': await getCsrfToken(),
      ...headers,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}
