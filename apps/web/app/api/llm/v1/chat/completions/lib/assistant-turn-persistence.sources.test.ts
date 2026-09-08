import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATION_ID = '55555555-5555-4555-8555-555555555555';
const MESSAGE_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = 'user-owner';

const executed: Array<{ sql: string; params: unknown[] }> = [];

const db = {
  query: vi.fn(async (sql: string) =>
    sql.includes('select active_leaf_message_id') ? [{ active_leaf_message_id: null }] : [],
  ),
  execute: vi.fn(async (sql: string, params: unknown[] = []) => {
    executed.push({ sql, params });
    return 1;
  }),
  transaction: vi.fn(),
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({ createClaimedUserScopedDb: () => db }));
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts', () => ({
  scheduleArtifactIndexing: vi.fn(),
}));

import { persistAssistantTurn } from './assistant-turn-persistence';
import type { ProcessedRequest } from './request-processor';

const processed = {
  requestId: 'req-1',
  conversationId: CONVERSATION_ID,
  assistantMessageId: MESSAGE_ID,
  conversationIsTemporary: false,
  organizationId: null,
} as unknown as ProcessedRequest;

const SOURCES = [
  { url: 'https://anthropic.com/news', title: 'Anthropic news', snippet: 'a snippet' },
  { url: 'https://claude.com/pricing', title: 'Pricing', snippet: '' },
];

function persistedMetadata(): Record<string, unknown> {
  const insert = executed.find((call) => call.sql.includes('insert into web_messages'));
  expect(insert, 'the turn should have been written').toBeDefined();
  return JSON.parse(String(insert?.params[7])) as Record<string, unknown>;
}

beforeEach(() => {
  executed.length = 0;
  vi.clearAllMocks();
});

/**
 * The client used to be the only writer of citations, through a save whose
 * failure handler was `console.error`. A reload after that failure showed the
 * answer text with every source gone and nothing saying so.
 */
describe('an assistant turn persists the sources it cited', () => {
  it('writes them under the key the transcript already reads', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: {
        content: 'The lineup is as follows.',
        model: 'fixture-model',
        provider: 'anthropic',
        inputTokens: 10,
        outputTokens: 20,
        truncated: false,
        sources: SOURCES,
      },
    });

    expect(persistedMetadata()['searchResults']).toEqual(SOURCES);
  });

  it('leaves the key out entirely when the turn cited nothing', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: {
        content: 'No search was needed.',
        model: 'fixture-model',
        provider: 'anthropic',
        inputTokens: 10,
        outputTokens: 20,
        truncated: false,
      },
    });

    expect(persistedMetadata()).not.toHaveProperty('searchResults');
  });

  it('writes a turn that produced only sources, which would otherwise be dropped', async () => {
    // The empty-snapshot short circuit reads content, truncation, run reference
    // and cards. Sources had to join it, or a cited turn whose text failed to
    // assemble would persist nothing at all.
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: {
        content: '   ',
        model: 'fixture-model',
        provider: 'anthropic',
        inputTokens: 0,
        outputTokens: 0,
        truncated: false,
        sources: SOURCES,
      },
    });

    expect(persistedMetadata()['searchResults']).toEqual(SOURCES);
  });
});
