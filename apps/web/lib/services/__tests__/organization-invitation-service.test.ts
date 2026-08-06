import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  acceptInvitation,
  createInvitation,
  createInvitationCredential,
  declineInvitation,
  expirePendingInvitations,
  formatInvitation,
  hashInvitationToken,
  normalizeInvitationEmail,
  resendInvitation,
  revokeInvitation,
} from '../organization-invitation-service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

function invitationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    organization_id: ORG_A,
    email: 'invitee@example.com',
    role: 'member',
    status: 'pending',
    token_hash: 'hash',
    invited_by_user_id: 'admin-user',
    accepted_by_user_id: null,
    expires_at: '2026-08-12T00:00:00.000Z',
    resent_at: null,
    resend_count: 0,
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

function harness() {
  const query = vi.fn();
  const execute = vi.fn().mockResolvedValue(1);
  const tx = { query, execute } as unknown as DatabaseAdapter;
  const transaction = vi.fn(async (fn: (t: DatabaseAdapter) => Promise<unknown>) => fn(tx));
  const db = { query, execute, transaction } as unknown as DatabaseAdapter;
  return { db, query, execute, transaction };
}

/** Every SQL string the code sent, lowercased, in order. */
function sqlCalls(query: ReturnType<typeof vi.fn>): string[] {
  return query.mock.calls.map(([sql]) => String(sql).toLowerCase());
}

describe('invitation tokens', () => {
  it('mints a high-entropy token and stores only its sha256', () => {
    const credential = createInvitationCredential(Date.parse('2026-08-05T00:00:00.000Z'));

    // 32 random bytes, base64url encoded.
    expect(credential.token.length).toBeGreaterThanOrEqual(43);
    expect(credential.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(credential.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(credential.tokenHash).not.toContain(credential.token);
    expect(hashInvitationToken(credential.token)).toBe(credential.tokenHash);
    // Seven-day TTL.
    expect(credential.expiresAt).toBe('2026-08-12T00:00:00.000Z');
  });

  it('produces a different token every time', () => {
    const first = createInvitationCredential();
    const second = createInvitationCredential();
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).not.toBe(second.tokenHash);
  });

  it('never exposes the token hash in the public projection', () => {
    const projection = formatInvitation(invitationRow() as never);
    expect(projection).not.toHaveProperty('token_hash');
    expect(projection).not.toHaveProperty('tokenHash');
    expect(JSON.stringify(projection)).not.toContain('hash');
  });

  it('lowercases addresses so casing cannot buy a second seat', () => {
    expect(normalizeInvitationEmail('  Invitee@Example.COM ')).toBe('invitee@example.com');
  });
});

describe('createInvitation', () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    h = harness();
  });

  it('takes the members lock, expires lapsed invitations, then inserts one pending row', async () => {
    h.query
      .mockResolvedValueOnce([]) // advisory lock
      .mockResolvedValueOnce([]) // already-member probe
      .mockResolvedValueOnce([]) // pending probe
      .mockResolvedValueOnce([invitationRow()]); // insert returning
    h.execute.mockResolvedValueOnce(0); // expirePendingInvitations

    const result = await createInvitation(h.db, {
      organizationId: ORG_A,
      email: 'Invitee@Example.com',
      role: 'member',
      invitedByUserId: 'admin-user',
    });

    const calls = sqlCalls(h.query);
    expect(calls[0]).toContain('pg_advisory_xact_lock');
    expect(String(h.execute.mock.calls[0]?.[0]).toLowerCase()).toContain("status = 'expired'");
    // The INSERT is what consumes the seat; there is deliberately no count read.
    expect(calls.some((sql) => sql.includes('select count'))).toBe(false);
    expect(calls.at(-1)).toContain('insert into public.organization_invitations');

    const insertParams = h.query.mock.calls.at(-1)?.[1] as unknown[];
    expect(insertParams[0]).toBe(ORG_A);
    expect(insertParams[1]).toBe('invitee@example.com');
    // The hash is persisted; the raw token is not.
    expect(insertParams[3]).toBe(hashInvitationToken(result.token));
    expect(insertParams).not.toContain(result.token);
  });

  it('refuses before consuming a seat when the address is already a member', async () => {
    h.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ user_id: 'existing-user' }]);

    await expect(
      createInvitation(h.db, {
        organizationId: ORG_A,
        email: 'invitee@example.com',
        role: 'member',
        invitedByUserId: 'admin-user',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    // No INSERT ran, so no seat was burned on a no-op.
    expect(sqlCalls(h.query).some((sql) => sql.includes('insert into'))).toBe(false);
  });

  it('refuses a duplicate pending invitation instead of holding two seats', async () => {
    h.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'existing-invite' }]);

    await expect(
      createInvitation(h.db, {
        organizationId: ORG_A,
        email: 'invitee@example.com',
        role: 'member',
        invitedByUserId: 'admin-user',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/already pending/i),
    });
    expect(sqlCalls(h.query).some((sql) => sql.includes('insert into'))).toBe(false);
  });

  it('maps the database seat ceiling onto a 409 rather than a 500', async () => {
    const ceiling = new Error(
      'violates check constraint "organizations_seats_within_license"',
    ) as Error & { code?: string; constraint?: string };
    ceiling.code = '23514';
    ceiling.constraint = 'organizations_seats_within_license';

    h.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(ceiling);

    await expect(
      createInvitation(h.db, {
        organizationId: ORG_A,
        email: 'invitee@example.com',
        role: 'member',
        invitedByUserId: 'admin-user',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/no licensed seats available/i),
    });
  });
});

describe('resendInvitation', () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    h = harness();
  });

  it('updates the existing row with a fresh token instead of creating a second one', async () => {
    h.execute.mockResolvedValueOnce(0);
    h.query
      .mockResolvedValueOnce([invitationRow()])
      .mockResolvedValueOnce([invitationRow({ resend_count: 1 })]);

    const result = await resendInvitation(h.db, ORG_A, invitationRow().id);

    const calls = sqlCalls(h.query);
    expect(calls.some((sql) => sql.includes('insert into'))).toBe(false);
    expect(calls.at(-1)).toContain('update public.organization_invitations');
    expect(calls.at(-1)).toContain('resend_count = resend_count + 1');
    // Both predicates: an id from another org can never be resent.
    expect(calls.at(-1)).toContain('organization_id = $4');
    expect(h.query.mock.calls.at(-1)?.[1]).toEqual([
      hashInvitationToken(result.token),
      expect.any(String),
      invitationRow().id,
      ORG_A,
    ]);
  });

  it('refuses to resend an invitation that already reached a terminal status', async () => {
    h.execute.mockResolvedValueOnce(0);
    h.query.mockResolvedValueOnce([invitationRow({ status: 'accepted' })]);

    await expect(resendInvitation(h.db, ORG_A, invitationRow().id)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/accepted/i),
    });
  });

  it('refuses once the resend ceiling is reached', async () => {
    h.execute.mockResolvedValueOnce(0);
    h.query.mockResolvedValueOnce([invitationRow({ resend_count: 10 })]);

    await expect(resendInvitation(h.db, ORG_A, invitationRow().id)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('404s for an invitation belonging to another organization', async () => {
    h.execute.mockResolvedValueOnce(0);
    h.query.mockResolvedValueOnce([]); // (id, ORG_B) matches nothing

    await expect(resendInvitation(h.db, ORG_B, invitationRow().id)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(h.query.mock.calls[0]?.[1]).toEqual([invitationRow().id, ORG_B]);
  });
});

describe('revokeInvitation', () => {
  it('flips a pending invitation to revoked, releasing its seat through the trigger', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([invitationRow({ status: 'revoked' })]);

    const revoked = await revokeInvitation(h.db, ORG_A, invitationRow().id);

    expect(revoked.status).toBe('revoked');
    const sql = sqlCalls(h.query)[0]!;
    expect(sql).toContain("set status = 'revoked'");
    expect(sql).toContain("status = 'pending'");
    expect(h.query.mock.calls[0]?.[1]).toEqual([invitationRow().id, ORG_A]);
  });

  it('reports the real reason when the invitation is no longer pending', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ status: 'accepted' }]);

    await expect(revokeInvitation(h.db, ORG_A, invitationRow().id)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/already accepted/i),
    });
  });

  it('404s for an id that is not in this organization', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(revokeInvitation(h.db, ORG_B, invitationRow().id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('acceptInvitation', () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    h = harness();
  });

  it('looks the invitation up by token hash alone and never by a client-supplied org', async () => {
    h.query
      .mockResolvedValueOnce([invitationRow()]) // token lookup
      .mockResolvedValueOnce([]) // advisory lock
      .mockResolvedValueOnce([]) // existing membership probe
      .mockResolvedValueOnce([
        invitationRow({ status: 'accepted', accepted_by_user_id: 'new-user' }),
      ]);

    await acceptInvitation(h.db, {
      token: 'raw-token-value-that-is-long-enough',
      userId: 'new-user',
      userEmail: 'Invitee@Example.com',
    });

    const lookup = sqlCalls(h.query)[0]!;
    expect(lookup).toContain('token_hash = $1');
    expect(lookup).toContain("status = 'pending'");
    expect(lookup).toContain('expires_at > now()');
    expect(h.query.mock.calls[0]?.[1]).toEqual([
      hashInvitationToken('raw-token-value-that-is-long-enough'),
    ]);
  });

  it('releases the invitation seat BEFORE consuming a membership seat', async () => {
    h.query
      .mockResolvedValueOnce([invitationRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        invitationRow({ status: 'accepted', accepted_by_user_id: 'new-user' }),
      ]);

    await acceptInvitation(h.db, {
      token: 'raw-token-value-that-is-long-enough',
      userId: 'new-user',
      userEmail: 'invitee@example.com',
    });

    // The organizations_seats_within_license CHECK is IMMEDIATE and cannot be
    // deferred, so inserting the member first would transiently reach
    // seats_consumed + 1 and abort on a fully-licensed organization.
    const acceptSql = sqlCalls(h.query).findIndex((sql) => sql.includes("set status = 'accepted'"));
    expect(acceptSql).toBeGreaterThan(-1);
    expect(h.execute).toHaveBeenCalledTimes(1);
    expect(String(h.execute.mock.calls[0]?.[0]).toLowerCase()).toContain(
      'insert into public.organization_members',
    );
    // The accepting UPDATE was issued before the membership INSERT.
    expect(h.query.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      h.execute.mock.invocationCallOrder[0]!,
    );
  });

  it('binds the membership to the AUTHENTICATED user, not to the invited string', async () => {
    h.query
      .mockResolvedValueOnce([invitationRow({ role: 'admin' })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        invitationRow({ role: 'admin', status: 'accepted', accepted_by_user_id: 'new-user' }),
      ]);

    const result = await acceptInvitation(h.db, {
      token: 'raw-token-value-that-is-long-enough',
      userId: 'new-user',
      userEmail: 'invitee@example.com',
    });

    expect(result.role).toBe('admin');
    expect(h.execute.mock.calls[0]?.[1]).toEqual([ORG_A, 'new-user', 'admin']);
  });

  it('refuses a leaked link opened by a different account', async () => {
    h.query.mockResolvedValueOnce([invitationRow()]);

    await expect(
      acceptInvitation(h.db, {
        token: 'raw-token-value-that-is-long-enough',
        userId: 'someone-else',
        userEmail: 'attacker@example.com',
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringMatching(/different email address/i),
    });

    expect(h.execute).not.toHaveBeenCalled();
  });

  it('refuses when the authenticated account has no stored email to compare', async () => {
    h.query.mockResolvedValueOnce([invitationRow()]);

    await expect(
      acceptInvitation(h.db, {
        token: 'raw-token-value-that-is-long-enough',
        userId: 'new-user',
        userEmail: null,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('404s an expired, revoked, or already-used token without revealing which', async () => {
    h.query.mockResolvedValueOnce([]);

    await expect(
      acceptInvitation(h.db, {
        token: 'raw-token-value-that-is-long-enough',
        userId: 'new-user',
        userEmail: 'invitee@example.com',
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringMatching(/invalid, expired, or already used/i),
    });
  });

  it('does not insert a duplicate membership when the user is already a member', async () => {
    h.query
      .mockResolvedValueOnce([invitationRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ user_id: 'new-user' }])
      .mockResolvedValueOnce([
        invitationRow({ status: 'accepted', accepted_by_user_id: 'new-user' }),
      ]);

    await acceptInvitation(h.db, {
      token: 'raw-token-value-that-is-long-enough',
      userId: 'new-user',
      userEmail: 'invitee@example.com',
    });

    // Otherwise the accept would consume a second seat for one person.
    expect(h.execute).not.toHaveBeenCalled();
  });
});

describe('declineInvitation', () => {
  it('flips the invitation to declined by token hash and frees the seat', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([invitationRow({ status: 'declined' })]);

    const declined = await declineInvitation(h.db, 'raw-token-value-that-is-long-enough');

    expect(declined.status).toBe('declined');
    const sql = sqlCalls(h.query)[0]!;
    expect(sql).toContain("set status = 'declined'");
    expect(sql).toContain("status = 'pending'");
    expect(h.query.mock.calls[0]?.[1]).toEqual([
      hashInvitationToken('raw-token-value-that-is-long-enough'),
    ]);
  });

  it('404s an unknown token', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);
    await expect(
      declineInvitation(h.db, 'raw-token-value-that-is-long-enough'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('expirePendingInvitations', () => {
  it('scopes to one organization when given one', async () => {
    const h = harness();
    h.execute.mockResolvedValueOnce(2);

    await expect(expirePendingInvitations(h.db, ORG_A)).resolves.toBe(2);

    const [sql, params] = h.execute.mock.calls[0] as [string, unknown[]];
    expect(sql.toLowerCase()).toContain('organization_id = $1');
    expect(params).toEqual([ORG_A]);
  });

  it('sweeps every organization for the cron job, bounded to lapsed pending rows', async () => {
    const h = harness();
    h.execute.mockResolvedValueOnce(7);

    await expect(expirePendingInvitations(h.db)).resolves.toBe(7);

    const sql = String(h.execute.mock.calls[0]?.[0]).toLowerCase();
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain('expires_at <= now()');
    // Idempotent: a re-run releases nothing twice.
    expect(sql).toContain("set status = 'expired'");
  });
});
