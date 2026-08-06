/**
 * @file organization-seat-service.ts
 *
 * Licensed-seat accounting for organizations.
 *
 * # Where the ceiling actually lives
 *
 * NOT here. `organizations.seats_consumed <= licensed_seats` is a table CHECK
 * (0085_organization_seats_lifecycle.sql) and `seats_consumed` is moved only by
 * AFTER triggers on `organization_members` and `organization_invitations`.
 * Every seat grant therefore serializes on the single organization row and the
 * loser aborts with SQLSTATE 23514.
 *
 * This module exists to (a) READ the seat state for display and (b) translate
 * that 23514 into an actionable 409 instead of a 500. It must never UPDATE
 * `seats_consumed` or `licensed_seats` — the database rejects that from the
 * application role outright.
 *
 * # Client injection contract
 *
 * All functions are USER-CONTEXT and accept `db: DatabaseAdapter`. They never
 * construct their own connection. See lib/services/README.md.
 */
import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import type { OrganizationSeatColumns } from '@/lib/server/neon-types';

/** PostgreSQL `check_violation`. */
export const PG_CHECK_VIOLATION = '23514';
/** PostgreSQL `unique_violation`. */
export const PG_UNIQUE_VIOLATION = '23505';

export interface OrganizationSeatState {
  organizationId: string;
  licensedSeats: number;
  seatsConsumed: number;
  seatsAvailable: number;
  /**
   * Honest provenance of `licensedSeats`.
   *
   * `billing` — a Stripe subscription is linked to this organization and the
   * seat quantity came from it.
   * `unprovisioned` — no subscription is linked yet, so the number is the
   * migration's behaviour-preserving floor (the member count at apply time,
   * minimum 1). It can hold the line but cannot grow until the checkout /
   * webhook path writes `organizations.licensed_seats`.
   */
  seatSource: 'billing' | 'unprovisioned';
  ownerUserId: string | null;
}

type SeatQueryRow = Pick<
  OrganizationSeatColumns,
  'licensed_seats' | 'seats_consumed' | 'stripe_subscription_id' | 'owner_user_id'
>;

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Read the seat state for one organization.
 *
 * Returns null when the organization does not exist OR is not visible to the
 * caller's connection — callers must already have proved membership, so a null
 * here is a 404/403 decision for the route, never a reason to skip the check.
 */
export async function getOrganizationSeatState(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<OrganizationSeatState | null> {
  const [row] = await db.query<SeatQueryRow>(
    `select licensed_seats, seats_consumed, stripe_subscription_id, owner_user_id
       from public.organizations
      where id = $1
      limit 1`,
    [organizationId],
  );

  if (!row) return null;

  const licensedSeats = toNumber(row.licensed_seats, 1);
  const seatsConsumed = toNumber(row.seats_consumed, 0);

  return {
    organizationId,
    licensedSeats,
    seatsConsumed,
    seatsAvailable: Math.max(0, licensedSeats - seatsConsumed),
    seatSource: row.stripe_subscription_id ? 'billing' : 'unprovisioned',
    ownerUserId: row.owner_user_id ?? null,
  };
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as Record<string, unknown>)['code'];
  return typeof code === 'string' ? code : undefined;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.message} ${String(error.cause ?? '')}`;
  return String(error);
}

/**
 * True when the failure is the seat ceiling firing.
 *
 * The Neon HTTP driver does not always surface `constraint` on the error, so
 * the constraint name is also matched textually. Both signals are specific to
 * `organizations_seats_within_license`; a generic 23514 from another table is
 * deliberately NOT treated as a seat error.
 */
export function isSeatCeilingError(error: unknown): boolean {
  const constraintName = 'organizations_seats_within_license';
  if (!error || typeof error !== 'object') return false;
  const constraint = (error as Record<string, unknown>)['constraint'];
  if (constraint === constraintName) return true;
  if (errorCode(error) !== PG_CHECK_VIOLATION) return false;
  return errorText(error).includes(constraintName);
}

/** True when the last-owner constraint trigger rejected the transaction. */
export function isOwnerlessOrganizationError(error: unknown): boolean {
  return errorText(error).includes('would be left without an owner');
}

/** True when the at-most-one-owner partial unique index rejected the write. */
export function isDuplicateOwnerError(error: unknown): boolean {
  if (errorCode(error) !== PG_UNIQUE_VIOLATION) return false;
  return errorText(error).includes('idx_org_members_single_owner');
}

/**
 * Run a seat-consuming mutation and convert the database's verdicts into
 * actionable HTTP errors.
 *
 * Deliberately NOT a read-then-write: the caller's callback performs the
 * INSERT and the database decides. Two admins racing for the last seat both
 * reach the UPDATE inside the trigger, the second blocks on the organization
 * row lock, re-evaluates the CHECK against the committed value and lands here
 * as a 409.
 */
export async function withSeatAccountingErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isSeatCeilingError(error)) {
      throw createError.conflict(
        'This organization has no licensed seats available. Free a seat by removing a member or revoking a pending invitation, or purchase more seats.',
      );
    }
    if (isOwnerlessOrganizationError(error)) {
      throw createError.conflict(
        'Transfer ownership to another member before removing or demoting the organization owner.',
      );
    }
    if (isDuplicateOwnerError(error)) {
      throw createError.conflict(
        'This organization already has an owner. Use the transfer-ownership flow instead of assigning a second owner.',
      );
    }
    throw error;
  }
}

/**
 * Explain a seat-reduction refusal.
 *
 * `licensed_seats` is written by billing provisioning, and the same CHECK that
 * blocks over-consumption blocks a downgrade below the occupied count. That
 * must read as an actionable 409, not a 500, wherever it surfaces.
 */
export function describeSeatReduction(state: OrganizationSeatState, nextSeats: number): string {
  const excess = state.seatsConsumed - nextSeats;
  if (excess <= 0) return '';
  return `Remove ${excess} member${excess === 1 ? '' : 's'} or pending invitation${
    excess === 1 ? '' : 's'
  } before reducing to ${nextSeats} seat${nextSeats === 1 ? '' : 's'}.`;
}
