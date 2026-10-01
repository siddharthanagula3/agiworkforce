import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/rls-db');
type ScanModule1 = typeof import('@/lib/csrf');
type ScanModule2 = typeof import('@/lib/rate-limit');
type ScanModule3 = typeof import('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts');

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = 'user-1';

const mocks = vi.hoisted(() => ({
  statements: [] as string[],
  customConnectors: [] as Array<{ short_id: string; url: string }>,
}));

const db = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    mocks.statements.push(sql);
    if (sql.includes('from public.user_custom_connectors')) return mocks.customConnectors;
    if (sql.includes('insert into web_messages')) {
      return [{ kind: 'applied', id: MESSAGE_ID, server_version: '2', current: null }];
    }
    if (sql.includes('set google_user_data_at')) {
      expect(params).toEqual([[CONVERSATION_ID], USER_ID]);
    }
    return [];
  }),
  execute: vi.fn(async () => 0),
  transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(db)),
};

vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getUserScopedDb: vi.fn(async () => ({ db, userId: USER_ID, organizationId: null })),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock(
  '@/app/api/chat/conversations/[id]/messages/lib/index-artifacts',
  async (importOriginal) => ({
    ...(await importOriginal<ScanModule3>()),
    scheduleArtifactIndexing: vi.fn(),
  }),
);

const { POST } = await import('./route');

function push(metadata: Record<string, unknown>) {
  return POST(
    new NextRequest('https://example.invalid/api/chat/sync', {
      method: 'POST',
      body: JSON.stringify({
        protocolVersion: 2,
        messages: [
          {
            id: MESSAGE_ID,
            conversationId: CONVERSATION_ID,
            role: 'assistant',
            content: 'Ana asked about lunch on Friday.',
            metadata,
            baseVersion: '0',
          },
        ],
      }),
    }),
  );
}

function markIndex(): number {
  return mocks.statements.findIndex((sql) => sql.includes('set google_user_data_at = now()'));
}

beforeEach(() => {
  mocks.statements.length = 0;
  mocks.customConnectors = [];
});

describe('POST /api/chat/sync marks conversations that carry Google user data', () => {
  it.each([
    ['a Google tool entry by name', { tools: [{ name: 'mcp__gmail__search_threads' }] }],
    ['a Google tool entry by connector id', { tools: [{ connectorId: 'google-drive' }] }],
    [
      'an observed Google tool offer',
      { toolInvocations: { observed: true, offered: ['mcp__google-calendar__list_events'] } },
    ],
    [
      'a Google tool call',
      { tool_calls: [{ id: 'c', function: { name: 'mcp__google-contacts__search' } }] },
    ],
  ])('marks the conversation for %s, before the message is stored', async (_label, metadata) => {
    const response = await push(metadata);

    expect(response.status).toBe(200);
    const marked = markIndex();
    expect(marked).toBeGreaterThanOrEqual(0);
    expect(marked).toBeLessThan(
      mocks.statements.findIndex((sql) => sql.includes('insert into web_messages')),
    );
  });

  it('marks a conversation that called a custom connector served from a Google host', async () => {
    mocks.customConnectors = [{ short_id: 'abc123', url: 'https://sheets.googleapis.com/mcp' }];

    await push({ tools: [{ name: 'mcp__custom-abc123__read_range' }] });

    expect(markIndex()).toBeGreaterThanOrEqual(0);
  });

  it('leaves a conversation alone when its tools are not Google ones', async () => {
    mocks.customConnectors = [{ short_id: 'abc123', url: 'https://notgoogleapis.com.example/mcp' }];

    await push({
      tools: [{ name: 'mcp__github__search_issues' }, { name: 'mcp__custom-abc123__read' }],
      toolInvocations: { observed: false, offered: ['mcp__gmail__search_threads'] },
    });

    expect(markIndex()).toBe(-1);
  });
});
