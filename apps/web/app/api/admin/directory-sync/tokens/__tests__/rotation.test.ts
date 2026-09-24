import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = 'directory-admin';

const access = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: vi.fn(async () => undefined),
  logSecurityEvent: vi.fn(async () => undefined),
}));
vi.mock('@/app/api/admin/directory-sync/directory-sync-access', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/app/api/admin/directory-sync/directory-sync-access')
  >()),
  requireDirectorySyncAdmin: vi.fn(async () => ({
    db: access.db,
    userId: ADMIN_ID,
    organizationId: ORGANIZATION_ID,
    role: 'owner',
    plan: 'enterprise',
  })),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createFakeScimDb } from '@/app/api/scim/v2/__tests__/fake-scim-db';
import { verifyScimToken } from '@/lib/server/scim/scim-token-service';
import { GET as listTokens, POST as mintToken } from '../route';
import { DELETE as revokeToken } from '../[tokenId]/route';

const BASE = 'http://localhost:3000/api/admin/directory-sync/tokens';

async function mint(name: string): Promise<{ id: string; raw: string }> {
  const response = await mintToken(
    new NextRequest(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ connectionId: CONNECTION_ID, name }),
    }),
  );
  expect(response.status).toBe(201);
  const body = (await response.json()) as { token: { id: string }; raw_token: string };
  return { id: body.token.id, raw: body.raw_token };
}

async function revoke(tokenId: string): Promise<Response> {
  return revokeToken(new NextRequest(`${BASE}/${tokenId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ tokenId }),
  });
}

describe('rotating a directory sync token', () => {
  let db: DatabaseAdapter;

  beforeEach(() => {
    const fake = createFakeScimDb({
      directory_sync_connections: [{ id: CONNECTION_ID, organization_id: ORGANIZATION_ID }],
    });
    db = fake.adapter as unknown as DatabaseAdapter;
    access.db = db;
  });

  it('keeps the identity provider syncing while the old token is swapped out', async () => {
    const outgoing = await mint('Okta production');
    const incoming = await mint('Okta production (rotated)');
    expect(incoming.raw).not.toBe(outgoing.raw);

    await expect(verifyScimToken(db, outgoing.raw)).resolves.toMatchObject({
      tokenId: outgoing.id,
      organizationId: ORGANIZATION_ID,
    });
    await expect(verifyScimToken(db, incoming.raw)).resolves.toMatchObject({
      tokenId: incoming.id,
      organizationId: ORGANIZATION_ID,
    });

    expect((await revoke(outgoing.id)).status).toBe(200);

    await expect(verifyScimToken(db, outgoing.raw)).resolves.toBeNull();
    await expect(verifyScimToken(db, incoming.raw)).resolves.toMatchObject({
      tokenId: incoming.id,
    });

    const listed = (await (await listTokens(new NextRequest(BASE))).json()) as {
      tokens: Array<{ id: string; revoked_at: string | null }>;
    };
    const byId = new Map(listed.tokens.map((token) => [token.id, token]));
    expect(byId.get(outgoing.id)?.revoked_at).not.toBeNull();
    expect(byId.get(incoming.id)?.revoked_at).toBeNull();
  });

  it('refuses to revoke the same token twice, so a replayed rotation reports it', async () => {
    const outgoing = await mint('Okta production');

    expect((await revoke(outgoing.id)).status).toBe(200);
    expect((await revoke(outgoing.id)).status).toBe(404);
    await expect(verifyScimToken(db, outgoing.raw)).resolves.toBeNull();
  });
});
