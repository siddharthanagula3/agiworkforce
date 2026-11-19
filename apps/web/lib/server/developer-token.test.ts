import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));

import {
  isDeveloperTokenRevoked,
  issueDeveloperToken,
  revokeDeveloperSessionFamily,
  verifyDeveloperTokenSignature,
} from './developer-token';

describe('revokeDeveloperSessionFamily', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.execute.mockReset();
  });

  it('ends the family for its own account before revoking the token rows', async () => {
    db.execute.mockResolvedValueOnce(1);
    db.query.mockResolvedValueOnce([{ id: 'rt_1' }]);

    await expect(revokeDeveloperSessionFamily('family_1', 'user_1')).resolves.toBe(true);

    const [fence, fenceParams] = db.execute.mock.calls[0]!;
    expect(String(fence)).toContain('insert into public.device_refresh_token_families');
    expect(fenceParams?.slice(0, 2)).toEqual(['family_1', 'user_1']);
    const [revoke, revokeParams] = db.query.mock.calls[0]!;
    expect(String(revoke)).toContain('update device_refresh_tokens');
    expect(String(revoke)).toContain('and user_id = $2');
    expect(revokeParams?.slice(0, 2)).toEqual(['family_1', 'user_1']);
    expect(db.execute.mock.invocationCallOrder[0]).toBeLessThan(
      db.query.mock.invocationCallOrder[0]!,
    );
  });

  it('reports nothing revoked for a family that was already ended', async () => {
    db.execute.mockResolvedValueOnce(0);
    db.query.mockResolvedValueOnce([]);
    await expect(revokeDeveloperSessionFamily('family_1', 'user_1')).resolves.toBe(false);
  });
});

describe('isDeveloperTokenRevoked', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'fixture-secret-with-enough-length');
    db.query.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function verified(sessionFamilyId?: string) {
    const { accessToken } = issueDeveloperToken({
      userId: 'user_1',
      ...(sessionFamilyId ? { sessionFamilyId } : {}),
    });
    const token = verifyDeveloperTokenSignature(accessToken);
    if (!token) throw new Error('fixture token did not verify');
    return token;
  }

  it('honours a jti revocation', async () => {
    db.query.mockResolvedValueOnce([{ jti: 'x' }]);
    await expect(isDeveloperTokenRevoked(verified('family_1'))).resolves.toBe(true);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('treats an access token as revoked once its refresh-token family has no live member', async () => {
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(isDeveloperTokenRevoked(verified('family_1'))).resolves.toBe(true);
    const [sql, params] = db.query.mock.calls[1]!;
    expect(String(sql)).toContain('device_refresh_tokens');
    expect(String(sql)).toContain('revoked_at IS NULL');
    expect(params).toEqual(['family_1', 'user_1']);
  });

  it('treats a family an unlink ended as revoked even if a successor row escaped revocation', async () => {
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(isDeveloperTokenRevoked(verified('family_1'))).resolves.toBe(true);
    const [sql] = db.query.mock.calls[1]!;
    expect(String(sql)).toContain('FROM public.device_refresh_token_families f');
    expect(String(sql)).toContain('f.family_id = t.family_id');
    expect(String(sql)).toContain('f.revoked_at IS NOT NULL');
  });

  it('accepts an access token while its family still has a live refresh token', async () => {
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'rt_1' }]);
    await expect(isDeveloperTokenRevoked(verified('family_1'))).resolves.toBe(false);
  });

  it('falls back to jti-only revocation for tokens issued without a family', async () => {
    db.query.mockResolvedValueOnce([]);
    await expect(isDeveloperTokenRevoked(verified())).resolves.toBe(false);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
