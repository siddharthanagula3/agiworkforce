import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

const { mockLogSecurityEvent } = vi.hoisted(() => ({
  mockLogSecurityEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...(args as [])),
  getClientIp: () => '203.0.113.9',
}));

const { authUser, role } = vi.hoisted(() => ({
  authUser: { current: { userId: 'admin-1' } as { userId: string } | null },
  role: { current: 'admin' as string | undefined },
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: async () => {
    if (!authUser.current) throw new Error('unauthenticated');
    return authUser.current;
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    users: { getUser: async () => ({ publicMetadata: { role: role.current } }) },
  }),
}));

const { db } = vi.hoisted(() => ({ db: { current: null as unknown } }));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => db.current,
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

const SHARE_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ARTIFACT_TOKEN = 'bbbbbbbbbbbbbbbbbbbbbbbb';

type Row = Record<string, unknown>;

function fakeDb(state: { shares: Row[]; artifacts: Row[] }) {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const token = params[0] as string;
      const isShare = sql.includes('shared_sessions');
      const table = isShare ? state.shares : state.artifacts;

      if (sql.trimStart().startsWith('delete')) {
        const index = table.findIndex((row) => row['token'] === token);
        if (index === -1) return [];
        table.splice(index, 1);
        return [{ token }];
      }
      return table.filter((row) => row['token'] === token);
    }),
    execute: vi.fn(async () => 0),
  };
}

function seed() {
  return {
    shares: [
      {
        token: SHARE_TOKEN,
        owner_id: 'user-owner',
        title: 'Leaked chat',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    artifacts: [
      {
        token: ARTIFACT_TOKEN,
        user_id: 'user-publisher',
        title: 'Infringing page',
        created_at: '2026-02-02T00:00:00.000Z',
      },
    ],
  };
}

function postRequest(body: unknown) {
  return new NextRequest('https://app.test/api/admin/takedown', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(token: string) {
  return new NextRequest(`https://app.test/api/admin/takedown?token=${encodeURIComponent(token)}`);
}

describe('POST /api/admin/takedown', () => {
  let state: ReturnType<typeof seed>;

  beforeEach(() => {
    state = seed();
    db.current = fakeDb(state);
    authUser.current = { userId: 'admin-1' };
    role.current = 'admin';
    mockLogSecurityEvent.mockClear();
  });

  it('unpublishes a reported conversation share the admin does not own', async () => {
    const response = await POST(postRequest({ token: SHARE_TOKEN, reason: 'DMCA notice #12' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      kind: 'conversation-share',
      ownerId: 'user-owner',
    });
    expect(state.shares).toHaveLength(0);
  });

  it('unpublishes a published artifact addressed by its public URL', async () => {
    const response = await POST(
      postRequest({
        token: `https://app.test/shared-artifact/${ARTIFACT_TOKEN}?utm_source=x`,
        reason: 'copyright complaint',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ kind: 'published-artifact' });
    expect(state.artifacts).toHaveLength(0);
  });

  it('records the actor, owner and reason in the security audit log', async () => {
    await POST(postRequest({ token: SHARE_TOKEN, reason: 'DMCA notice #12' }));

    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        eventType: 'admin_action',
        details: expect.objectContaining({
          action: 'public_content_takedown',
          ownerId: 'user-owner',
          reason: 'DMCA notice #12',
        }),
      }),
    );
  });

  it('refuses a non-admin caller and leaves the content published', async () => {
    role.current = 'user';

    const response = await POST(postRequest({ token: SHARE_TOKEN, reason: 'nope' }));

    expect(response.status).toBe(403);
    expect(state.shares).toHaveLength(1);
  });

  it('requires a reason', async () => {
    const response = await POST(postRequest({ token: SHARE_TOKEN }));

    expect(response.status).toBe(400);
    expect(state.shares).toHaveLength(1);
  });

  it('404s on a token that serves no public content', async () => {
    const response = await POST(
      postRequest({ token: 'cccccccccccccccccccccccc', reason: 'abuse' }),
    );

    expect(response.status).toBe(404);
  });
});

describe('GET /api/admin/takedown', () => {
  beforeEach(() => {
    db.current = fakeDb(seed());
    authUser.current = { userId: 'admin-1' };
    role.current = 'owner';
  });

  it('identifies what a reported token points at before the operator acts', async () => {
    const response = await GET(getRequest(`https://app.test/share/${SHARE_TOKEN}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      target: { kind: 'conversation-share', token: SHARE_TOKEN, ownerId: 'user-owner' },
    });
  });

  it('refuses a non-admin caller', async () => {
    role.current = undefined;

    const response = await GET(getRequest(SHARE_TOKEN));

    expect(response.status).toBe(403);
  });
});
