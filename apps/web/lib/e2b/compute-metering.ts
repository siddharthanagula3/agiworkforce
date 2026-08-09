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
 * number.
 *
 * `.env.example` ships that var empty, so the DEFAULT configuration used to
 * mean "meter 0" — a production deployment that ran sandboxes gave every second
 * away and said so once, in a warning nobody reads. The rate is therefore no
 * longer only a metering input: `sandboxComputeIsPriceable()` is checked by
 * `getE2BExecutor()` BEFORE any sandbox is created or resumed, so on a
 * production runtime an unpriced deployment serves no managed compute at all
 * rather than serving it free. Off production (dev, preview, `next build`)
 * metering stays inert and sandboxes are still served.
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
 * Sandbox time this process closed without charging a cent for it.
 *
 * Per-process and in-memory: it resets on every serverless cold start, so it
 * sizes the leak within one instance's lifetime, not across the deployment.
 */
let unbilledMs = 0;

/**
 * Whether an unpriced sandbox second is a revenue leak rather than an
 * unconfigured dev box.
 *
 * Mirrors the phase-scoped check in `lib/rate-limit.ts`: the build (`next build`
 * runs with NODE_ENV=production) and Vercel previews serve no customer, every
 * other production runtime does — Vercel or self-hosted.
 */
function isProductionRuntime(): boolean {
  if (process.env['NEXT_PHASE'] === 'phase-production-build') return false;
  const vercelEnv = process.env['VERCEL_ENV'];
  if (vercelEnv === 'preview') return false;
  return vercelEnv === 'production' || process.env['NODE_ENV'] === 'production';
}

/**
 * The operator-configured per-second rate, or null when it is unset or not a
 * usable positive number. Null is "these seconds cannot be priced" — it is
 * never a price of zero.
 */
function readConfiguredRate(): number | null {
  const raw = process.env[E2B_COMPUTE_RATE_ENV];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    if (!isProductionRuntime() && !missingRateWarned) {
      missingRateWarned = true;
      logger.warn(
        { env: E2B_COMPUTE_RATE_ENV },
        '[e2b] sandbox compute metering is INERT: no per-second rate is configured, so sandbox seconds do not reach the usage ledger',
      );
    }
    return null;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.error(
      { env: E2B_COMPUTE_RATE_ENV, value: raw },
      '[e2b] invalid sandbox compute rate; sandbox compute cannot be priced',
    );
    return null;
  }
  return parsed;
}

/**
 * Whether this deployment can put a price on the sandbox seconds it is about to
 * sell. FALSE only on a production runtime with no usable rate.
 *
 * `getE2BExecutor()` (lib/e2b/runtime.ts) checks this before creating or
 * resuming any sandbox and refuses fail-closed when it is false, which is what
 * stops an unpriced production deployment from giving compute away. Nothing
 * else may treat a missing rate as permission to run a sandbox.
 */
export function sandboxComputeIsPriceable(): boolean {
  if (readConfiguredRate() !== null) return true;
  return !isProductionRuntime();
}

/**
 * The configured per-second rate in micro-USD, or 0 when it cannot be resolved.
 * 0 disables metering for the interval — it never means the seconds were free,
 * which is why `sandboxComputeIsPriceable()` refuses the sandbox up front.
 */
export function getSandboxComputeMicrousdPerSecond(): number {
  return readConfiguredRate() ?? 0;
}

/** Whether an interval is plausible enough to charge for at all. */
function isBillableInterval(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs > 0 && elapsedMs <= MAX_BILLABLE_INTERVAL_MS;
}

/**
 * Ledger cents for one billable interval. Rounds to the nearest cent and never
 * charges for a zero/negative or implausibly long interval.
 *
 * KNOWN UNDER-CHARGE: rounding to whole cents drops any interval worth less
 * than half a cent, and `closeBillableInterval` closes an interval at every
 * turn-end pause, so short turns can charge 0 even at a correctly configured
 * rate. Carrying the sub-cent remainder across intervals needs a ledger that
 * accepts fractional cents (`CreditService.settleCreditsDurably` takes an
 * integer `amountCents` straight into `enqueue_credit_settlement`), so it is a
 * schema change, not a change here. `meterSandboxComputeInterval` counts every
 * such interval into `unbilledMs` so the loss is at least measured.
 */
export function sandboxComputeCostCents(elapsedMs: number, microusdPerSecond: number): number {
  if (!isBillableInterval(elapsedMs)) return 0;
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
  /** Epoch ms the interval closed (pause / kill / reclaim). */
  endedAtMs: number;
  /** Why the interval closed; recorded on the ledger row for attribution. */
  reason: 'pause' | 'kill' | 'reclaim';
}

/**
 * Settle one closed sandbox interval into the usage ledger.
 *
 * Best-effort and never throws: a metering failure must not fail the user's
 * turn, and the callers (pause, kill, reclaim) must still release the sandbox.
 * The idempotency key is derived from the sandbox id and the interval start, so
 * a retried pause cannot double-charge the same seconds.
 *
 * An interval that reaches here unpriced is a sandbox that was already running
 * when the rate went away (or one being reclaimed), since new ones are refused
 * up front — it is reported per interval rather than once per process.
 */
export async function meterSandboxComputeInterval(
  interval: SandboxComputeInterval,
): Promise<number> {
  const elapsedMs = interval.endedAtMs - interval.startedAtMs;
  if (!isBillableInterval(elapsedMs)) return 0;

  const rate = readConfiguredRate();
  const costCents = rate === null ? 0 : sandboxComputeCostCents(elapsedMs, rate);
  if (costCents <= 0) {
    unbilledMs += elapsedMs;
    const base = {
      env: E2B_COMPUTE_RATE_ENV,
      userId: interval.userId,
      sandboxId: interval.sandboxId,
      elapsedMs,
      unbilledMs,
    };
    if (rate === null) {
      logger.error(
        base,
        '[e2b] sandbox compute is UNPRICED: these seconds bill nothing and move no usage cap',
      );
    } else {
      // Priced, but worth less than half a cent — see sandboxComputeCostCents.
      logger.warn(
        { ...base, microusdPerSecond: rate },
        '[e2b] sandbox interval rounded to 0 cents: these seconds bill nothing and move no usage cap',
      );
    }
    return 0;
  }

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
