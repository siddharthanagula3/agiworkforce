import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { validateInviteCode } from '../waitlistService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRpcClient(rpcResult: unknown) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  } as unknown as SupabaseClient;
}

// The RPC returns an array with one row (RETURNS TABLE in SQL)
function rpcRow(valid: boolean, invite_id: string | null, error: string | null) {
  return { data: [{ valid, invite_id, error }], error: null };
}

// ---------------------------------------------------------------------------
// validateInviteCode
// ---------------------------------------------------------------------------

describe('validateInviteCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid=true with inviteId for a successful redemption', async () => {
    const client = makeRpcClient(rpcRow(true, 'invite-uuid-1', null));

    const result = await validateInviteCode(client, 'VALID-CODE', 'web', 'connectors');

    expect(result.valid).toBe(true);
    expect(result.inviteId).toBe('invite-uuid-1');
    expect(result.error).toBeUndefined();
  });

  it('calls the RPC with uppercased and trimmed code', async () => {
    const client = makeRpcClient(rpcRow(true, 'invite-uuid-2', null));

    await validateInviteCode(client, '  valid-code  ', 'web', 'shared-links');

    expect(client.rpc).toHaveBeenCalledWith('validate_and_redeem_invite_code', {
      p_code: 'VALID-CODE',
      p_surface: 'web',
      p_source: 'shared-links',
    });
  });

  it('returns invalid_code error for an unknown code', async () => {
    const client = makeRpcClient(rpcRow(false, null, 'invalid_code'));

    const result = await validateInviteCode(client, 'BOGUS', 'web', 'connectors');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_code');
  });

  it('returns expired error for a code past its expiry date', async () => {
    const client = makeRpcClient(rpcRow(false, 'invite-uuid-3', 'expired'));

    const result = await validateInviteCode(client, 'OLD-CODE', 'web', 'connectors');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('expired');
  });

  it('returns fully_redeemed error when max_uses is exhausted', async () => {
    const client = makeRpcClient(rpcRow(false, 'invite-uuid-4', 'fully_redeemed'));

    const result = await validateInviteCode(client, 'USED-CODE', 'desktop', 'connectors');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('fully_redeemed');
  });

  it('returns already_redeemed_by_user when the same user redeems twice', async () => {
    const client = makeRpcClient(rpcRow(false, 'invite-uuid-5', 'already_redeemed_by_user'));

    const result = await validateInviteCode(client, 'MY-CODE', 'web', 'connectors');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('already_redeemed_by_user');
  });

  it('returns rpc_error when Supabase returns a transport/db error', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42P01', message: 'relation does not exist' },
      }),
    } as unknown as SupabaseClient;

    const result = await validateInviteCode(client, 'ANY-CODE', 'web', 'connectors');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('rpc_error');
  });
});
