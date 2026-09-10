import 'server-only';

import { getProviderComputePricing } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { CreditService } from '@/lib/services/credit-service';

export const E2B_COMPUTE_RATE_ENV = 'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND';
const E2B_COMPUTE_PROVIDER_ID = 'e2b';

const MICROUSD_PER_CENT = 10_000;
const USD_TO_MICROUSD = 1_000_000;

const MAX_BILLABLE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** E2B's own default sandbox size when a template does not declare one. */
const DEFAULT_E2B_VCPU_COUNT = 2;
const DEFAULT_E2B_MEMORY_GIB = 4;

let unbilledMs = 0;

export interface SandboxComputeShape {
  vcpuCount?: number | null;
  memoryGib?: number | null;
}

type ConfiguredRate = { ok: true; microusdPerSecond: number } | { ok: false };

function resolveConfiguredOverride(): ConfiguredRate | null {
  const raw = process.env[E2B_COMPUTE_RATE_ENV];
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.error(
      { env: E2B_COMPUTE_RATE_ENV, value: raw },
      '[e2b] invalid sandbox compute rate override; falling back to the declared compute pricing',
    );
    return { ok: false };
  }
  return { ok: true, microusdPerSecond: parsed };
}

function positiveOr(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && value > 0 ? value : fallback;
}

function tableRate(shape: SandboxComputeShape | undefined): ConfiguredRate {
  const declared = getProviderComputePricing(E2B_COMPUTE_PROVIDER_ID);
  if (!declared || !(declared.ratePerUnit > 0) || !(Number(declared.ramRatePerGibSecond) > 0)) {
    logger.error(
      { provider: E2B_COMPUTE_PROVIDER_ID },
      '[e2b] compute pricing declares no vCPU and memory rate pair; refusing to price sandbox compute',
    );
    return { ok: false };
  }
  const vcpuCount = positiveOr(shape?.vcpuCount, DEFAULT_E2B_VCPU_COUNT);
  const memoryGib = positiveOr(shape?.memoryGib, DEFAULT_E2B_MEMORY_GIB);
  const cpuMicrousdPerSecond = vcpuCount * declared.ratePerUnit * USD_TO_MICROUSD;
  const ramMicrousdPerSecond =
    memoryGib * (declared.ramRatePerGibSecond as number) * USD_TO_MICROUSD;
  return { ok: true, microusdPerSecond: Math.round(cpuMicrousdPerSecond + ramMicrousdPerSecond) };
}

function resolveRate(shape?: SandboxComputeShape): ConfiguredRate {
  const override = resolveConfiguredOverride();
  if (override?.ok) return override;
  return tableRate(shape);
}

export function sandboxComputeIsPriceable(): boolean {
  return resolveRate().ok;
}

/**
 * The rate a sandbox of this shape is billed at, in microUSD per second of
 * sandbox life: vCPU seconds and memory seconds are separate published rates
 * and a sandbox pays both for as long as it exists.
 */
export function getSandboxComputeMicrousdPerSecond(shape?: SandboxComputeShape): number {
  const resolved = resolveRate(shape);
  return resolved.ok ? resolved.microusdPerSecond : 0;
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
  memoryGib?: number | undefined;
  /**
   * The rate snapshotted onto the sandbox when it was provisioned. Settling
   * from it keeps a sandbox on the terms it was admitted under, and keeps a
   * later catalog or override change from repricing seconds already run.
   */
  snapshotMicrousdPerSecond?: number | undefined;
  startedAtMs: number;
  endedAtMs: number;
  reason: 'pause' | 'kill' | 'reclaim';
}

export async function meterSandboxComputeInterval(
  interval: SandboxComputeInterval,
): Promise<number> {
  const elapsedMs = interval.endedAtMs - interval.startedAtMs;
  if (!isBillableInterval(elapsedMs)) return 0;

  const snapshot = interval.snapshotMicrousdPerSecond;
  const resolved: ConfiguredRate =
    typeof snapshot === 'number' && snapshot > 0
      ? { ok: true, microusdPerSecond: snapshot }
      : resolveRate({ vcpuCount: interval.vcpuCount, memoryGib: interval.memoryGib });
  const rate = resolved.ok ? resolved.microusdPerSecond : 0;
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
    if (!resolved.ok) {
      logger.error(
        base,
        '[e2b] sandbox compute is UNPRICED: neither a provisioning snapshot nor the declared compute pricing resolved a rate, these seconds bill nothing and move no usage cap',
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
