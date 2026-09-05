import 'server-only';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { CreditService } from '@/lib/services/credit-service';

export const E2B_COMPUTE_RATE_ENV = 'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND';

const MICROUSD_PER_CENT = 10_000;
const USD_TO_MICROUSD = 1_000_000;

const MAX_BILLABLE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * E2B's published per-vCPU compute rate, USD per second, linear across
 * vCPU counts. Source: https://e2b.dev/pricing, fetched 2026-09-04
 * ($0.000014/vCPU/s, uniform across the Hobby and Pro tiers).
 */
const E2B_VCPU_USD_PER_SECOND_UNIT = 0.000014;

/** E2B's own default sandbox size when a template does not declare one. */
const DEFAULT_E2B_VCPU_COUNT = 2;

let unbilledMs = 0;

type ConfiguredRate = { ok: true; microusdPerSecond: number } | { ok: false };

function resolveConfiguredOverride(): ConfiguredRate | null {
  const raw = process.env[E2B_COMPUTE_RATE_ENV];
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.error(
      { env: E2B_COMPUTE_RATE_ENV, value: raw },
      '[e2b] invalid sandbox compute rate override; refusing to price sandbox compute',
    );
    return { ok: false };
  }
  return { ok: true, microusdPerSecond: parsed };
}

function tableMicrousdPerSecond(vcpuCount: number | null | undefined): number {
  const resolvedVcpuCount =
    typeof vcpuCount === 'number' && vcpuCount > 0 ? vcpuCount : DEFAULT_E2B_VCPU_COUNT;
  return Math.round(resolvedVcpuCount * E2B_VCPU_USD_PER_SECOND_UNIT * USD_TO_MICROUSD);
}

export function sandboxComputeIsPriceable(): boolean {
  const override = resolveConfiguredOverride();
  return override === null || override.ok;
}

export function getSandboxComputeMicrousdPerSecond(vcpuCount?: number | null): number {
  const override = resolveConfiguredOverride();
  if (override === null) return tableMicrousdPerSecond(vcpuCount);
  return override.ok ? override.microusdPerSecond : 0;
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
  vcpuCount?: number | undefined;
  startedAtMs: number;
  endedAtMs: number;
  reason: 'pause' | 'kill' | 'reclaim';
}

export async function meterSandboxComputeInterval(
  interval: SandboxComputeInterval,
): Promise<number> {
  const elapsedMs = interval.endedAtMs - interval.startedAtMs;
  if (!isBillableInterval(elapsedMs)) return 0;

  const override = resolveConfiguredOverride();
  const rate =
    override === null
      ? tableMicrousdPerSecond(interval.vcpuCount)
      : override.ok
        ? override.microusdPerSecond
        : 0;
  const costCents = sandboxComputeCostCents(elapsedMs, rate);
  if (costCents <= 0) {
    unbilledMs += elapsedMs;
    const base = {
      env: E2B_COMPUTE_RATE_ENV,
      userId: interval.userId,
      sandboxId: interval.sandboxId,
      elapsedMs,
      unbilledMs,
    };
    if (override?.ok === false) {
      logger.error(
        base,
        '[e2b] sandbox compute is UNPRICED: the configured rate override is invalid, these seconds bill nothing and move no usage cap',
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
    // Metering runs from sandbox teardown and from the reclaim sweep, neither of
    // which carries a request connection, so the scope comes from the interval's
    // own owner.
    const db = createClaimedUserScopedDb(getNeonDb(), {
      userId: interval.userId,
      organizationId: null,
    });
    await CreditService.settleCreditsDurably(
      {
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
      },
      db,
    );
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
