import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));

import {
  isDeveloperTokenRevoked,
  issueDeveloperToken,
  verifyDeveloperTokenSignature,
} from './developer-token';

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
