import 'server-only';

import { logger } from '@/lib/logger';
import { CreditService } from '@/lib/services/credit-service';

export const E2B_COMPUTE_RATE_ENV = 'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND';

const MICROUSD_PER_CENT = 10_000;

const MAX_BILLABLE_INTERVAL_MS = 24 * 60 * 60 * 1000;

let missingRateWarned = false;

let unbilledMs = 0;

function isProductionRuntime(): boolean {
  if (process.env['NEXT_PHASE'] === 'phase-production-build') return false;
  const vercelEnv = process.env['VERCEL_ENV'];
  if (vercelEnv === 'preview') return false;
  return vercelEnv === 'production' || process.env['NODE_ENV'] === 'production';
}

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

export function sandboxComputeIsPriceable(): boolean {
  if (readConfiguredRate() !== null) return true;
  return !isProductionRuntime();
}

export function getSandboxComputeMicrousdPerSecond(): number {
  return readConfiguredRate() ?? 0;
}

function isBillableInterval(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs > 0 && elapsedMs <= MAX_BILLABLE_INTERVAL_MS;
}

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
  startedAtMs: number;
  endedAtMs: number;
  reason: 'pause' | 'kill' | 'reclaim';
}

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
