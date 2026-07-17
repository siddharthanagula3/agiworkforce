import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export const MANAGED_CHAT_CONTRACT_VERSION = '2026-07-15' as const;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export class ManagedUsageRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly contractVersion: string = MANAGED_CHAT_CONTRACT_VERSION,
  ) {
    super(message);
    this.name = 'ManagedUsageRequestError';
  }
}

export interface ManagedUsageRequestReservation {
  db: DatabaseAdapter;
  userId: string;
  idempotencyKey: string;
  requestHash: string;
  leaseToken: string;
  estimatedCostCents: number;
}

export interface ManagedUsageFinalization {
  requestStatus: 'completed' | 'released' | 'outcome_unknown';
  operationResult: 'finalized' | 'already_finalized';
  settlementStatus: 'succeeded' | 'pending' | 'terminal' | null;
  actualCostCents: number;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) result[key] = canonicalize(entry);
    }
    return result;
  }
  return value;
}

export function parseManagedUsageIdempotencyKey(header: string | null): string {
  if (header === null) {
    throw new ManagedUsageRequestError(
      'Idempotency-Key header is required for Managed Cloud chat. Reuse the same key only when retrying the same request body.',
      400,
      'idempotency_key_required',
    );
  }
  const key = header.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ManagedUsageRequestError(
      'Idempotency-Key must be 8-128 characters using letters, digits, dot, underscore, colon, or hyphen.',
      400,
      'invalid_idempotency_key',
    );
  }
  return key;
}

export function fingerprintManagedUsageRequest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

async function queryOne(
  db: DatabaseAdapter,
  sql: string,
  params: unknown[],
): Promise<Record<string, unknown>> {
  try {
    const rows = await db.query<Record<string, unknown>>(sql, params);
    const row = rows[0];
    if (row) return row;
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) throw error;
  }
  throw new ManagedUsageRequestError(
    'Managed usage billing is temporarily unavailable.',
    503,
    'billing_unavailable',
  );
}

function reservationError(decision: string): ManagedUsageRequestError {
  switch (decision) {
    case 'in_progress':
      return new ManagedUsageRequestError(
        'An identical Managed Cloud request is already in progress.',
        409,
        'idempotency_in_progress',
      );
    case 'completed':
    case 'released':
    case 'outcome_unknown':
      return new ManagedUsageRequestError(
        'This idempotency key has already reached a terminal state. Start a deliberate new turn with a new key.',
        409,
        'idempotency_replay',
      );
    case 'conflict':
      return new ManagedUsageRequestError(
        'This idempotency key was already used for a different request body.',
        409,
        'idempotency_conflict',
      );
    case 'declined':
      return new ManagedUsageRequestError(
        'Usage budget exhausted for this billing period. Upgrade your plan or add credits.',
        402,
        'insufficient_credits',
      );
    default:
      return new ManagedUsageRequestError(
        'Managed usage billing is temporarily unavailable.',
        503,
        'billing_unavailable',
      );
  }
}

export async function reserveManagedUsageRequest(input: {
  db: DatabaseAdapter;
  userId: string;
  idempotencyKey: string;
  requestHash: string;
  provider: string;
  model: string;
  estimatedCostCents: number;
  leaseToken?: string;
  leaseSeconds?: number;
}): Promise<ManagedUsageRequestReservation> {
  const idempotencyKey = parseManagedUsageIdempotencyKey(input.idempotencyKey);
  const leaseToken = input.leaseToken ?? randomUUID();
  const row = await queryOne(
    input.db,
    `select * from public.reserve_managed_usage_request(
      $1::text, $2::text, $3::text, $4::text, $5::text, $6::integer, $7::text, $8::integer
    )`,
    [
      input.userId,
      idempotencyKey,
      input.requestHash,
      input.provider,
      input.model,
      input.estimatedCostCents,
      leaseToken,
      input.leaseSeconds ?? 900,
    ],
  );

  const decision =
    typeof row['reservation_decision'] === 'string' ? row['reservation_decision'] : '';
  if (decision !== 'acquired') throw reservationError(decision);
  if (
    row['request_status'] !== 'reserved' ||
    typeof row['lease_token'] !== 'string' ||
    typeof row['estimated_cost_cents'] !== 'number'
  ) {
    throw new ManagedUsageRequestError(
      'Managed usage billing returned an invalid reservation.',
      503,
      'billing_protocol_error',
    );
  }

  return {
    db: input.db,
    userId: input.userId,
    idempotencyKey,
    requestHash: input.requestHash,
    leaseToken: row['lease_token'],
    estimatedCostCents: row['estimated_cost_cents'],
  };
}

async function transition(
  reservation: ManagedUsageRequestReservation,
  functionName: 'mark_managed_usage_provider_started' | 'mark_managed_usage_client_delivered',
): Promise<void> {
  const row = await queryOne(
    reservation.db,
    `select * from public.${functionName}($1::text, $2::text, $3::text, $4::text)`,
    [
      reservation.userId,
      reservation.idempotencyKey,
      reservation.requestHash,
      reservation.leaseToken,
    ],
  );
  if (row['operation_result'] !== 'updated' && row['operation_result'] !== 'already_updated') {
    throw new ManagedUsageRequestError(
      'Managed usage lifecycle transition was rejected.',
      409,
      'billing_state_conflict',
    );
  }
}

export function markManagedUsageProviderStarted(
  reservation: ManagedUsageRequestReservation,
): Promise<void> {
  return transition(reservation, 'mark_managed_usage_provider_started');
}

export function markManagedUsageClientDelivered(
  reservation: ManagedUsageRequestReservation,
): Promise<void> {
  return transition(reservation, 'mark_managed_usage_client_delivered');
}

export async function finalizeManagedUsageRequest(
  input: ManagedUsageRequestReservation & {
    outcome: 'completed' | 'failed';
    actualCostCents: number;
    usage?: Record<string, unknown>;
  },
): Promise<ManagedUsageFinalization> {
  const actualCostCents = input.outcome === 'failed' ? 0 : Math.max(0, input.actualCostCents);
  const row = await queryOne(
    input.db,
    `select * from public.finalize_managed_usage_request(
      $1::text, $2::text, $3::text, $4::text, $5::text, $6::integer, $7::jsonb
    )`,
    [
      input.userId,
      input.idempotencyKey,
      input.requestHash,
      input.leaseToken,
      input.outcome,
      actualCostCents,
      JSON.stringify(input.usage ?? {}),
    ],
  );

  const requestStatus = row['request_status'];
  const operationResult = row['operation_result'];
  const settlementStatus = row['settlement_status'];
  if (
    (requestStatus !== 'completed' &&
      requestStatus !== 'released' &&
      requestStatus !== 'outcome_unknown') ||
    (operationResult !== 'finalized' && operationResult !== 'already_finalized') ||
    (settlementStatus !== null &&
      settlementStatus !== undefined &&
      settlementStatus !== 'succeeded' &&
      settlementStatus !== 'pending' &&
      settlementStatus !== 'terminal')
  ) {
    throw new ManagedUsageRequestError(
      'Managed usage billing returned an invalid finalization.',
      503,
      'billing_protocol_error',
    );
  }

  return {
    requestStatus,
    operationResult,
    settlementStatus: settlementStatus ?? null,
    actualCostCents:
      typeof row['actual_cost_cents'] === 'number' ? row['actual_cost_cents'] : actualCostCents,
  };
}
