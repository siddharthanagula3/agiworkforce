import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  describeSeatReduction,
  getOrganizationSeatState,
  isDuplicateOwnerError,
  isOwnerlessOrganizationError,
  isSeatCeilingError,
  withSeatAccountingErrors,
} from '../organization-seat-service';

function mockDb(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue(rows);
  return { db: { query } as unknown as DatabaseAdapter, query };
}

/** The shape a Neon/pg driver produces for a failed CHECK constraint. */
function seatCeilingError() {
  const error = new Error(
    'new row for relation "organizations" violates check constraint "organizations_seats_within_license"',
  ) as Error & { code?: string; constraint?: string };
  error.code = '23514';
  error.constraint = 'organizations_seats_within_license';
  return error;
}

describe('getOrganizationSeatState', () => {
  it('reads the seat columns for exactly the named organization', async () => {
    const { db, query } = mockDb([
      {
        licensed_seats: 10,
        seats_consumed: 4,
        stripe_subscription_id: 'sub_123',
        owner_user_id: 'user-owner',
      },
    ]);

    const state = await getOrganizationSeatState(db, 'org-a');

    expect(query.mock.calls[0]?.[1]).toEqual(['org-a']);
    expect(query.mock.calls[0]?.[0]).toMatch(/where id = \$1/);
    expect(state).toEqual({
      organizationId: 'org-a',
      licensedSeats: 10,
      seatsConsumed: 4,
      seatsAvailable: 6,
      seatSource: 'billing',
      ownerUserId: 'user-owner',
    });
  });

  it('reports an unprovisioned seat count honestly when no subscription is linked', async () => {
    const { db } = mockDb([
      {
        licensed_seats: 3,
        seats_consumed: 3,
        stripe_subscription_id: null,
        owner_user_id: 'user-owner',
      },
    ]);

    const state = await getOrganizationSeatState(db, 'org-a');

    // The number still enforces the ceiling; it just cannot grow until billing
    // writes it. Claiming 'billing' here would misrepresent a purchase.
    expect(state?.seatSource).toBe('unprovisioned');
    expect(state?.seatsAvailable).toBe(0);
  });

  it('never reports negative availability when consumption exceeds the licence', async () => {
    const { db } = mockDb([
      {
        licensed_seats: 2,
        seats_consumed: 5,
        stripe_subscription_id: 'sub_1',
        owner_user_id: null,
      },
    ]);

    const state = await getOrganizationSeatState(db, 'org-a');
    expect(state?.seatsAvailable).toBe(0);
  });

  it('parses the string counts a pg driver may return for integer columns', async () => {
    const { db } = mockDb([
      {
        licensed_seats: '25',
        seats_consumed: '7',
        stripe_subscription_id: null,
        owner_user_id: null,
      },
    ]);

    const state = await getOrganizationSeatState(db, 'org-a');
    expect(state?.licensedSeats).toBe(25);
    expect(state?.seatsConsumed).toBe(7);
    expect(state?.seatsAvailable).toBe(18);
  });

  it('returns null when the organization is not visible to this connection', async () => {
    const { db } = mockDb([]);
    await expect(getOrganizationSeatState(db, 'org-b')).resolves.toBeNull();
  });
});

describe('seat error classification', () => {
  it('recognises the seat ceiling from the constraint name', () => {
    expect(isSeatCeilingError(seatCeilingError())).toBe(true);
  });

  it('recognises the seat ceiling when only the message carries the constraint', () => {
    const error = new Error(
      'violates check constraint "organizations_seats_within_license"',
    ) as Error & { code?: string };
    error.code = '23514';
    expect(isSeatCeilingError(error)).toBe(true);
  });

  it('does NOT treat an unrelated check violation as a seat problem', () => {
    // Reporting "buy more seats" for, say, a resend_count violation would send
    // the customer to the wrong remedy.
    const error = new Error(
      'violates check constraint "organization_invitations_resend_count_check"',
    ) as Error & { code?: string };
    error.code = '23514';
    expect(isSeatCeilingError(error)).toBe(false);
  });

  it('recognises the deferred last-owner trigger', () => {
    expect(
      isOwnerlessOrganizationError(new Error('organization abc would be left without an owner')),
    ).toBe(true);
    expect(isOwnerlessOrganizationError(new Error('some other failure'))).toBe(false);
  });

  it('recognises the single-owner unique index', () => {
    const error = new Error(
      'duplicate key value violates unique constraint "idx_org_members_single_owner"',
    ) as Error & { code?: string };
    error.code = '23505';
    expect(isDuplicateOwnerError(error)).toBe(true);
  });
});

describe('withSeatAccountingErrors', () => {
  it('passes the value through when the mutation succeeds', async () => {
    await expect(withSeatAccountingErrors(async () => 'ok')).resolves.toBe('ok');
  });

  it('turns the ceiling abort into an actionable 409, never a 500', async () => {
    // This is the concurrent case: the loser of the row-lock race re-evaluates
    // the CHECK against the committed value and aborts with 23514.
    await expect(
      withSeatAccountingErrors(async () => {
        throw seatCeilingError();
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/no licensed seats available/i),
    });
  });

  it('turns an orphaned-organization abort into a transfer-ownership instruction', async () => {
    await expect(
      withSeatAccountingErrors(async () => {
        throw new Error('organization abc would be left without an owner');
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/transfer ownership/i),
    });
  });

  it('rethrows anything it does not recognise instead of mislabelling it', async () => {
    const unrelated = new Error('connection reset');
    await expect(
      withSeatAccountingErrors(async () => {
        throw unrelated;
      }),
    ).rejects.toBe(unrelated);
  });
});

describe('describeSeatReduction', () => {
  it('says exactly how many seats must be freed before a downgrade', () => {
    const state = {
      organizationId: 'org-a',
      licensedSeats: 10,
      seatsConsumed: 8,
      seatsAvailable: 2,
      seatSource: 'billing' as const,
      ownerUserId: 'owner',
    };
    expect(describeSeatReduction(state, 5)).toBe(
      'Remove 3 members or pending invitations before reducing to 5 seats.',
    );
    expect(describeSeatReduction(state, 1)).toContain('reducing to 1 seat.');
    expect(describeSeatReduction(state, 8)).toBe('');
  });
});
