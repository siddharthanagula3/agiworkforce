import 'server-only';

import { randomUUID } from 'node:crypto';

import { getProviderComputePricing, normalizeBillingPlanTier } from '@agiworkforce/types';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { ledgerCentsFromMicrousd } from '@/lib/services/credit-service';
import {
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  ManagedUsageRequestError,
  estimateMicrousdOf,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';

export const E2B_COMPUTE_RATE_ENV = 'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND';
const E2B_COMPUTE_PROVIDER_ID = 'e2b';

export const SANDBOX_COMPUTE_QUOTA_FEATURE = 'sandbox_compute';
const SANDBOX_COMPUTE_OPERATION = 'e2b_sandbox_compute';

/**
 * The sandbox pauses at its plan TTL, but the interval is only closed when the
 * pause is observed, which the reclaim sweep may do well after the fact. The
 * lease outlives that gap so an ordinary teardown settles its own reservation
 * rather than the recovery sweep refunding it first.
 */
const RESERVATION_LEASE_SLACK_SECONDS = 900;

const MICROUSD_PER_CENT = 10_000;
const USD_TO_MICROUSD = 1_000_000;
const MILLISECONDS_PER_SECOND = 1000;

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

/**
 * Sandbox seconds are priced in microUSD per second, so this is the exact
 * charge. Rounding it to cents before 0182 discarded every interval under
 * half a cent: those seconds billed nothing and moved no usage cap.
 */
export function sandboxComputeCostMicrousd(elapsedMs: number, microusdPerSecond: number): number {
  if (!isBillableInterval(elapsedMs)) return 0;
  if (microusdPerSecond <= 0) return 0;
  return Math.ceil((elapsedMs / MILLISECONDS_PER_SECOND) * microusdPerSecond);
}

export function sandboxComputeCostCents(elapsedMs: number, microusdPerSecond: number): number {
  return Math.round(sandboxComputeCostMicrousd(elapsedMs, microusdPerSecond) / MICROUSD_PER_CENT);
}

/**
 * What a reserved sandbox interval carries between provisioning and teardown.
 * It survives in the session record, so it holds only serialisable fields and
 * the scoped connection is rebuilt at settlement.
 */
export interface SandboxComputeReservationRecord {
  idempotencyKey: string;
  requestHash: string;
  leaseToken: string;
  estimatedCostMicrousd: number;
  provider: string;
  model: string;
}

export type SandboxComputeReservationOutcome =
  | { outcome: 'reserved'; reservation: SandboxComputeReservationRecord }
  | { outcome: 'refused'; error: ManagedUsageRequestError };

export interface SandboxComputeReservationInput {
  userId: string;
  planTier: string | null | undefined;
  templateId?: string | null;
  conversationId?: string | undefined;
  codeSessionId?: string | undefined;
  microusdPerSecond: number;
  ttlMs: number;
}

function sandboxScopedDb(userId: string): DatabaseAdapter {
  return createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
}

function reservationFailure(error: unknown): ManagedUsageRequestError {
  return error instanceof ManagedUsageRequestError
    ? error
    : new ManagedUsageRequestError(
        'Managed usage billing is temporarily unavailable.',
        503,
        'billing_unavailable',
      );
}

/**
 * Holds the sandbox's whole admitted lifetime against the account's credit and
 * usage caps BEFORE the sandbox exists. Provisioning is fail-closed here for
 * the same reason it is fail-closed on an unresolvable rate: seconds that
 * could not be reserved are seconds nobody agreed to pay for.
 */
export async function reserveSandboxComputeInterval(
  input: SandboxComputeReservationInput,
): Promise<SandboxComputeReservationOutcome> {
  const ttlSeconds = Math.max(1, Math.ceil(input.ttlMs / MILLISECONDS_PER_SECOND));
  const estimatedCostMicrousd = Math.ceil(ttlSeconds * Math.max(0, input.microusdPerSecond));
  const model = input.templateId?.trim() || E2B_COMPUTE_PROVIDER_ID;
  try {
    const reservation = await reserveManagedUsageRequest({
      db: sandboxScopedDb(input.userId),
      userId: input.userId,
      idempotencyKey: `agi.e2b.compute.${randomUUID()}`,
      requestHash: fingerprintManagedUsageRequest({
        operation: SANDBOX_COMPUTE_OPERATION,
        template: model,
        conversationId: input.conversationId ?? null,
        codeSessionId: input.codeSessionId ?? null,
        ttlSeconds,
      }),
      provider: E2B_COMPUTE_PROVIDER_ID,
      model,
      estimatedCostMicrousd,
      leaseSeconds: ttlSeconds + RESERVATION_LEASE_SLACK_SECONDS,
      planTier: normalizeBillingPlanTier(input.planTier),
      isFlagship: false,
      quotaFeature: SANDBOX_COMPUTE_QUOTA_FEATURE,
    });
    return {
      outcome: 'reserved',
      reservation: {
        idempotencyKey: reservation.idempotencyKey,
        requestHash: reservation.requestHash,
        leaseToken: reservation.leaseToken,
        estimatedCostMicrousd: estimateMicrousdOf(reservation),
        provider: E2B_COMPUTE_PROVIDER_ID,
        model,
      },
    };
  } catch (error) {
    const refusal = reservationFailure(error);
    logger.warn(
      {
        event: 'sandbox_compute_reservation_refused',
        userId: input.userId,
        code: refusal.code,
        status: refusal.status,
        estimatedCostMicrousd,
      },
      '[e2b] sandbox compute reservation refused; no sandbox is provisioned',
    );
    return { outcome: 'refused', error: refusal };
  }
}

/**
 * Gives back a reservation whose sandbox never ran. The ledger releases the
 * whole hold, so an account that was refused a sandbox by provisioning keeps
 * the credit the reservation was holding.
 */
export async function releaseSandboxComputeReservation(input: {
  userId: string;
  reservation: SandboxComputeReservationRecord;
  reason: string;
}): Promise<void> {
  try {
    await finalizeManagedUsageRequest({
      db: sandboxScopedDb(input.userId),
      userId: input.userId,
      idempotencyKey: input.reservation.idempotencyKey,
      requestHash: input.reservation.requestHash,
      leaseToken: input.reservation.leaseToken,
      estimatedCostMicrousd: input.reservation.estimatedCostMicrousd,
      estimatedCostCents: ledgerCentsFromMicrousd(input.reservation.estimatedCostMicrousd),
      quotaFeature: SANDBOX_COMPUTE_QUOTA_FEATURE,
      provider: input.reservation.provider,
      model: input.reservation.model,
      outcome: 'failed',
      actualCostMicrousd: 0,
      usage: { operation: SANDBOX_COMPUTE_OPERATION, reason: input.reason },
    });
  } catch (err) {
    logger.error(
      {
        err,
        userId: input.userId,
        idempotencyKey: input.reservation.idempotencyKey,
        reason: input.reason,
      },
      '[e2b] sandbox compute reservation could not be released; the lease recovery sweep will reclaim it',
    );
  }
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
  /**
   * The reservation this interval was admitted under. Without it the seconds
   * ran outside the reserve-then-settle contract and there is nothing to settle
   * against, which is a defect rather than a licence to bill unreserved.
   */
  reservation?: SandboxComputeReservationRecord | undefined;
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
  const metered = sandboxComputeCostMicrousd(elapsedMs, rate);
  if (metered <= 0) {
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
        '[e2b] sandbox interval priced at 0: these seconds bill nothing and move no usage cap',
      );
    }
    return 0;
  }

  const reservation = interval.reservation;
  if (!reservation) {
    unbilledMs += elapsedMs;
    logger.error(
      {
        userId: interval.userId,
        sandboxId: interval.sandboxId,
        elapsedMs,
        meteredMicrousd: metered,
        unbilledMs,
      },
      '[e2b] sandbox interval carries no credit reservation; its seconds are unbilled',
    );
    return 0;
  }

  // Settlement never exceeds what the account agreed to hold: the ledger
  // released nothing beyond the reservation, so charging past it would bill
  // credit that was never reserved.
  const costMicrousd = Math.min(metered, reservation.estimatedCostMicrousd);
  try {
    // Metering runs from sandbox teardown and from the reclaim sweep, neither of
    // which carries a request connection, so the scope comes from the interval's
    // own owner.
    await finalizeManagedUsageRequest({
      db: sandboxScopedDb(interval.userId),
      userId: interval.userId,
      idempotencyKey: reservation.idempotencyKey,
      requestHash: reservation.requestHash,
      leaseToken: reservation.leaseToken,
      estimatedCostMicrousd: reservation.estimatedCostMicrousd,
      estimatedCostCents: ledgerCentsFromMicrousd(reservation.estimatedCostMicrousd),
      quotaFeature: SANDBOX_COMPUTE_QUOTA_FEATURE,
      provider: reservation.provider,
      model: reservation.model,
      outcome: 'completed',
      actualCostMicrousd: costMicrousd,
      usage: {
        operation: SANDBOX_COMPUTE_OPERATION,
        sandbox_id: interval.sandboxId,
        ...(interval.conversationId ? { conversation_id: interval.conversationId } : {}),
        ...(interval.codeSessionId ? { code_session_id: interval.codeSessionId } : {}),
        elapsed_ms: elapsedMs,
        microusd_per_second: rate,
        close_reason: interval.reason,
        ...(metered > costMicrousd ? { metered_microusd: metered } : {}),
      },
    });
    logger.info(
      {
        userId: interval.userId,
        sandboxId: interval.sandboxId,
        elapsedMs,
        costMicrousd,
        reason: interval.reason,
      },
      '[e2b] sandbox compute settled against its reservation',
    );
    return costMicrousd;
  } catch (err) {
    logger.error(
      { err, userId: interval.userId, sandboxId: interval.sandboxId, elapsedMs, costMicrousd },
      '[e2b] sandbox compute could not be metered; seconds are unattributed',
    );
    return 0;
  }
}
