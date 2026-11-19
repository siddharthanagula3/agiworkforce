// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { PostgresDatabaseAdapter, type DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ChatSyncPullResponseSchema,
  ChatSyncPushResponseSchema,
  SYNC_PROTOCOL_VERSION,
} from '@agiworkforce/cloud-contracts';
import { afterAll, describe, expect, it, vi } from 'vitest';

type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type LoggerModule = typeof import('@/lib/logger');
type CorsModule = typeof import('@/lib/cors');
type GateModule = typeof import('@/lib/managed-compute-gate');
type QuotaModule = typeof import('@/lib/services/tier-unit-quota-service');
type GoogleUserDataModule = typeof import('@/lib/connectors/google-user-data');
type RlsDbModule = typeof import('@/lib/server/rls-db');

const liveDatabaseUrl = process.env['AGI_LIVE_DATABASE_URL'] ?? '';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopbackDatabase(connectionString: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(connectionString).hostname);
  } catch {
    return false;
  }
}

const live = isLoopbackDatabase(liveDatabaseUrl);

const scope = vi.hoisted(() => ({ db: null as DatabaseAdapter | null, userId: '' }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({
    db: scope.db,
    userId: scope.userId,
    organizationId: null,
  })),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<CorsModule>()),
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<GateModule>()),
  buildChatSyncGateResponse: vi.fn(async () => null),
}));
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => ({
  ...(await importOriginal<QuotaModule>()),
  assertFreeDailyAllowance: vi.fn(async () => undefined),
}));
vi.mock('@/lib/connectors/google-user-data', async (importOriginal) => ({
  ...(await importOriginal<GoogleUserDataModule>()),
  markSyncedConversationsGoogleUserData: vi.fn(async () => undefined),
}));

const { GET, POST } = await import('../route');

class RollBack extends Error {}

const database = live ? new PostgresDatabaseAdapter({ connectionString: liveDatabaseUrl }) : null;

afterAll(async () => {
  await database?.dispose();
});

function joined(tx: DatabaseAdapter): DatabaseAdapter {
  return {
    query: (sql, params) => tx.query(sql, params),
    execute: (sql, params) => tx.execute(sql, params),
    transaction: (run) => run(tx),
    withUser: (token) => tx.withUser(token),
    withOrg: (organizationId) => tx.withOrg(organizationId),
    dispose: () => tx.dispose(),
  };
}

async function inRolledBackConversation(
  work: (tx: DatabaseAdapter, conversationId: string) => Promise<void>,
): Promise<void> {
  scope.userId = `qa-sync-metadata-object-${randomUUID()}`;
  await database!
    .transaction(async (tx) => {
      scope.db = joined(tx);
      const conversationId = randomUUID();
      await tx.execute(`insert into public.web_conversations (id, user_id) values ($1, $2)`, [
        conversationId,
        scope.userId,
      ]);
      await work(tx, conversationId);
      throw new RollBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    })
    .finally(() => {
      scope.db = null;
    });
}

async function storedTypeAndValue(tx: DatabaseAdapter, messageId: string) {
  const [row] = await tx.query<{ kind: string; metadata: unknown }>(
    `select jsonb_typeof(metadata) as kind, metadata from public.web_messages where id = $1`,
    [messageId],
  );
  return row;
}

// llm-guardrail-allow: needs a loopback AGI_LIVE_DATABASE_URL at a migrated Postgres, which ci.yml js-verify sets for its test step; every case rolls its transaction back.
describe.skipIf(!live)('chat sync and message metadata that is not an object', () => {
  it('stores an object, never JSON null, for a pushed message whose metadata is null', async () => {
    await inRolledBackConversation(async (tx, conversationId) => {
      const messageId = randomUUID();
      const response = await POST(
        new NextRequest('https://agiworkforce.com/api/chat/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            protocolVersion: SYNC_PROTOCOL_VERSION,
            messages: [
              {
                id: messageId,
                conversationId,
                role: 'user',
                content: 'Draw a lighthouse',
                metadata: null,
                baseVersion: '0',
              },
            ],
          }),
        }),
      );
      const body = ChatSyncPushResponseSchema.parse(await response.json());
      expect(body.applied.messages.map((row) => row.id)).toContain(messageId);
      expect(await storedTypeAndValue(tx, messageId)).toEqual({ kind: 'object', metadata: {} });

      await tx.execute(
        `update web_messages set metadata = coalesce(metadata, '{}'::jsonb) || $1::jsonb where id = $2`,
        [JSON.stringify({ followUpSuggestions: ['Why?'] }), messageId],
      );
      expect((await storedTypeAndValue(tx, messageId))?.kind).toBe('object');
    });
  });

  it('pulls a page holding a row an earlier merge broke, with that row repaired', async () => {
    await inRolledBackConversation(async (tx, conversationId) => {
      const goodId = randomUUID();
      const brokenId = randomUUID();
      await tx.execute(
        `insert into public.web_messages (id, conversation_id, role, content, metadata)
         values ($1, $3, 'user', 'Draw a lighthouse', '{}'::jsonb),
                ($2, $3, 'assistant', 'Image generation failed.',
                 'null'::jsonb || '{"followUpSuggestions": ["Try again"]}'::jsonb)`,
        [goodId, brokenId, conversationId],
      );

      const response = await GET(
        new NextRequest('https://agiworkforce.com/api/chat/sync?since=0', { method: 'GET' }),
      );
      expect(response.status).toBe(200);
      const body = ChatSyncPullResponseSchema.parse(await response.json());
      const byId = new Map(body.messages.map((row) => [row.id, row.metadata]));
      expect(byId.get(goodId)).toEqual({});
      expect(byId.get(brokenId)).toEqual({ followUpSuggestions: ['Try again'] });
    });
  });
});
