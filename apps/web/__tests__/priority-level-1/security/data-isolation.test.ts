import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

const mockQuery = vi.fn();
const mockExecute = vi.fn();
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async () => {
    const { userId } = await mockAuth();
    if (!userId) {
      const { createError } = await import('@/lib/errors');
      throw createError.unauthorized();
    }
    return {
      db: {
        query: (...args: unknown[]) => mockQuery(...args),
        execute: (...args: unknown[]) => mockExecute(...args),
        transaction: vi.fn(),
      },
      userId,
      organizationId: null,
    };
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
  resolveOrganizationMembershipId: vi.fn(async () => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/e2b/runtime', () => ({ killE2BSession: vi.fn(async () => {}) }));

import { GET, PUT, DELETE } from '@/app/api/chat/conversations/[id]/route';

const OWNER = 'user-1';
const ATTACKER = 'user-2';
const CONV_ID = '00000000-0000-4000-8000-000000000001';

function rowScopedByUser(sql: string, params: unknown[]): unknown[] {
  const boundUserId = params[1];
  const isOwnershipScoped = /user_id\s*=\s*\$2/i.test(sql);
  if (isOwnershipScoped && boundUserId === OWNER) {
    return [{ id: CONV_ID, title: 'Secret', model: null, project_id: null, pinned: false }];
  }
  return [];
}

function makeRequest(method: string): {
  req: NextRequest;
  context: { params: Promise<{ id: string }> };
} {
  const req = new NextRequest(`http://localhost/api/chat/conversations/${CONV_ID}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(method !== 'GET' ? { body: JSON.stringify({ title: 'Renamed' }) } : {}),
  });
  return { req, context: { params: Promise.resolve({ id: CONV_ID }) } };
}

describe('L1 Security - Data Isolation (BOLA/IDOR Prevention)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockImplementation((sql: string, params: unknown[] = []) =>
      Promise.resolve(rowScopedByUser(sql, params)),
    );
    mockExecute.mockResolvedValue(1);
  });

  test('HAPPY_PATH: owner can GET their own conversation', async () => {
    mockAuth.mockResolvedValue({ userId: OWNER });
    const { req, context } = makeRequest('GET');
    const res = await GET(req, context);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversation.id).toBe(CONV_ID);
    const ownershipCall = mockQuery.mock.calls.find((c) => /user_id\s*=\s*\$2/i.test(c[0]));
    expect(ownershipCall).toBeDefined();
    expect(ownershipCall![1][1]).toBe(OWNER);
  });

  test("SECURITY: attacker cannot GET another user's conversation (404, no leak)", async () => {
    mockAuth.mockResolvedValue({ userId: ATTACKER });
    const { req, context } = makeRequest('GET');
    const res = await GET(req, context);
    expect(res.status).toBe(404);
    const ownershipCall = mockQuery.mock.calls.find((c) => /user_id\s*=\s*\$2/i.test(c[0]));
    expect(ownershipCall![1][1]).toBe(ATTACKER);
  });

  test("SECURITY: attacker cannot UPDATE another user's conversation (404)", async () => {
    mockAuth.mockResolvedValue({ userId: ATTACKER });
    const { req, context } = makeRequest('PUT');
    const res = await PUT(req, context);
    expect(res.status).toBe(404);
  });

  test('SECURITY: unauthenticated request is rejected (no implicit access)', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const { req, context } = makeRequest('GET');
    const res = await GET(req, context);
    expect(res.status).toBe(401);
  });

  test('HAPPY_PATH: owner can DELETE their own conversation', async () => {
    mockAuth.mockResolvedValue({ userId: OWNER });
    const { req, context } = makeRequest('DELETE');
    const res = await DELETE(req, context);

    expect(res.status).toBe(200);
  });

  test("SECURITY: DELETE binds the caller's id so it cannot soft-delete foreign rows", async () => {
    mockAuth.mockResolvedValue({ userId: ATTACKER });
    const { req, context } = makeRequest('DELETE');
    const res = await DELETE(req, context);

    expect(res.status).toBe(404);

    const deleteCall = mockQuery.mock.calls.find((c) => /update web_conversations/i.test(c[0]));
    expect(deleteCall).toBeDefined();
    expect(deleteCall![1][1]).toBe(ATTACKER);
    expect(/user_id\s*=\s*\$2/i.test(deleteCall![0])).toBe(true);
  });
});
