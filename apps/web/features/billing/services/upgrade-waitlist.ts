import type { BillingInterval, SelfServePaidPlanTier } from '@agiworkforce/types';
import { addCsrfHeaders } from '@/lib/client/csrf';

export interface UpgradeWaitlistRequest {
  plan: SelfServePaidPlanTier;
  billingInterval: BillingInterval;
  seats?: number;
  premiumSeats?: number;
}

function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string' && error) return error;
  if (!error || typeof error !== 'object') return fallback;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message ? message : fallback;
}

export async function isUpgradeWaitlistRequired(): Promise<boolean> {
  try {
    const response = await fetch('/api/waitlist', { cache: 'no-store' });
    if (!response.ok) return true;
    const body: unknown = await response.json();
    return (
      !body ||
      typeof body !== 'object' ||
      (body as { upgradeGateEnabled?: unknown }).upgradeGateEnabled !== false
    );
  } catch {
    return true;
  }
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
  });
  if (response.ok) return;
  throw new Error(
    apiErrorMessage(await response.json().catch(() => null), 'Could not join the waitlist.'),
  );
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
