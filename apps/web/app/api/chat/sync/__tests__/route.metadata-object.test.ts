import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSyncPullResponseSchema, SYNC_PROTOCOL_VERSION } from '@agiworkforce/cloud-contracts';

type WorkspaceGateModule = typeof import('@/lib/managed-compute-gate');
type QuotaModule = typeof import('@/lib/services/tier-unit-quota-service');
type StoppedRunTurnModule = typeof import('@/app/api/llm/v1/chat/completions/lib/stopped-run-turn');
type GoogleUserDataModule = typeof import('@/lib/connectors/google-user-data');

const { mockQuery, mockWarn } = vi.hoisted(() => ({ mockQuery: vi.fn(), mockWarn: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<WorkspaceGateModule>()),
  buildChatSyncGateResponse: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: mockWarn, debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => {
  const db = {
    query: (...args: unknown[]) => mockQuery(...args),
    execute: async (...args: unknown[]) => {
      await mockQuery(...args);
      return 0;
    },
    transaction: async <T>(run: (tx: unknown) => Promise<T>) => run(db),
  };
  return {
    getUserScopedDb: vi.fn(async () => ({
      db,
      userId: 'user_metadata_object',
      organizationId: null,
    })),
  };
});
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => ({
  ...(await importOriginal<QuotaModule>()),
  assertFreeDailyAllowance: vi.fn(async () => undefined),
}));
vi.mock('@/lib/connectors/google-user-data', async (importOriginal) => ({
  ...(await importOriginal<GoogleUserDataModule>()),
  markSyncedConversationsGoogleUserData: vi.fn(async () => undefined),
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/stopped-run-turn', async (importOriginal) => ({
  ...(await importOriginal<StoppedRunTurnModule>()),
  recordStoppedRunAssistantTurn: vi.fn(async () => undefined),
}));

import { GET, POST } from '../route';
import { jsonbObjectSql } from '@/lib/server/jsonb-object-merge';

const CONV_ID = '018f6f2a-0000-7000-8000-0000000000a1';
const GOOD_ID = '018f6f2a-0000-7000-8000-0000000000a2';
const BROKEN_ID = '018f6f2a-0000-7000-8000-0000000000a3';
const SCALAR_ID = '018f6f2a-0000-7000-8000-0000000000a4';
const NULL_ID = '018f6f2a-0000-7000-8000-0000000000a5';

function messageRow(id: string, metadata: unknown, serverVersion: string) {
  return {
    id,
    conversation_id: CONV_ID,
    parent_id: null,
    role: 'assistant',
    content: 'Image generation failed. Try again.',
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    metadata,
    created_at: '2026-11-17T00:00:01.000Z',
    updated_at: '2026-11-17T00:00:01.000Z',
    deleted_at: null,
    server_version: serverVersion,
  };
}

function pull() {
  return GET(
    new Request('http://localhost:3000/api/chat/sync?since=0', { method: 'GET' }) as never,
  );
}

function push(body: unknown) {
  return POST(
    new Request('http://localhost:3000/api/chat/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  );
}

describe('GET /api/chat/sync over a row whose metadata is not an object', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delivers every good row and the broken one repaired, instead of failing the page', async () => {
    const suggestions = ['Try a smaller image', 'Use another style'];
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        messageRow(GOOD_ID, { sources: [] }, '10'),
        messageRow(BROKEN_ID, [null, { followUpSuggestions: suggestions }], '11'),
        messageRow(SCALAR_ID, 'stop', '12'),
        messageRow(NULL_ID, null, '13'),
      ])
      .mockResolvedValueOnce([]);

    const response = await pull();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(ChatSyncPullResponseSchema.safeParse(body).success).toBe(true);

    const metadataById = Object.fromEntries(
      (body.messages as Array<{ id: string; metadata: unknown }>).map((row) => [
        row.id,
        row.metadata,
      ]),
    );
    expect(metadataById).toEqual({
      [GOOD_ID]: { sources: [] },
      [BROKEN_ID]: { followUpSuggestions: suggestions },
      [SCALAR_ID]: {},
      [NULL_ID]: null,
    });
    expect(body.cursor).toBe('13');
  });

  it('logs one warning per repaired row naming the row and never its content', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        messageRow(GOOD_ID, {}, '10'),
        messageRow(BROKEN_ID, [null, { followUpSuggestions: ['secret answer text'] }], '11'),
      ])
      .mockResolvedValueOnce([]);

    await pull();

    expect(mockWarn).toHaveBeenCalledTimes(1);
    const [fields] = mockWarn.mock.calls[0]!;
    expect(fields).toMatchObject({ messageId: BROKEN_ID });
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain('secret answer text');
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain('Image generation failed');
  });
});

describe('POST /api/chat/sync and metadata that is not an object', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads a pushed null metadata as an object before it is stored', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      String(sql).includes('insert into web_messages')
        ? [{ kind: 'applied', id: GOOD_ID, server_version: '20', current: null }]
        : [],
    );

    const response = await push({
      protocolVersion: SYNC_PROTOCOL_VERSION,
      messages: [
        {
          id: GOOD_ID,
          conversationId: CONV_ID,
          role: 'user',
          content: 'Draw a lighthouse',
          metadata: null,
          baseVersion: '0',
        },
      ],
    });

    expect(response.status).toBe(200);
    const sql = String(
      mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('insert into web_messages'),
      )?.[0],
    );
    expect(sql).toContain(`${jsonbObjectSql("item -> 'metadata'")} as metadata`);
    expect(sql).not.toContain("coalesce(item -> 'metadata', '{}'::jsonb)");
    expect(sql).toMatch(/metadata = \(select case jsonb_typeof\(candidate\.value\)/);
  });

  it('answers a conflict over a broken row with the row repaired', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      String(sql).includes('insert into web_messages')
        ? [
            {
              kind: 'conflict',
              id: BROKEN_ID,
              server_version: null,
              current: messageRow(BROKEN_ID, [null, { finishReason: 'stop' }], '30'),
            },
          ]
        : [],
    );

    const response = await push({
      protocolVersion: SYNC_PROTOCOL_VERSION,
      messages: [
        {
          id: BROKEN_ID,
          conversationId: CONV_ID,
          role: 'assistant',
          content: 'stale content',
          baseVersion: '29',
        },
      ],
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conflicts.messages[0].current.metadata).toEqual({ finishReason: 'stop' });
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: BROKEN_ID }),
      expect.any(String),
    );
  });
});
