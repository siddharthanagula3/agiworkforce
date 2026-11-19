import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  RevokeConversationToolGrantResponseSchema,
  conversationToolGrantPath,
} from '@agiworkforce/cloud-contracts';

type RateLimitModule = typeof import('@/lib/rate-limit');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type CsrfModule = typeof import('@/lib/csrf');
type SecurityAuditModule = typeof import('@/lib/security-audit');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));

import { DELETE, OPTIONS } from '../route';

const OWNER = 'user-owner';
const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const GRANT = '33333333-3333-4333-8333-333333333333';
const ORGANIZATION = '55555555-5555-4555-8555-555555555555';

interface StoredGrant {
  id: string;
  userId: string;
  conversationId: string;
  connectorId: string;
  toolName: string;
  conversationDeleted?: boolean;
  conversationArchived?: boolean;
}

function grantsDb(initial: StoredGrant[]) {
  const grants = [...initial];
  const statements: string[] = [];
  const generations: string[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    statements.push(sql);
    if (sql.includes('select grant_row.connector_id, grant_row.tool_name')) {
      const [id, user, conversation] = params;
      const checksOwner = sql.includes('grant_row.user_id = $2');
      const hidesDeleted = sql.includes('conversation.deleted_at is null');
      const hidesArchived = sql.includes('conversation.archived');
      return grants
        .filter(
          (grant) =>
            grant.id === id &&
            (!checksOwner || grant.userId === user) &&
            grant.conversationId === conversation &&
            !(hidesDeleted && grant.conversationDeleted) &&
            !(hidesArchived && grant.conversationArchived),
        )
        .map((grant) => ({ connector_id: grant.connectorId, tool_name: grant.toolName }));
    }
    if (sql.includes('connector_permission_generations')) {
      generations.push(params[1] as string);
      return [{ generation: String(generations.length) }];
    }
    if (sql.includes('delete from public.connector_tool_session_grants')) {
      const [id, user, conversation] = params;
      const checksOwner = sql.includes('grant_row.user_id = $2');
      const index = grants.findIndex(
        (grant) =>
          grant.id === id &&
          (!checksOwner || grant.userId === user) &&
          grant.conversationId === conversation,
      );
      if (index < 0) return [];
      const [removed] = grants.splice(index, 1);
      return [{ id: removed!.id }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const db = {
    query,
    transaction: vi.fn(async (operation: (tx: DatabaseAdapter) => Promise<unknown>) =>
      operation({ query } as unknown as DatabaseAdapter),
    ),
  };
  return { db, statements, generations, remaining: () => grants.map((grant) => grant.id) };
}

const ownerGrant: StoredGrant = {
  id: GRANT,
  userId: OWNER,
  conversationId: CONVERSATION,
  connectorId: 'github',
  toolName: 'create_issue',
};

function signedInAs(userId: string, db: unknown) {
  mocks.getUserScopedDb.mockResolvedValue({ db, userId, organizationId: ORGANIZATION });
}

function revoke(conversationId: string, grantId: string) {
  return DELETE(
    new NextRequest(`http://localhost:3000${conversationToolGrantPath(conversationId, grantId)}`, {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ id: conversationId, grantId }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.recordAuditEvent.mockResolvedValue(undefined);
});

describe('DELETE /api/chat/conversations/[id]/tool-grants/[grantId]', () => {
  it('lets the owner remove a grant and answers with the removed count', async () => {
    const model = grantsDb([ownerGrant]);
    signedInAs(OWNER, model.db);

    const response = await revoke(CONVERSATION, GRANT);

    expect(response.status).toBe(200);
    expect(RevokeConversationToolGrantResponseSchema.parse(await response.json())).toEqual({
      success: true,
      removed: 1,
    });
    expect(model.remaining()).toEqual([]);
    expect(model.db.transaction).toHaveBeenCalledTimes(1);
  });

  it('advances the permission generation of its connector before deleting the grant', async () => {
    const model = grantsDb([ownerGrant]);
    signedInAs(OWNER, model.db);

    await revoke(CONVERSATION, GRANT);

    expect(model.generations).toEqual(['github']);
    const generationAt = model.statements.findIndex((sql) =>
      sql.includes('connector_permission_generations'),
    );
    const deleteAt = model.statements.findIndex((sql) =>
      sql.includes('delete from public.connector_tool_session_grants'),
    );
    expect(generationAt).toBeGreaterThanOrEqual(0);
    expect(generationAt).toBeLessThan(deleteAt);
  });

  it('records the removal against the signed-in person and the tool it covered', async () => {
    signedInAs(OWNER, grantsDb([ownerGrant]).db);

    await revoke(CONVERSATION, GRANT);

    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OWNER,
        organizationId: ORGANIZATION,
        eventType: 'connector_setting_changed',
        detail: {
          resourceType: 'connector',
          resourceId: 'github',
          connectorId: 'github',
          resourceName: 'create_issue',
          status: 'permission_removed',
          count: 1,
        },
      }),
    );
  });

  it("refuses another person's grant as unknown and leaves it in place", async () => {
    const model = grantsDb([ownerGrant]);
    signedInAs('someone-else', model.db);

    const response = await revoke(CONVERSATION, GRANT);

    expect(response.status).toBe(404);
    expect(model.remaining()).toEqual([GRANT]);
    expect(model.generations).toEqual([]);
    expect(model.statements.some((sql) => sql.includes('delete from'))).toBe(false);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses a grant that belongs to a different chat of the same person', async () => {
    const model = grantsDb([ownerGrant]);
    signedInAs(OWNER, model.db);

    const response = await revoke('22222222-2222-4222-8222-222222222222', GRANT);

    expect(response.status).toBe(404);
    expect(model.remaining()).toEqual([GRANT]);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses a grant of a deleted chat and leaves it for the retention purge', async () => {
    const model = grantsDb([{ ...ownerGrant, conversationDeleted: true }]);
    signedInAs(OWNER, model.db);

    const response = await revoke(CONVERSATION, GRANT);

    expect(response.status).toBe(404);
    expect(model.remaining()).toEqual([GRANT]);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('still removes a grant of an archived chat, which stays usable', async () => {
    const model = grantsDb([{ ...ownerGrant, conversationArchived: true }]);
    signedInAs(OWNER, model.db);

    const response = await revoke(CONVERSATION, GRANT);

    expect(response.status).toBe(200);
    expect(model.remaining()).toEqual([]);
  });

  it('answers an unknown grant as not found', async () => {
    signedInAs(OWNER, grantsDb([ownerGrant]).db);

    const response = await revoke(CONVERSATION, '44444444-4444-4444-8444-444444444444');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('answers a second removal of the same grant as unknown', async () => {
    const model = grantsDb([ownerGrant]);
    signedInAs(OWNER, model.db);

    expect((await revoke(CONVERSATION, GRANT)).status).toBe(200);
    expect((await revoke(CONVERSATION, GRANT)).status).toBe(404);
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a chat id that is not an id', 'not-a-chat', GRANT],
    ['a grant id that is not an id', CONVERSATION, 'all'],
  ])('refuses %s before reading anything', async (_label, conversationId, grantId) => {
    const response = await revoke(conversationId, grantId);

    expect(response.status).toBe(400);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('stops at the CSRF check before rate limiting or reading', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await revoke(CONVERSATION, GRANT);

    expect(response.status).toBe(403);
    expect(mocks.withRateLimit).not.toHaveBeenCalled();
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('hands back the rate limit answer without reading anything', async () => {
    mocks.withRateLimit.mockResolvedValue(
      NextResponse.json({ error: 'slow down' }, { status: 429 }),
    );

    const response = await revoke(CONVERSATION, GRANT);

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(expect.anything(), 'chat-conversation');
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('answers the browser preflight without a body', () => {
    const response = OPTIONS(
      new NextRequest(`http://localhost:3000${conversationToolGrantPath(CONVERSATION, GRANT)}`, {
        method: 'OPTIONS',
      }),
    );

    expect(response.status).toBeLessThan(300);
  });
});
