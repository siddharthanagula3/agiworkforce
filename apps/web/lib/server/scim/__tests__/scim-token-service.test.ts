import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createFakeScimDb } from '@/app/api/scim/v2/__tests__/fake-scim-db';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  createScimToken,
  generateScimToken,
  listScimTokens,
  parseScimTokenPrefix,
  revokeScimToken,
  SCIM_TOKEN_PATTERN,
  verifyScimToken,
} from '../scim-token-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const CONNECTION = '33333333-3333-4333-8333-333333333333';

describe('SCIM token credentials', () => {
  let db: DatabaseAdapter;

  beforeEach(() => {
    db = createFakeScimDb().adapter as unknown as DatabaseAdapter;
  });

  it('generates a CSPRNG token in the documented format and stores only a hash', async () => {
    const { raw, prefix, hash } = await generateScimToken();

    expect(raw).toMatch(SCIM_TOKEN_PATTERN);
    expect(raw.startsWith(`scim_${prefix}_`)).toBe(true);
    expect(prefix).toMatch(/^[0-9a-f]{16}$/);
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain(raw);
  });

  it('never produces the same token twice', async () => {
    const tokens = await Promise.all([generateScimToken(), generateScimToken()]);
    expect(tokens[0].raw).not.toBe(tokens[1].raw);
    expect(tokens[0].prefix).not.toBe(tokens[1].prefix);
  });

  it('rejects a malformed token before any database or Argon2 work', async () => {
    for (const candidate of [
      '',
      'scim_',
      'sk_live_deadbeefdeadbeef_secret',
      'scim_NOTHEX0000000000_' + 'a'.repeat(48),
      `scim_${'a'.repeat(16)}_short`,
    ]) {
      expect(parseScimTokenPrefix(candidate)).toBeNull();
      await expect(verifyScimToken(db, candidate)).resolves.toBeNull();
    }
  });

  it('round-trips a minted token and refuses a forged secret with the same prefix', async () => {
    const { token, rawToken } = await createScimToken(db, {
      connectionId: CONNECTION,
      organizationId: ORG,
      name: 'Okta production',
      createdByUserId: 'admin-user',
    });

    const verified = await verifyScimToken(db, rawToken);
    expect(verified).toEqual({
      tokenId: token.id,
      connectionId: CONNECTION,
      organizationId: ORG,
      createdByUserId: 'admin-user',
    });

    const prefix = parseScimTokenPrefix(rawToken)!;
    const forged = `scim_${prefix}_${'0'.repeat(48)}`;
    expect(forged).not.toBe(rawToken);
    await expect(verifyScimToken(db, forged)).resolves.toBeNull();
  });

  it('records usage so an admin can tell whether the IdP is actually calling', async () => {
    const { adapter, state } = createFakeScimDb();
    const scoped = adapter as unknown as DatabaseAdapter;
    const { rawToken } = await createScimToken(scoped, {
      connectionId: CONNECTION,
      organizationId: ORG,
      name: 'Okta',
      createdByUserId: 'admin-user',
    });

    expect(state.scim_tokens[0]?.['last_used_at']).toBeNull();
    await verifyScimToken(scoped, rawToken);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.scim_tokens[0]?.['last_used_at']).not.toBeNull();
  });

  it('stops authenticating the moment a token is revoked', async () => {
    const { adapter, state } = createFakeScimDb();
    const scoped = adapter as unknown as DatabaseAdapter;
    const { token, rawToken } = await createScimToken(scoped, {
      connectionId: CONNECTION,
      organizationId: ORG,
      name: 'Okta',
      createdByUserId: 'admin-user',
    });

    await expect(verifyScimToken(scoped, rawToken)).resolves.not.toBeNull();

    expect(await revokeScimToken(scoped, token.id, ORG)).toBe(true);
    await expect(verifyScimToken(scoped, rawToken)).resolves.toBeNull();

    expect(state.scim_tokens).toHaveLength(1);
    expect(state.scim_tokens[0]?.['revoked_at']).not.toBeNull();

    expect(await revokeScimToken(scoped, token.id, ORG)).toBe(false);
  });

  it('refuses to revoke another tenant’s credential', async () => {
    const { token, rawToken } = await createScimToken(db, {
      connectionId: CONNECTION,
      organizationId: ORG,
      name: 'Okta',
      createdByUserId: 'admin-user',
    });

    expect(await revokeScimToken(db, token.id, OTHER_ORG)).toBe(false);
    await expect(verifyScimToken(db, rawToken)).resolves.not.toBeNull();
  });

  it('refuses an expired token', async () => {
    const { adapter, state } = createFakeScimDb();
    const scoped = adapter as unknown as DatabaseAdapter;
    const { rawToken } = await createScimToken(scoped, {
      connectionId: CONNECTION,
      organizationId: ORG,
      name: 'Okta',
      createdByUserId: 'admin-user',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(verifyScimToken(scoped, rawToken)).resolves.not.toBeNull();

    state.scim_tokens[0]!['expires_at'] = new Date(Date.now() - 1_000).toISOString();
    await expect(verifyScimToken(scoped, rawToken)).resolves.toBeNull();
  });

  it('never exposes the hash through the listing surface', async () => {
    await createScimToken(db, {
      connectionId: CONNECTION,
      organizationId: ORG,
      name: 'Okta',
      createdByUserId: 'admin-user',
    });

    const tokens = await listScimTokens(db, ORG);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).not.toHaveProperty('token_hash');
    expect(await listScimTokens(db, OTHER_ORG)).toHaveLength(0);
  });
});
