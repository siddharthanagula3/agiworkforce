import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import type { OrganizationSeatColumns } from '@/lib/server/neon-types';

export const PG_CHECK_VIOLATION = '23514';
export const PG_UNIQUE_VIOLATION = '23505';

export interface OrganizationSeatState {
  organizationId: string;
  licensedSeats: number;
  seatsConsumed: number;
  seatsAvailable: number;
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

export function isSeatCeilingError(error: unknown): boolean {
  const constraintName = 'organizations_seats_within_license';
  if (!error || typeof error !== 'object') return false;
  const constraint = (error as Record<string, unknown>)['constraint'];
  if (constraint === constraintName) return true;
  if (errorCode(error) !== PG_CHECK_VIOLATION) return false;
  return errorText(error).includes(constraintName);
}

export function isOwnerlessOrganizationError(error: unknown): boolean {
  return errorText(error).includes('would be left without an owner');
}

export function isDuplicateOwnerError(error: unknown): boolean {
  if (errorCode(error) !== PG_UNIQUE_VIOLATION) return false;
  return errorText(error).includes('idx_org_members_single_owner');
}

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

export function describeSeatReduction(state: OrganizationSeatState, nextSeats: number): string {
  const excess = state.seatsConsumed - nextSeats;
  if (excess <= 0) return '';
  return `Remove ${excess} member${excess === 1 ? '' : 's'} or pending invitation${
    excess === 1 ? '' : 's'
  } before reducing to ${nextSeats} seat${nextSeats === 1 ? '' : 's'}.`;
}
