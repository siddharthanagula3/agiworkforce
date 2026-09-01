import { getNextUpgradeTier } from '@agiworkforce/types';

import type { FreeCapacitySlot, PaywallSlot } from '@/features/chat/types/message-metadata';

/**
 * The free lane's own refusal, which is not a quota block.
 *
 * `classifyManagedQuotaErrorCode` deliberately does not know this code: nothing
 * of the user's was exhausted and no plan limit was reached — the shared
 * zero-cost pool is momentarily out of capacity. It resolves here instead so the
 * card can say that rather than borrowing "you have reached your limit" copy for
 * a limit the user never hit.
 */
export const FREE_CAPACITY_UNAVAILABLE_CODE = 'free_capacity_unavailable';

const BYOK_RECOVERY_ACTION = 'byok';
const FREE_CAPACITY_FEATURE = 'rolling_capacity';
const FREE_CAPACITY_FALLBACK_REASON =
  'No free capacity right now. Try again shortly, upgrade your plan, or use your own provider key.';
const DEFAULT_REQUIRED_TIER = 'basic';

const SAME_ORIGIN_PROBE = 'https://same-origin.probe';
const SAME_ORIGIN_PROBE_ORIGIN = new URL(SAME_ORIGIN_PROBE).origin;

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_MAX_COUNTDOWN = 10;
const MAX_COUNTDOWN_MS = MINUTES_PER_MAX_COUNTDOWN * SECONDS_PER_MINUTE * MS_PER_SECOND;

export interface FreeCapacityRecoveryOption {
  action: string;
  href: string;
}

export function isFreeCapacityUnavailableCode(code: string | null | undefined): boolean {
  return code?.trim().toLowerCase() === FREE_CAPACITY_UNAVAILABLE_CODE;
}

/**
 * A server href is only ever followed as a same-origin path.
 *
 * The recovery destinations are the server's to choose, but "wherever the
 * response said" is not a contract this card can honour blindly — a protocol or
 * scheme-relative href would turn a refusal into an off-site navigation.
 */
function samePathOriginHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, SAME_ORIGIN_PROBE);
    if (url.origin !== SAME_ORIGIN_PROBE_ORIGIN) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}

export function findRecoveryHref(
  recovery: readonly FreeCapacityRecoveryOption[] | undefined,
  action: string,
): string | undefined {
  return samePathOriginHref(recovery?.find((option) => option.action === action)?.href);
}

/**
 * The instant the pool expects to have capacity again, as the wire states it.
 *
 * Absent whenever the server could not name one — every rejected route was
 * unavailable for a reason with no clock attached — and absent is a distinct
 * answer from "now", so it is never defaulted to one.
 */
export function readRetryAt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

/**
 * How long there is left to wait, or null when waiting is not the advice.
 *
 * Null beyond ten minutes, matching mobile: the lane's own backoff tops out
 * around there, so a longer deadline is a quota window measured in hours
 * (`resetsAtMs` in `packages/ai/routing/src/free-auto.ts`), and a retry held
 * shut that long is a dead control rather than a wait.
 */
export function freeCapacityRetryRemainingMs(
  retryAt: string | undefined,
  nowMs: number,
): number | null {
  if (!retryAt) return null;
  const target = Date.parse(retryAt);
  if (Number.isNaN(target)) return null;
  const remainingMs = target - nowMs;
  return remainingMs <= 0 || remainingMs > MAX_COUNTDOWN_MS ? null : remainingMs;
}

export function formatFreeCapacityCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / MS_PER_SECOND);
  if (totalSeconds < SECONDS_PER_MINUTE) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function resolveFreeCapacityPaywallSlot(input: {
  code: string | undefined;
  message: string;
  recovery?: readonly FreeCapacityRecoveryOption[] | undefined;
  planTier: string | null | undefined;
  retryAt?: string | undefined;
}): PaywallSlot | null {
  if (!isFreeCapacityUnavailableCode(input.code)) return null;

  const byokHref = findRecoveryHref(input.recovery, BYOK_RECOVERY_ACTION);
  const freeCapacity: FreeCapacitySlot = {
    ...(input.retryAt ? { retryAt: input.retryAt } : {}),
    ...(byokHref ? { byokHref } : {}),
  };

  const nextTier = getNextUpgradeTier(input.planTier);

  return {
    feature: FREE_CAPACITY_FEATURE,
    requiredTier: nextTier ?? DEFAULT_REQUIRED_TIER,
    reason: input.message || FREE_CAPACITY_FALLBACK_REASON,
    recoveryAction: 'upgrade',
    showUpgradeCta: nextTier !== null,
    showResetTime: false,
    suggestStandardModel: false,
    freeCapacity,
  };
}
