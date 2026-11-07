// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { createDatabaseClient, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { getDefaultModelFor, getModelMetadataById } from '@agiworkforce/types';
import { managedCloudMessagePath, SYNC_PROTOCOL_VERSION } from '@agiworkforce/cloud-contracts';
import {
  ASSISTANT_CONTENT_CHANGED_REASON,
  ASSISTANT_CONTENT_EDIT_METADATA_KEY,
} from '@/features/chat/lib/assistant-content-edit-contract';
import {
  SAVE_ASSISTANT_CONTENT_EDIT_SQL,
  assertAssistantContinuationSeed,
  type EditedAssistantContent,
} from './assistant-content-edits';

const connectionString = process.env['AGI_FENCE_EDIT_TEST_DATABASE_URL'];
if (connectionString) {
  const address = new URL(connectionString);
  if (
    address.hostname !== 'localhost' ||
    address.username !== 'agi_fence_test' ||
    address.pathname !== '/agi_fence_edits' ||
    !address.searchParams.get('host')?.startsWith('/private/tmp/agi-fence-edit-tests.')
  ) {
    throw new Error('The concurrency fixture requires its disposable private-socket database.');
  }
}

const USER_ID = 'fence-edit-owner';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const NEW_MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const MODEL = getDefaultModelFor('pro', 'chat');
const PROVIDER = getModelMetadataById(MODEL)?.provider;
if (!PROVIDER) throw new Error('The model catalog must supply the persistence fixture provider.');
const SOURCE = 'Before.\n\n```writing\nOriginal draft.\n```\n\nAfter.';
const EDITED = 'Before.\n\n```writing\nSaved draft.\n```\n\nAfter.';
const scope = { userId: USER_ID, organizationId: null, conversationId: CONVERSATION_ID };

const mocks = vi.hoisted(() => ({
  routeDb: undefined as DatabaseAdapter | undefined,
  backgroundDb: undefined as DatabaseAdapter | undefined,
  indexArtifacts: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async () => {
    if (!mocks.routeDb) throw new Error('Concurrency fixture database is not ready.');
    return { db: mocks.routeDb, userId: USER_ID, organizationId: null };
  },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => {
    if (!mocks.backgroundDb) throw new Error('Concurrency fixture database is not ready.');
    return mocks.backgroundDb;
  },
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: async () => null }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: async () => null }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: mocks.logError },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/services/tier-unit-quota-service', () => ({
  assertFreeDailyAllowance: async () => {},
}));
vi.mock('@/lib/connectors/google-user-data', () => ({
  markSyncedConversationsGoogleUserData: async () => {},
}));
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts', () => ({
  scheduleArtifactIndexing: mocks.indexArtifacts,
}));

const { PATCH } = await import('@/app/api/chat/conversations/[id]/messages/[messageId]/route');
const { POST: syncPush } = await import('@/app/api/chat/sync/route');
const { persistConversationMessage } =
  await import('@/app/api/chat/conversations/[id]/messages/lib/persist-message');
const { INSERT_MESSAGE_SQL } =
  await import('@/app/api/chat/conversations/[id]/messages/lib/message-thread');
const { persistAssistantTurn } =
  await import('@/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence');
const context = { params: Promise.resolve({ id: CONVERSATION_ID, messageId: MESSAGE_ID }) };

let db: DatabaseAdapter;

function pause() {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    entered,
    release,
    wait: async () => {
      enter();
      await released;
    },
  };
}

function intercepted(
  database: DatabaseAdapter,
  before: (sql: string) => Promise<void>,
): DatabaseAdapter {
  return {
    query: async <T>(sql: string, params?: unknown[]) => {
      await before(sql);
      return database.query<T>(sql, params);
    },
    execute: async (sql, params) => {
      await before(sql);
      return database.execute(sql, params);
    },
    transaction: (run) => database.transaction((tx) => run(intercepted(tx, before))),
    withUser: (token) => intercepted(database.withUser(token), before),
    withOrg: (organizationId) => intercepted(database.withOrg(organizationId), before),
    dispose: () => database.dispose(),
  };
}

function editRequest(source = 'Original draft.', content = 'Saved draft.'): NextRequest {
  return new NextRequest(
    new URL(managedCloudMessagePath(CONVERSATION_ID, MESSAGE_ID), 'http://localhost'),
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fenceEdit: { index: 0, language: 'writing', source, content } }),
    },
  );
}

function persistOnServer(content: string, truncated = false, admitted?: EditedAssistantContent) {
  return persistAssistantTurn({
    userId: USER_ID,
    processed: {
      requestId: 'fence-concurrency-request',
      conversationId: CONVERSATION_ID,
      assistantMessageId: MESSAGE_ID,
      requestedModel: MODEL,
      usedFallback: false,
      fallbackReason: '',
      ...(admitted
        ? {
            assistantContinuationSeed: admitted.content,
            assistantContentEditRevision: admitted.editRevision,
          }
        : {}),
    },
    snapshot: {
      content,
      model: MODEL,
      provider: PROVIDER!,
      inputTokens: 1,
      outputTokens: 1,
      truncated,
    },
  });
}

function persistOnClient(
  content: string,
  database = db,
  role: 'user' | 'assistant' = 'assistant',
  metadata: Record<string, unknown> = {},
) {
  return persistConversationMessage({
    db: database,
    scope,
    message: { id: MESSAGE_ID, role, content, model: MODEL, metadata },
  });
}

async function stored() {
  const [row] = await db.query<{
    content: string;
    metadata: Record<string, unknown> | null;
    server_version: string;
  }>('select content, metadata, server_version::text from web_messages where id = $1', [
    MESSAGE_ID,
  ]);
  if (!row) throw new Error('The fixture message disappeared.');
  return row;
}

// llm-guardrail-allow: requires the guarded disposable private-socket database; all 19 cases were verified locally.
describe.skipIf(!connectionString)('saved assistant edits against disposable PostgreSQL', () => {
  beforeAll(async () => {
    db = createDatabaseClient({
      provider: 'postgres',
      connectionString,
      poolSize: 8,
      statementTimeoutMs: 5_000,
    });
    const versioning = await readFile(
      new URL('../../db/neon/0038_cloud_sync_versioning.sql', import.meta.url),
      'utf8',
    );
    const assignVersion = versioning.match(
      /CREATE OR REPLACE FUNCTION public\.assign_cloud_sync_version\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/,
    )?.[0];
    if (!assignVersion) throw new Error('The canonical sync version trigger was not found.');
    await db.execute(`
      drop table if exists public.web_messages, public.web_conversations, public.cloud_agent_runs cascade;
      drop function if exists public.assign_cloud_sync_version() cascade;
      drop sequence if exists public.cloud_sync_version_seq cascade;
    `);
    await db.execute(`
      create sequence public.cloud_sync_version_seq;
      create table public.web_conversations (
        id uuid primary key, user_id text not null, organization_id uuid,
        active_leaf_message_id uuid, deleted_at timestamptz, model text,
        is_temporary boolean not null default false, compaction_summary text,
        compaction_summary_through_message_id uuid, compaction_summary_digest text,
        server_version bigint not null default 0
      );
      create table public.web_messages (
        id uuid primary key, conversation_id uuid not null references public.web_conversations,
        role text not null, content text not null, model text, provider text,
        input_tokens integer not null default 0, output_tokens integer not null default 0,
        metadata jsonb not null default '{}', parent_id uuid, deleted_at timestamptz,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        server_version bigint not null default 0
      );
      create table public.cloud_agent_runs (conversation_id uuid not null, state text not null);
      ${assignVersion}
      create trigger version_conversations before insert or update on public.web_conversations
        for each row execute function public.assign_cloud_sync_version();
      create trigger version_messages before insert or update on public.web_messages
        for each row execute function public.assign_cloud_sync_version();
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'app_rls') then
          create role app_rls;
        end if;
      end $$;
      grant usage on schema public to app_rls;
      grant all on all tables in schema public to app_rls;
      grant all on all sequences in schema public to app_rls;
    `);
  });

  afterAll(async () => {
    await db?.execute(`
      drop table if exists public.web_messages, public.web_conversations, public.cloud_agent_runs cascade;
      drop function if exists public.assign_cloud_sync_version() cascade;
      drop sequence if exists public.cloud_sync_version_seq cascade;
    `);
    await db?.dispose();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.routeDb = db;
    mocks.backgroundDb = db;
    await db.execute('truncate web_messages, web_conversations, cloud_agent_runs cascade');
    await db.execute('insert into web_conversations (id, user_id, model) values ($1, $2, $3)', [
      CONVERSATION_ID,
      USER_ID,
      MODEL,
    ]);
    await db.execute(
      'insert into web_messages (id, conversation_id, role, content) values ($1, $2, $3, $4)',
      [MESSAGE_ID, CONVERSATION_ID, 'assistant', SOURCE],
    );
  });

  it.each([false, true])(
    'preserves Save when both stale server and client writers were already pending (cancelled=%s)',
    async (truncated) => {
      const save = pause();
      const server = pause();
      const client = pause();
      mocks.routeDb = intercepted(db, async (sql) => {
        if (sql === SAVE_ASSISTANT_CONTENT_EDIT_SQL) await save.wait();
      });
      const pendingSave = PATCH(editRequest(), context);
      await save.entered;
      mocks.backgroundDb = intercepted(db, async (sql) => {
        if (sql.includes('insert into web_messages')) await server.wait();
      });
      const clientDb = intercepted(db, async (sql) => {
        if (sql === INSERT_MESSAGE_SQL) await client.wait();
      });
      const pendingServer = persistOnServer(`${SOURCE}\nStale continuation.`, truncated);
      const pendingClient = persistOnClient(
        `${SOURCE}\nStale client continuation.`,
        clientDb,
      ).catch((error: unknown) => error);
      await Promise.all([server.entered, client.entered]);

      save.release();
      expect((await pendingSave).status).toBe(200);
      server.release();
      client.release();
      await pendingServer;
      expect(await pendingClient).toMatchObject({
        statusCode: 409,
        details: { reason: ASSISTANT_CONTENT_CHANGED_REASON },
      });

      expect(await stored()).toMatchObject({
        content: EDITED,
        metadata: { [ASSISTANT_CONTENT_EDIT_METADATA_KEY]: expect.any(String) },
      });
      expect(mocks.indexArtifacts).toHaveBeenCalledOnce();
      expect(mocks.indexArtifacts.mock.calls[0]?.[0].content).toBe(EDITED);
      expect(mocks.logError).not.toHaveBeenCalled();
    },
  );

  it('refuses Save rather than claiming success when a writer wins before the source CAS', async () => {
    const save = pause();
    mocks.routeDb = intercepted(db, async (sql) => {
      if (sql === SAVE_ASSISTANT_CONTENT_EDIT_SQL) await save.wait();
    });
    const pendingSave = PATCH(editRequest(), context);
    await save.entered;
    await persistOnServer(`${SOURCE}\nWriter won first.`);
    save.release();

    expect((await pendingSave).status).toBe(409);
    expect((await stored()).content).toBe(`${SOURCE}\nWriter won first.`);
    expect((await stored()).metadata).not.toHaveProperty(ASSISTANT_CONTENT_EDIT_METADATA_KEY);
  });

  it('rechecks both already-issued upserts after waiting for an uncommitted saved edit', async () => {
    const commit = pause();
    const routeDb = intercepted(db, async () => {});
    routeDb.query = async <T>(sql: string, params?: unknown[]) => {
      if (sql !== SAVE_ASSISTANT_CONTENT_EDIT_SQL) return db.query<T>(sql, params);
      return db.transaction(async (tx) => {
        const rows = await tx.query<T>(sql, params);
        await commit.wait();
        return rows;
      });
    };
    mocks.routeDb = routeDb;
    const pendingSave = PATCH(editRequest(), context);
    await commit.entered;
    const pendingServer = persistOnServer(`${SOURCE}\nDelayed server write.`, true);
    const pendingClient = persistOnClient(`${SOURCE}\nDelayed client write.`).catch(
      (error: unknown) => error,
    );

    try {
      await vi.waitFor(async () => {
        const [row] = await db.query<{ waiting: number }>(`
          select count(*)::integer as waiting from pg_stat_activity
           where datname = current_database()
             and wait_event_type = 'Lock'
             and lower(query) like '%insert into web_messages%'
             and cardinality(pg_blocking_pids(pid)) > 0
        `);
        expect(row?.waiting).toBe(2);
      });
    } finally {
      commit.release();
    }

    expect((await pendingSave).status).toBe(200);
    await pendingServer;
    expect(await pendingClient).toMatchObject({ statusCode: 409 });
    expect((await stored()).content).toBe(EDITED);
    expect(mocks.indexArtifacts).toHaveBeenCalledOnce();
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it('persists a verified continuation suffix and indexes the full edited answer', async () => {
    expect((await PATCH(editRequest(), context)).status).toBe(200);
    const seed = await assertAssistantContinuationSeed({
      db,
      ...scope,
      messageId: MESSAGE_ID,
      seed: EDITED,
    });
    expect(seed).toMatchObject({ content: EDITED, editRevision: expect.any(String) });
    await persistOnServer('A new sentence.', false, seed!);

    const expected = `${EDITED} A new sentence.`;
    expect(await stored()).toMatchObject({
      content: expected,
      metadata: { [ASSISTANT_CONTENT_EDIT_METADATA_KEY]: seed!.editRevision },
    });
    expect(mocks.indexArtifacts.mock.calls.at(-1)?.[0].content).toBe(expected);
    await expect(
      persistOnClient(EDITED, db, 'assistant', {
        [ASSISTANT_CONTENT_EDIT_METADATA_KEY]: seed!.editRevision,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect((await stored()).content).toBe(expected);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it('accepts equal/full-prefix snapshots without duplicating the edited seed or losing provenance', async () => {
    expect((await PATCH(editRequest(), context)).status).toBe(200);
    const seed = await assertAssistantContinuationSeed({
      db,
      ...scope,
      messageId: MESSAGE_ID,
      seed: EDITED,
    });
    await persistOnServer(`${EDITED}\nFull continuation.`, false, seed!);
    const expected = `${EDITED}\nFull continuation.`;
    await expect(
      persistOnClient(expected, db, 'assistant', {
        [ASSISTANT_CONTENT_EDIT_METADATA_KEY]: false,
        clientOnly: true,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    const saved = await persistOnClient(expected, db, 'assistant', {
      [ASSISTANT_CONTENT_EDIT_METADATA_KEY]: seed!.editRevision,
      clientOnly: true,
    });

    expect(saved.content).toBe(expected);
    expect(await stored()).toMatchObject({
      content: expected,
      metadata: { [ASSISTANT_CONTENT_EDIT_METADATA_KEY]: seed!.editRevision, clientOnly: true },
    });
  });

  it('protects a newer edit made after continuation admission from that continuation and its cancelled/client snapshots', async () => {
    expect((await PATCH(editRequest(), context)).status).toBe(200);
    const seed = await assertAssistantContinuationSeed({
      db,
      ...scope,
      messageId: MESSAGE_ID,
      seed: EDITED,
    });
    expect((await PATCH(editRequest('Saved draft.', 'Saved twice.'), context)).status).toBe(200);
    const expected = EDITED.replace('Saved draft.', 'Saved twice.');
    const indexedBeforeStaleWrites = mocks.indexArtifacts.mock.calls.length;
    await persistOnServer('Old continuation.', true, seed!);
    await expect(
      persistOnClient(`${EDITED}\nOld client prefix.`, db, 'assistant', {
        [ASSISTANT_CONTENT_EDIT_METADATA_KEY]: seed!.editRevision,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect((await stored()).content).toBe(expected);
    expect(mocks.indexArtifacts).toHaveBeenCalledTimes(indexedBeforeStaleWrites);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it('rejects a stale captured revision even when a later Save keeps identical source', async () => {
    expect((await PATCH(editRequest(), context)).status).toBe(200);
    const old = await assertAssistantContinuationSeed({
      db,
      ...scope,
      messageId: MESSAGE_ID,
      seed: EDITED,
    });
    expect((await PATCH(editRequest('Saved draft.', 'Saved draft.'), context)).status).toBe(200);
    const current = await assertAssistantContinuationSeed({
      db,
      ...scope,
      messageId: MESSAGE_ID,
      seed: EDITED,
    });
    expect(current!.editRevision).not.toBe(old!.editRevision);
    const indexedBeforeStaleWrites = mocks.indexArtifacts.mock.calls.length;

    await persistOnServer('Old context.', false, old!);
    await expect(
      persistOnClient(`${EDITED}\nOld client context.`, db, 'assistant', {
        [ASSISTANT_CONTENT_EDIT_METADATA_KEY]: old!.editRevision,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect((await stored()).content).toBe(EDITED);
    expect(mocks.indexArtifacts).toHaveBeenCalledTimes(indexedBeforeStaleWrites);
    await persistOnServer('Current context.', false, current!);
    expect((await stored()).content).toBe(`${EDITED} Current context.`);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it('blocks cross-role overwrites and treats wildcard/unicode characters as literal prefix text', async () => {
    expect(
      (await PATCH(editRequest('Original draft.', 'Saved %_ 中文 draft.'), context)).status,
    ).toBe(200);
    const edited = SOURCE.replace('Original draft.', 'Saved %_ 中文 draft.');
    const admitted = await assertAssistantContinuationSeed({
      db,
      ...scope,
      messageId: MESSAGE_ID,
      seed: edited,
    });
    const proof = { [ASSISTANT_CONTENT_EDIT_METADATA_KEY]: admitted!.editRevision };
    await expect(
      persistOnClient(`${edited}\nUser write.`, db, 'user', proof),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(
      persistOnClient(edited.replace('%_', 'xx'), db, 'assistant', proof),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    await persistOnClient(`${edited}\nAccepted append.`, db, 'assistant', proof);

    expect((await stored()).content).toBe(`${edited}\nAccepted append.`);
  });

  it('does not let an incoming new-generation save mint edit provenance', async () => {
    await persistConversationMessage({
      db,
      scope,
      message: {
        id: NEW_MESSAGE_ID,
        role: 'assistant',
        content: 'First generation.',
        metadata: { [ASSISTANT_CONTENT_EDIT_METADATA_KEY]: true },
      },
    });
    await persistConversationMessage({
      db,
      scope,
      message: { id: NEW_MESSAGE_ID, role: 'assistant', content: 'Replacement generation.' },
    });
    const [row] = await db.query<{ content: string; metadata: Record<string, unknown> }>(
      'select content, metadata from web_messages where id = $1',
      [NEW_MESSAGE_ID],
    );

    expect(row?.content).toBe('Replacement generation.');
    expect(row?.metadata).not.toHaveProperty(ASSISTANT_CONTENT_EDIT_METADATA_KEY);
  });

  it('preserves authoritative provenance through a fresh-version sync save and rejects a later stale writer', async () => {
    expect((await PATCH(editRequest(), context)).status).toBe(200);
    const row = await stored();
    const response = await syncPush(
      new NextRequest('http://localhost/api/chat/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          protocolVersion: SYNC_PROTOCOL_VERSION,
          messages: [
            {
              id: MESSAGE_ID,
              conversationId: CONVERSATION_ID,
              role: 'assistant',
              content: EDITED,
              metadata: { syncOnly: true },
              baseVersion: row.server_version,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ applied: { messages: [{ id: MESSAGE_ID }] } });
    expect((await stored()).metadata).toMatchObject({
      [ASSISTANT_CONTENT_EDIT_METADATA_KEY]: expect.any(String),
      syncOnly: true,
    });
    await persistOnServer(`${SOURCE}\nLate server snapshot.`);
    expect((await stored()).content).toBe(EDITED);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it('accepts an unchanged sync payload without dropping provenance or advancing the version', async () => {
    expect((await PATCH(editRequest(), context)).status).toBe(200);
    const before = await stored();
    const response = await syncPush(
      new NextRequest('http://localhost/api/chat/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          protocolVersion: SYNC_PROTOCOL_VERSION,
          messages: [
            {
              id: MESSAGE_ID,
              conversationId: CONVERSATION_ID,
              role: 'assistant',
              content: EDITED,
              metadata: {},
              baseVersion: before.server_version,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ applied: { messages: [{ id: MESSAGE_ID }] } });
    expect(await stored()).toEqual(before);
  });

  it('rotates revision on an authoritative sync content edit even when metadata is omitted', async () => {
    expect((await PATCH(editRequest(), context)).status).toBe(200);
    const admitted = await assertAssistantContinuationSeed({
      db,
      ...scope,
      messageId: MESSAGE_ID,
      seed: EDITED,
    });
    const before = await stored();
    const response = await syncPush(
      new NextRequest('http://localhost/api/chat/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          protocolVersion: SYNC_PROTOCOL_VERSION,
          messages: [
            {
              id: MESSAGE_ID,
              conversationId: CONVERSATION_ID,
              role: 'assistant',
              content: 'Before.',
              baseVersion: before.server_version,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ applied: { messages: [{ id: MESSAGE_ID }] } });
    const current = await assertAssistantContinuationSeed({
      db,
      ...scope,
      messageId: MESSAGE_ID,
      seed: 'Before.',
    });
    expect(current!.editRevision).not.toBe(admitted!.editRevision);
    await persistOnServer('Old context.', false, admitted!);
    expect((await stored()).content).toBe('Before.');
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'preserves nullable metadata on an ordinary sync update (explicit=%s)',
    async (explicit) => {
      await db.execute("update web_messages set metadata = 'null'::jsonb where id = $1", [
        MESSAGE_ID,
      ]);
      const before = await stored();
      const response = await syncPush(
        new NextRequest('http://localhost/api/chat/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            protocolVersion: SYNC_PROTOCOL_VERSION,
            messages: [
              {
                id: MESSAGE_ID,
                conversationId: CONVERSATION_ID,
                role: 'assistant',
                content: `${SOURCE}\nSynced.`,
                ...(explicit ? { metadata: null } : {}),
                baseVersion: before.server_version,
              },
            ],
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ applied: { messages: [{ id: MESSAGE_ID }] } });
      expect((await stored()).metadata).toBeNull();
      expect(mocks.logError).not.toHaveBeenCalled();
    },
  );

  it('accepts nullable metadata on new sync messages without minting provenance', async () => {
    const response = await syncPush(
      new NextRequest('http://localhost/api/chat/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          protocolVersion: SYNC_PROTOCOL_VERSION,
          messages: [
            {
              id: NEW_MESSAGE_ID,
              conversationId: CONVERSATION_ID,
              role: 'assistant',
              content: 'New synced turn.',
              metadata: null,
              baseVersion: '0',
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      applied: { messages: [{ id: NEW_MESSAGE_ID }] },
    });
    const [row] = await db.query<{ metadata: unknown }>(
      'select metadata from web_messages where id = $1',
      [NEW_MESSAGE_ID],
    );
    expect(row?.metadata).toBeNull();
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it('retains provenance when a rating read precedes Save but its metadata write lands later', async () => {
    const rating = pause();
    const routeDb = intercepted(db, async () => {});
    routeDb.query = async <T>(sql: string, params?: unknown[]) => {
      const rows = await db.query<T>(sql, params);
      if (sql.startsWith('select metadata from web_messages')) await rating.wait();
      return rows;
    };
    mocks.routeDb = routeDb;
    const pendingRating = PATCH(
      new NextRequest(
        new URL(managedCloudMessagePath(CONVERSATION_ID, MESSAGE_ID), 'http://localhost'),
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reaction: 'thumbsUp' }),
        },
      ),
      context,
    );
    await rating.entered;
    expect((await PATCH(editRequest(), context)).status).toBe(200);
    rating.release();
    expect((await pendingRating).status).toBe(200);
    await persistOnServer(`${SOURCE}\nDelayed after the rating.`);

    expect(await stored()).toMatchObject({
      content: EDITED,
      metadata: { [ASSISTANT_CONTENT_EDIT_METADATA_KEY]: expect.any(String), reaction: 'thumbsUp' },
    });
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it('rejects a stale snapshot even when the shorter saved fence is its byte prefix', async () => {
    const original = '```writing\nDraft.\n```text\n```';
    const edited = '```writing\nDraft.\n```';
    await db.execute('update web_messages set content = $1 where id = $2', [original, MESSAGE_ID]);
    expect((await PATCH(editRequest('Draft.\n```text', 'Draft.'), context)).status).toBe(200);
    expect((await stored()).content).toBe(edited);
    expect(original.startsWith(edited)).toBe(true);
    await persistOnServer(original);

    expect((await stored()).content).toBe(edited);
  });

  it('detects an unguarded overwrite as a negative control for the real database harness', async () => {
    expect((await PATCH(editRequest(), context)).status).toBe(200);
    await db.execute(
      `
      insert into web_messages (id, conversation_id, role, content)
      values ($1, $2, 'assistant', $3)
      on conflict (id) do update set content = excluded.content
    `,
      [MESSAGE_ID, CONVERSATION_ID, SOURCE],
    );

    expect((await stored()).content).toBe(SOURCE);
  });
});
