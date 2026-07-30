/**
 * GOV-5 — attribute E2B sandbox compute to the managed usage ledger.
 *
 * E2B bills sandbox compute BY THE SECOND, and none of it was ever reserved,
 * settled, or deducted: `reserveManagedUsageRequest` meters LLM provider calls
 * only. A user could burn unbounded compute-seconds inside their sandboxes
 * while their meter and their rolling 5-hour / weekly / flagship caps stayed
 * flat — the sandbox was free money against every spend ceiling the product
 * has.
 *
 * This module closes each billable interval into the SAME ledger the rolling
 * caps read (`credit_transactions` rows with `transaction_type = 'deduction'`,
 * written by `enqueue_credit_settlement` → `deduct_credits`), so sandbox time
 * now moves the 5-hour, weekly, and billing-period meters exactly like a
 * provider call does.
 *
 * PRICING IS AN OPERATOR INPUT, NOT A GUESS. The per-second rate depends on the
 * deployment's E2B contract and template size, so it is read from
 * `AGI_E2B_COMPUTE_MICROUSD_PER_SECOND` and is NOT defaulted to an invented
 * number. Metering is inert until the operator sets it; the absence is logged
 * loudly rather than silently approximated.
 */
import 'server-only';

import { logger } from '@/lib/logger';
import { CreditService } from '@/lib/services/credit-service';

/** Micro-USD charged per sandbox-second. Operator-provisioned; no default. */
export const E2B_COMPUTE_RATE_ENV = 'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND';

const MICROUSD_PER_CENT = 10_000;

/** Guard against a stuck `activeSinceMs` billing an absurd interval. */
const MAX_BILLABLE_INTERVAL_MS = 24 * 60 * 60 * 1000;

let missingRateWarned = false;

/**
 * The configured per-second rate in micro-USD, or 0 when unconfigured.
 * 0 disables metering — it never means "free".
 */
export function getSandboxComputeMicrousdPerSecond(): number {
  const raw = process.env[E2B_COMPUTE_RATE_ENV];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    if (!missingRateWarned) {
      missingRateWarned = true;
      logger.warn(
        { env: E2B_COMPUTE_RATE_ENV },
        '[e2b] sandbox compute metering is INERT: no per-second rate is configured, so sandbox seconds do not reach the usage ledger',
      );
    }
    return 0;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.error(
      { env: E2B_COMPUTE_RATE_ENV, value: raw },
      '[e2b] invalid sandbox compute rate; metering disabled',
    );
    return 0;
  }
  return parsed;
}

/**
 * Ledger cents for one billable interval. Rounds to the nearest cent and never
 * charges for a zero/negative or implausibly long interval.
 */
export function sandboxComputeCostCents(elapsedMs: number, microusdPerSecond: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (elapsedMs > MAX_BILLABLE_INTERVAL_MS) return 0;
  if (microusdPerSecond <= 0) return 0;
  const seconds = elapsedMs / 1000;
  return Math.round((seconds * microusdPerSecond) / MICROUSD_PER_CENT);
}

export interface SandboxComputeInterval {
  userId: string;
  sandboxId: string;
  conversationId?: string | undefined;
  codeSessionId?: string | undefined;
  /** Epoch ms the interval opened (sandbox created or resumed). */
  startedAtMs: number;
  /** Epoch ms the interval closed (pause / kill / dispose / reclaim). */
  endedAtMs: number;
  /** Why the interval closed; recorded on the ledger row for attribution. */
  reason: 'pause' | 'kill' | 'dispose' | 'reclaim';
}

/**
 * Settle one closed sandbox interval into the usage ledger.
 *
 * Best-effort and never throws: a metering failure must not fail the user's
 * turn. The idempotency key is derived from the sandbox id and the interval
 * start, so a retried pause cannot double-charge the same seconds.
 */
export async function meterSandboxComputeInterval(
  interval: SandboxComputeInterval,
): Promise<number> {
  const rate = getSandboxComputeMicrousdPerSecond();
  const elapsedMs = interval.endedAtMs - interval.startedAtMs;
  const costCents = sandboxComputeCostCents(elapsedMs, rate);

  if (costCents <= 0) return 0;

  try {
    await CreditService.settleCreditsDurably({
      userId: interval.userId,
      amountCents: costCents,
      description: 'Managed sandbox compute',
      idempotencyKey: `e2b-compute:${interval.sandboxId}:${interval.startedAtMs}`,
      metadata: {
        type: 'e2b_sandbox_compute',
        sandbox_id: interval.sandboxId,
        ...(interval.conversationId ? { conversation_id: interval.conversationId } : {}),
        ...(interval.codeSessionId ? { code_session_id: interval.codeSessionId } : {}),
        elapsed_ms: elapsedMs,
        microusd_per_second: rate,
        close_reason: interval.reason,
      },
    });
    logger.info(
      {
        userId: interval.userId,
        sandboxId: interval.sandboxId,
        elapsedMs,
        costCents,
        reason: interval.reason,
      },
      '[e2b] sandbox compute metered to the usage ledger',
    );
    return costCents;
  } catch (err) {
    logger.error(
      { err, userId: interval.userId, sandboxId: interval.sandboxId, elapsedMs, costCents },
      '[e2b] sandbox compute could not be metered; seconds are unattributed',
    );
    return 0;
  }
}
