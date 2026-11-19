// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { PostgresDatabaseAdapter, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { ChatSyncPushResponseSchema, SYNC_PROTOCOL_VERSION } from '@agiworkforce/cloud-contracts';
import { afterAll, describe, expect, it, vi } from 'vitest';

type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type LoggerModule = typeof import('@/lib/logger');
type CorsModule = typeof import('@/lib/cors');
type GateModule = typeof import('@/lib/managed-compute-gate');
type QuotaModule = typeof import('@/lib/services/tier-unit-quota-service');
type GoogleUserDataModule = typeof import('@/lib/connectors/google-user-data');
type IndexArtifactsModule =
  typeof import('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts');
type StoppedRunTurnModule = typeof import('@/app/api/llm/v1/chat/completions/lib/stopped-run-turn');

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

type RlsDbModule = typeof import('@/lib/server/rls-db');

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
vi.mock(
  '@/app/api/chat/conversations/[id]/messages/lib/index-artifacts',
  async (importOriginal) => ({
    ...(await importOriginal<IndexArtifactsModule>()),
    scheduleArtifactIndexing: vi.fn(),
  }),
);
vi.mock('@/app/api/llm/v1/chat/completions/lib/stopped-run-turn', async (importOriginal) => ({
  ...(await importOriginal<StoppedRunTurnModule>()),
  recordStoppedRunAssistantTurn: vi.fn(async () => undefined),
}));

const { POST } = await import('../route');

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

const CONTENT = 'The answer as far as it got.';

interface PushOutcome {
  status: number;
  applied: boolean;
  stored: Record<string, unknown>;
  versionChanged: boolean;
}

async function pushOverStoredTurn(
  storedMetadata: Record<string, unknown>,
  pushed: { content?: string; metadata?: unknown },
): Promise<PushOutcome> {
  let outcome: PushOutcome | undefined;
  scope.userId = `qa-sync-turn-ending-${randomUUID()}`;
  await database!
    .transaction(async (tx) => {
      scope.db = joined(tx);
      const conversationId = randomUUID();
      const messageId = randomUUID();
      await tx.execute(`insert into public.web_conversations (id, user_id) values ($1, $2)`, [
        conversationId,
        scope.userId,
      ]);
      const [inserted] = await tx.query<{ server_version: string }>(
        `insert into public.web_messages (id, conversation_id, role, content, metadata)
         values ($1, $2, 'assistant', $3, $4::jsonb)
         returning server_version::text as server_version`,
        [messageId, conversationId, CONTENT, JSON.stringify(storedMetadata)],
      );
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
                role: 'assistant',
                content: pushed.content ?? CONTENT,
                ...('metadata' in pushed ? { metadata: pushed.metadata } : {}),
                baseVersion: inserted!.server_version,
              },
            ],
          }),
        }),
      );
      const body = ChatSyncPushResponseSchema.parse(await response.json());
      const [row] = await tx.query<{ metadata: Record<string, unknown>; server_version: string }>(
        `select metadata, server_version::text as server_version
           from public.web_messages where id = $1`,
        [messageId],
      );
      outcome = {
        status: response.status,
        applied: body.applied.messages.some((item) => item.id === messageId),
        stored: row!.metadata,
        versionChanged: row!.server_version !== inserted!.server_version,
      };
      throw new RollBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    })
    .finally(() => {
      scope.db = null;
    });
  return outcome!;
}

const RUN = { cloudAgentRun: { runId: '018f6f2a-0000-7000-8000-0000000000b1' } };

// llm-guardrail-allow: needs a loopback AGI_LIVE_DATABASE_URL at a migrated Postgres, which ci.yml js-verify sets for its test step; every case rolls its transaction back.
describe.skipIf(!live)('sync push over a turn whose ending the server already stored', () => {
  it('keeps a recorded stop when the device saves the turn without a finish reason', async () => {
    const outcome = await pushOverStoredTurn(
      { ...RUN, finishReason: 'stopped' },
      { content: `${CONTENT} More.`, metadata: { ...RUN, sources: [] } },
    );

    expect(outcome.status).toBe(200);
    expect(outcome.applied).toBe(true);
    expect(outcome.stored).toMatchObject({ ...RUN, sources: [], finishReason: 'stopped' });
  });

  it('keeps a recorded stop when the device says the turn finished', async () => {
    const outcome = await pushOverStoredTurn(
      { ...RUN, finishReason: 'stopped' },
      { metadata: { ...RUN, finishReason: 'stop' } },
    );

    expect(outcome.applied).toBe(true);
    expect(outcome.stored['finishReason']).toBe('stopped');
  });

  it('keeps a recorded stop when the device sends no metadata object', async () => {
    const outcome = await pushOverStoredTurn(
      { ...RUN, finishReason: 'stopped' },
      { content: `${CONTENT} More.`, metadata: null },
    );

    expect(outcome.applied).toBe(true);
    expect(outcome.stored).toEqual({ finishReason: 'stopped' });
  });

  it('accepts the same turn again without a new revision when only the reason is missing', async () => {
    const outcome = await pushOverStoredTurn(
      { ...RUN, finishReason: 'stopped' },
      { metadata: { ...RUN } },
    );

    expect(outcome.applied).toBe(true);
    expect(outcome.versionChanged).toBe(false);
    expect(outcome.stored['finishReason']).toBe('stopped');
  });

  it('never turns a finished turn into a stopped one', async () => {
    const outcome = await pushOverStoredTurn(
      { ...RUN, finishReason: 'stop' },
      { metadata: { ...RUN, finishReason: 'stopped' } },
    );

    expect(outcome.applied).toBe(true);
    expect(outcome.stored['finishReason']).toBe('stop');
  });

  it('never turns a failed turn into a stopped one', async () => {
    const outcome = await pushOverStoredTurn(
      { ...RUN, finishReason: null },
      { metadata: { ...RUN, finishReason: 'stopped' } },
    );

    expect(outcome.applied).toBe(true);
    expect(outcome.stored).toHaveProperty('finishReason', null);
  });

  it('stores the device stop on a turn with no recorded ending', async () => {
    const outcome = await pushOverStoredTurn(
      { ...RUN },
      { metadata: { ...RUN, finishReason: 'stopped' } },
    );

    expect(outcome.applied).toBe(true);
    expect(outcome.stored['finishReason']).toBe('stopped');
  });

  it('still lets a continued answer that was cut short finish', async () => {
    const outcome = await pushOverStoredTurn(
      { ...RUN, finishReason: 'length' },
      { content: `${CONTENT} The rest.`, metadata: { ...RUN, finishReason: 'stop' } },
    );

    expect(outcome.applied).toBe(true);
    expect(outcome.stored['finishReason']).toBe('stop');
  });
});
