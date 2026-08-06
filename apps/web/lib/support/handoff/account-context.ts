/**
 * @file account-context.ts
 *
 * Builds the account context that travels with an escalation — the "so the user
 * never repeats themselves" half of the brief.
 *
 * TRUST BOUNDARY: every field here is derived SERVER-SIDE from a verified Clerk
 * user id. Nothing on this path reads a plan, tier, or usage figure from the
 * request body. A client that claims `planTier: 'enterprise'` changes nothing.
 *
 * PRIVACY BOUNDARY: this context is written to `support_handoff_sessions` and
 * mailed to the support mailbox. It therefore carries only what a human needs
 * to act — plan, status, period end, usage PERCENTAGES. It never carries
 * private allowance operands (cents/units), which is why it calls
 * `getManagedUsageSummary` (the public percentage-only contract) and never
 * `lib/server/managed-usage-policy`.
 *
 * DEGRADATION: a lookup that times out yields `null` plus a `degraded` note, not
 * a zero. A human reading "usage 0%" would act on it; reading "usage lookup
 * timed out" they will not.
 */

import 'server-only';

import { getManagedUsageSummary } from '@/lib/services/managed-usage-summary-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { logger } from '@/lib/logger';
import type { HandoffAccountContext } from './types';

/** Support must not hang on a slow dependency; a partial context still helps. */
const LOOKUP_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T | null> {
  return Promise.race([
    // Promise.resolve() so a dependency that throws synchronously (or returns a
    // non-promise) degrades to a null fact rather than failing the escalation.
    Promise.resolve(promise).catch((error: unknown) => {
      logger.warn({ error, label }, 'Support handoff account lookup failed');
      return null;
    }),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS);
    }),
  ]);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const ANONYMOUS_ACCOUNT_CONTEXT: HandoffAccountContext = {
  signedIn: false,
  userId: null,
  planTier: null,
  subscriptionStatus: null,
  currentPeriodEnd: null,
  usagePercentage: null,
  usageResetAt: null,
  hasUsageRemaining: null,
};

/**
 * @param userId a Clerk user id already verified by the route. Never accept one
 *               from a request body.
 */
export async function buildHandoffAccountContext(
  userId: string | null,
): Promise<HandoffAccountContext> {
  if (!userId) return ANONYMOUS_ACCOUNT_CONTEXT;

  const [subscription, usage] = await Promise.all([
    withTimeout(SubscriptionService.getSubscription(userId), 'subscription'),
    withTimeout(getManagedUsageSummary(userId), 'managed-usage'),
  ]);

  const degradedParts: string[] = [];
  if (!subscription) degradedParts.push('subscription lookup unavailable');
  if (!usage) degradedParts.push('usage lookup unavailable');

  return {
    signedIn: true,
    userId,
    planTier: subscription?.plan_tier ?? usage?.plan_tier ?? null,
    subscriptionStatus: subscription?.status ?? usage?.subscription_status ?? null,
    currentPeriodEnd: toIso(subscription?.current_period_end ?? null),
    usagePercentage: usage?.usage_percentage ?? null,
    usageResetAt: usage?.usage_reset_at ?? null,
    hasUsageRemaining: usage?.has_usage_remaining ?? null,
    ...(degradedParts.length ? { degraded: degradedParts.join('; ') } : {}),
  };
}
