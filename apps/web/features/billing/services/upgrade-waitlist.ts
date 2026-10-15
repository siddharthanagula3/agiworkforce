import type { BillingInterval, SelfServePaidPlanTier } from '@agiworkforce/types';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { httpStatusMessage } from '@/lib/user-error-message';
import { TimeoutPresets } from '@shared/lib/error-utils';
import {
  UpgradeWaitlistStatusSchema,
  type UpgradeWaitlistStatus,
} from '@/lib/validations/upgrade-waitlist';

export type { UpgradeWaitlistStatus };

export interface UpgradeWaitlistRequest {
  plan: SelfServePaidPlanTier;
  billingInterval: BillingInterval;
  seats?: number;
  premiumSeats?: number;
}

const STATUS_UNAVAILABLE_MESSAGE = 'Upgrade access could not be checked.';
const JOIN_FAILED_MESSAGE = 'Could not join the waitlist.';
const REQUEST_TIMEOUT_STATUS = 408;

function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string' && error) return error;
  if (!error || typeof error !== 'object') return fallback;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message ? message : fallback;
}

export async function readUpgradeWaitlistStatus(): Promise<UpgradeWaitlistStatus> {
  const response = await fetch('/api/waitlist', { cache: 'no-store' });
  if (!response.ok) {
    throw Object.assign(new Error(STATUS_UNAVAILABLE_MESSAGE), { status: response.status });
  }
  const parsed = UpgradeWaitlistStatusSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(STATUS_UNAVAILABLE_MESSAGE);
  return parsed.data;
}

export function upgradeNeedsWaitlist(status: UpgradeWaitlistStatus | null): boolean {
  return status === null || (status.upgradeGateEnabled && !status.accessGranted);
}

function timedOut(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'TimeoutError';
}

export async function joinUpgradeWaitlist(request: UpgradeWaitlistRequest): Promise<void> {
  const response = await fetch('/api/waitlist', {
    method: 'POST',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      plan: request.plan,
      billingInterval: request.billingInterval,
      source: 'billing-upgrade',
    }),
    signal: AbortSignal.timeout(TimeoutPresets.FAST),
  }).catch((reason: unknown) => {
    if (!timedOut(reason)) throw reason;
    throw Object.assign(
      new Error(httpStatusMessage(REQUEST_TIMEOUT_STATUS) ?? JOIN_FAILED_MESSAGE),
      { status: REQUEST_TIMEOUT_STATUS },
    );
  });
  if (response.ok) return;
  throw new Error(apiErrorMessage(await response.json().catch(() => null), JOIN_FAILED_MESSAGE));
}

export async function redeemUpgradeAccessCode(code: string): Promise<void> {
  const response = await fetch('/api/waitlist/access', {
    method: 'POST',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ code }),
  });
  if (response.ok) return;
  throw new Error(
    apiErrorMessage(await response.json().catch(() => null), 'That access code could not be used.'),
  );
}
