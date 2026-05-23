import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/supabase', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from '@/lib/supabase';
import { redeemInviteCode, joinWaitlist } from '../services/waitlistServiceClient';

const mockGetSupabase = vi.mocked(getSupabase);

function makeMockClient(overrides: Record<string, unknown> = {}): SupabaseClient {
  const rpc = vi.fn();
  const upsert = vi.fn();
  const from = vi.fn(() => ({ upsert }));
  const getSession = vi.fn();
  const signInAnonymously = vi.fn();

  return {
    auth: { getSession, signInAnonymously },
    rpc,
    from,
    ...overrides,
  } as unknown as SupabaseClient;
}

describe('redeemInviteCode', () => {
  let client: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    client = makeMockClient();
    mockGetSupabase.mockReturnValue(client as unknown as ReturnType<typeof getSupabase>);
  });

  it('returns anon_signin_failed when signInAnonymously fails and no session', async () => {
    (client.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
    });
    (client.auth.signInAnonymously as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: new Error('fail'),
    });

    const result = await redeemInviteCode('ABCDEF', 'connectors');
    expect(result).toEqual({ success: false, error: 'anon_signin_failed' });
  });

  it('calls RPC with uppercased code after existing session', async () => {
    (client.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    });
    (client.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ valid: true, invite_id: 'inv-abc', error: null }],
      error: null,
    });

    const result = await redeemInviteCode('abcdef', 'connectors');
    expect(client.rpc).toHaveBeenCalledWith('validate_and_redeem_invite_code', {
      p_code: 'ABCDEF',
      p_surface: 'web',
      p_source: 'connectors',
    });
    expect(result).toEqual({ success: true, inviteId: 'inv-abc' });
  });

  it('returns rpc_error on Supabase transport error', async () => {
    (client.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    });
    (client.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'network error', code: '500' },
    });

    const result = await redeemInviteCode('ABCDEF', 'connectors');
    expect(result).toEqual({ success: false, error: 'rpc_error' });
  });

  it('returns typed error from RPC on invalid_code', async () => {
    (client.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    });
    (client.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ valid: false, invite_id: null, error: 'invalid_code' }],
      error: null,
    });

    const result = await redeemInviteCode('ABCDEF', 'connectors');
    expect(result).toEqual({ success: false, error: 'invalid_code' });
  });

  it('signs in anonymously when no existing session then calls RPC', async () => {
    (client.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
    });
    (client.auth.signInAnonymously as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
    });
    (client.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ valid: true, invite_id: 'inv-xyz', error: null }],
      error: null,
    });

    const result = await redeemInviteCode('ABCDEF', 'web-search');
    expect(client.auth.signInAnonymously).toHaveBeenCalled();
    expect(result).toEqual({ success: true, inviteId: 'inv-xyz' });
  });
});

describe('joinWaitlist', () => {
  let client: ReturnType<typeof makeMockClient>;
  let upsert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    client = {
      ...makeMockClient(),
      from,
    } as unknown as ReturnType<typeof makeMockClient>;
    mockGetSupabase.mockReturnValue(client as unknown as ReturnType<typeof getSupabase>);
  });

  it('returns success on upsert without error', async () => {
    const result = await joinWaitlist({ email: 'test@example.com' });
    expect(result).toEqual({ success: true });
  });

  it('normalizes email to lowercase', async () => {
    await joinWaitlist({ email: 'TEST@EXAMPLE.COM' });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com' }),
      expect.anything(),
    );
  });

  it('maps InviteCodeSource values outside allowed set to other', async () => {
    await joinWaitlist({ email: 'a@b.com', referralSource: 'connectors' });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'other' }),
      expect.anything(),
    );
  });

  it('passes byok source through', async () => {
    await joinWaitlist({ email: 'a@b.com', referralSource: 'byok' });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'byok' }),
      expect.anything(),
    );
  });

  it('returns error message on upsert failure', async () => {
    upsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });
    const result = await joinWaitlist({ email: 'a@b.com' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed to join/i);
  });
});
