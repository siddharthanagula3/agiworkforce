// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { PostgresDatabaseAdapter, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { ASSISTANT_CONTENT_EDIT_METADATA_KEY } from '@agiworkforce/cloud-contracts';
import {
  getDefaultModelFor,
  getModelMetadataById,
  searchCitationId,
  sourceContentVersion,
} from '@agiworkforce/types';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  patchAssistantTurnSourceUrls,
  persistAssistantTurn,
  type AssistantTurnSnapshot,
} from '@/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { UPDATE_WORK_PLAN_REVIEW_SQL } from '@/app/api/chat/conversations/[id]/messages/lib/work-plan-review';
import { SAVE_ASSISTANT_CONTENT_EDIT_SQL } from '@/lib/server/assistant-content-edits';
import { forkConversation } from '@/lib/services/conversation-branch-service';

type LoggerModule = typeof import('@/lib/logger');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type QuotaModule = typeof import('@/lib/services/tier-unit-quota-service');
type IndexArtifactsModule =
  typeof import('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts');

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

const mocks = vi.hoisted(() => ({
  db: null as DatabaseAdapter | null,
  logError: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('node:dns/promises', () => ({
  default: { lookup: mocks.lookup },
  lookup: mocks.lookup,
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: mocks.logError },
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => {
    if (!mocks.db) throw new Error('The rolled-back transaction is not open.');
    return mocks.db;
  },
}));
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => ({
  ...(await importOriginal<QuotaModule>()),
  assertFreeDailyAllowance: vi.fn(async () => undefined),
}));
vi.mock(
  '@/app/api/chat/conversations/[id]/messages/lib/index-artifacts',
  async (importOriginal) => ({
    ...(await importOriginal<IndexArtifactsModule>()),
    scheduleArtifactIndexing: vi.fn(),
  }),
);

const MODEL = getDefaultModelFor('pro', 'chat');
const PROVIDER = getModelMetadataById(MODEL)?.provider;
if (!PROVIDER) throw new Error('The model catalog must supply the persistence fixture provider.');
const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/turn';
const PUBLISHER = 'https://www.reuters.com/world/story';

class RollBack extends Error {}

const database = live ? new PostgresDatabaseAdapter({ connectionString: liveDatabaseUrl }) : null;

afterAll(async () => {
  await database?.dispose();
});

beforeEach(() => {
  mocks.logError.mockClear();
  mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
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

interface Turn {
  tx: DatabaseAdapter;
  userId: string;
  conversationId: string;
  messageId: string;
}

async function inRolledBackTurn(
  storedMetadataSql: string,
  work: (turn: Turn) => Promise<void>,
): Promise<void> {
  const userId = `qa-metadata-merge-sites-${randomUUID()}`;
  await database!
    .transaction(async (tx) => {
      mocks.db = joined(tx);
      const conversationId = randomUUID();
      const messageId = randomUUID();
      await tx.execute(`insert into public.web_conversations (id, user_id) values ($1, $2)`, [
        conversationId,
        userId,
      ]);
      await tx.execute(
        `insert into public.web_messages (id, conversation_id, role, content, metadata)
         values ($1, $2, 'assistant', 'Draft answer', ${storedMetadataSql})`,
        [messageId, conversationId],
      );
      await work({ tx, userId, conversationId, messageId });
      throw new RollBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    })
    .finally(() => {
      mocks.db = null;
    });
}

async function stored(turn: Turn) {
  await turn.tx.execute('reset role');
  const [row] = await turn.tx.query<{
    kind: string;
    content: string;
    metadata: Record<string, unknown>;
  }>(
    `select jsonb_typeof(metadata) as kind, content, metadata
       from public.web_messages where id = $1`,
    [turn.messageId],
  );
  return row;
}

function processedFor(turn: Turn): ProcessedRequest {
  return {
    requestId: `req-${turn.messageId}`,
    conversationId: turn.conversationId,
    assistantMessageId: turn.messageId,
    conversationIsTemporary: false,
    organizationId: null,
    requestedModel: MODEL,
    usedFallback: false,
    chatRequest: { model: MODEL },
  } as unknown as ProcessedRequest;
}

function snapshot(content: string, finishReason: string): AssistantTurnSnapshot {
  return {
    content,
    model: MODEL,
    provider: PROVIDER!,
    inputTokens: 12,
    outputTokens: 34,
    truncated: false,
    finishReason,
  };
}

// llm-guardrail-allow: needs a loopback AGI_LIVE_DATABASE_URL at a migrated Postgres, which ci.yml js-verify sets for its test step; every case rolls its transaction back.
describe.skipIf(!live)('the metadata merge sites against PostgreSQL', () => {
  it('saves the same assistant turn twice over a stored JSON null, keeping an object', async () => {
    await inRolledBackTurn(`'null'::jsonb`, async (turn) => {
      const processed = processedFor(turn);
      await persistAssistantTurn({
        processed,
        userId: turn.userId,
        snapshot: snapshot('The first attempt', 'length'),
      });
      const first = await stored(turn);
      expect(first?.kind).toBe('object');
      expect(first?.content).toBe('The first attempt');
      expect(first?.metadata).toMatchObject({
        serverPersisted: true,
        requestId: processed.requestId,
        finishReason: 'length',
      });

      await persistAssistantTurn({
        processed,
        userId: turn.userId,
        snapshot: snapshot('The first attempt, finished', 'stop'),
      });
      const second = await stored(turn);
      expect(second?.kind).toBe('object');
      expect(second?.content).toBe('The first attempt, finished');
      expect(second?.metadata).toMatchObject({ serverPersisted: true, finishReason: 'stop' });
      expect(mocks.logError).not.toHaveBeenCalled();
    });
  });

  it('saves a turn over a row an earlier merge broke, keeping what that merge stored', async () => {
    await inRolledBackTurn(
      `'null'::jsonb || '{"followUpSuggestions": ["Why?"]}'::jsonb`,
      async (turn) => {
        await persistAssistantTurn({
          processed: processedFor(turn),
          userId: turn.userId,
          snapshot: snapshot('A finished answer', 'stop'),
        });
        const row = await stored(turn);
        expect(row?.kind).toBe('object');
        expect(row?.metadata).toMatchObject({
          followUpSuggestions: ['Why?'],
          serverPersisted: true,
          finishReason: 'stop',
        });
        expect(mocks.logError).not.toHaveBeenCalled();
      },
    );
  });

  it('patches the cited redirect to its publisher URL on a saved turn', async () => {
    const source = {
      id: searchCitationId({ url: REDIRECT }),
      url: REDIRECT,
      title: 'reuters.com',
      snippet: 'A snippet',
      contentVersion: sourceContentVersion({ url: REDIRECT, title: 'reuters.com', snippet: '' }),
      provenance: {
        providerId: 'provider_native_search',
        retrievedAt: '2026-11-17T12:00:00.000Z',
        indexedAt: null,
        delivery: 'indexed' as const,
        freshness: { publishedAt: null, ageDays: null, class: 'unknown' as const },
      },
    };
    await inRolledBackTurn(
      `jsonb_build_object('searchResults', jsonb_build_array(jsonb_build_object('url', '${REDIRECT}', 'title', 'reuters.com')))`,
      async (turn) => {
        const fetchImpl = vi.fn(
          async () => new Response(null, { status: 302, headers: { location: PUBLISHER } }),
        ) as unknown as typeof fetch;
        await patchAssistantTurnSourceUrls({
          processed: processedFor(turn),
          userId: turn.userId,
          sources: [source],
          overrides: { fetchImpl },
        });
        const row = await stored(turn);
        expect(row?.kind).toBe('object');
        expect(row?.metadata['searchResults']).toEqual([{ url: PUBLISHER, title: 'reuters.com' }]);
        expect(mocks.logError).not.toHaveBeenCalled();
      },
    );
  });

  it('writes a plan review onto a stored JSON null as an object', async () => {
    await inRolledBackTurn(`'null'::jsonb`, async (turn) => {
      const review = { reviewId: randomUUID(), state: 'pending' };
      const [written] = await turn.tx.query<{ id: string; review: unknown }>(
        UPDATE_WORK_PLAN_REVIEW_SQL,
        [
          JSON.stringify({ agiWorkPlanReview: review }),
          turn.messageId,
          turn.conversationId,
          'null',
        ],
      );
      expect(written).toEqual({ id: turn.messageId, review });
      const row = await stored(turn);
      expect(row).toMatchObject({ kind: 'object', metadata: { agiWorkPlanReview: review } });
    });
  });

  it('saves an edited answer onto a row an earlier merge broke as an object', async () => {
    await inRolledBackTurn(`'null'::jsonb || '{"finishReason": "stop"}'::jsonb`, async (turn) => {
      const revision = randomUUID();
      const [written] = await turn.tx.query<{ content: string; edit_revision: string }>(
        SAVE_ASSISTANT_CONTENT_EDIT_SQL,
        ['Edited answer', turn.messageId, turn.conversationId, 'Draft answer', revision],
      );
      expect(written).toEqual({ content: 'Edited answer', edit_revision: revision });
      const row = await stored(turn);
      expect(row).toMatchObject({
        kind: 'object',
        metadata: { finishReason: 'stop', [ASSISTANT_CONTENT_EDIT_METADATA_KEY]: revision },
      });
    });
  });

  it('copies a row an earlier merge broke into a branch as an object', async () => {
    await inRolledBackTurn(
      `'null'::jsonb || '{"followUpSuggestions": ["Why?"]}'::jsonb`,
      async (turn) => {
        const branch = await forkConversation(joined(turn.tx), turn.userId, {
          sourceConversationId: turn.conversationId,
          messageId: turn.messageId,
          requestId: randomUUID(),
        });
        const copies = await turn.tx.query<{ kind: string; metadata: unknown }>(
          `select jsonb_typeof(metadata) as kind, metadata
             from public.web_messages where conversation_id = $1`,
          [branch.id],
        );
        expect(copies).toEqual([{ kind: 'object', metadata: { followUpSuggestions: ['Why?'] } }]);
        expect((await stored(turn))?.kind).toBe('array');
      },
    );
  });
});
