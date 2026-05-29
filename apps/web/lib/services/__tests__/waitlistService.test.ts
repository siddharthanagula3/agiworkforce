import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(),
}));

import { validateInviteCode, joinWaitlist } from '../waitlistService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(queryResult?: unknown, executeResult?: number): DatabaseAdapter {
  return {
    query: vi.fn().mockResolvedValue(queryResult ?? []),
    execute: vi.fn().mockResolvedValue(executeResult ?? 0),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter;
}

// The RPC returns an array with one row (RETURNS TABLE in SQL)
function rpcRow(valid: boolean, invite_id: string | null, error: string | null) {
  return [{ valid, invite_id, error }];
}

// ---------------------------------------------------------------------------
// validateInviteCode
// ---------------------------------------------------------------------------

describe('validateInviteCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid=true with inviteId for a successful redemption', async () => {
    const db = makeDb(rpcRow(true, 'invite-uuid-1', null));

    const result = await validateInviteCode(db, 'VALID-CODE', 'web', 'connectors');

    expect(result.valid).toBe(true);
    expect(result.inviteId).toBe('invite-uuid-1');
    expect(result.error).toBeUndefined();
  });

  it('calls the RPC with uppercased and trimmed code', async () => {
    const db = makeDb(rpcRow(true, 'invite-uuid-2', null));

    await validateInviteCode(db, '  valid-code  ', 'web', 'shared-links');

    expect(db.query).toHaveBeenCalledWith(
      'SELECT * FROM validate_and_redeem_invite_code($1, $2, $3)',
      ['VALID-CODE', 'web', 'shared-links'],
    );
  });

  it('returns invalid_code error for an unknown code', async () => {
    const db = makeDb(rpcRow(false, null, 'invalid_code'));

    const result = await validateInviteCode(db, 'BOGUS', 'web', 'connectors');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_code');
  });

  it('returns expired error for a code past its expiry date', async () => {
    const db = makeDb(rpcRow(false, 'invite-uuid-3', 'expired'));

    const result = await validateInviteCode(db, 'OLD-CODE', 'web', 'connectors');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('expired');
  });

  it('returns fully_redeemed error when max_uses is exhausted', async () => {
    const db = makeDb(rpcRow(false, 'invite-uuid-4', 'fully_redeemed'));

    const result = await validateInviteCode(db, 'USED-CODE', 'desktop', 'connectors');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('fully_redeemed');
  });

  it('returns already_redeemed_by_user when the same user redeems twice', async () => {
    const db = makeDb(rpcRow(false, 'invite-uuid-5', 'already_redeemed_by_user'));

    const result = await validateInviteCode(db, 'MY-CODE', 'web', 'connectors');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('already_redeemed_by_user');
  });

  it('returns rpc_error when the db throws', async () => {
    const db = {
      query: vi.fn().mockRejectedValue({ code: '42P01', message: 'relation does not exist' }),
      execute: vi.fn(),
      transaction: vi.fn(),
      withUser: vi.fn(),
      dispose: vi.fn(),
    } as unknown as DatabaseAdapter;

    const result = await validateInviteCode(db, 'ANY-CODE', 'web', 'connectors');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('rpc_error');
  });
});

// ---------------------------------------------------------------------------
// joinWaitlist
// ---------------------------------------------------------------------------

describe('joinWaitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success=true on a successful insert', async () => {
    const db = makeDb(undefined, 1);

    const result = await joinWaitlist(db, { email: 'test@example.com' });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('stores the normalized email so launch emails can be sent', async () => {
    const db = makeDb(undefined, 1);

    await joinWaitlist(db, { email: 'TEST@EXAMPLE.COM' });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_managed_waitlist'),
      ['test@example.com', 'other'],
    );
  });

  it('returns success=false and an error message on db error', async () => {
    const db = {
      query: vi.fn(),
      execute: vi.fn().mockRejectedValue(new Error('db error')),
      transaction: vi.fn(),
      withUser: vi.fn(),
      dispose: vi.fn(),
    } as unknown as DatabaseAdapter;

    const result = await joinWaitlist(db, { email: 'a@b.com' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to join waitlist. Please try again.');
  });
});
