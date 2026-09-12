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

const CITATIONS = [
  { type: 'url_citation' as const, url: 'https://reuters.com/a', title: 'Reuters' },
  { type: 'url_citation' as const, url: 'https://apnews.com/b', title: 'AP News' },
];

/**
 * A native-search turn cites outlets the provider's searched list never
 * mentions. With only the searched list on the row, a reloaded answer rendered
 * its [n] markers against a shorter list: the markers opened the wrong page or
 * nothing at all, and the Sources control counted fewer outlets than the live
 * session had shown.
 */
describe('an assistant turn persists the citations behind its [n] markers', () => {
  it('writes them under the key the transcript already reads, in marker order', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: {
        content: 'Two outlets agree [1][2].',
        model: 'fixture-model',
        provider: 'anthropic',
        inputTokens: 10,
        outputTokens: 20,
        truncated: false,
        sources: SOURCES,
        citations: CITATIONS,
      },
    });

    expect(persistedMetadata()['citations']).toEqual(CITATIONS);
    expect(persistedMetadata()['searchResults']).toEqual(SOURCES);
  });

  it('writes a turn whose only output was citations, which would otherwise be dropped', async () => {
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
        citations: CITATIONS,
      },
    });

    expect(persistedMetadata()['citations']).toEqual(CITATIONS);
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

    expect(persistedMetadata()).not.toHaveProperty('citations');
  });
});

const CODE_EXECUTION = { stdout: '42\n', stderr: '', returnCode: 0 };

/**
 * The result panel was written only by the client save. After a non-retryable
 * failure a reload rendered an answer that said "the script prints 42" with no
 * output panel anywhere: the one thing that made the claim checkable was gone.
 */
describe('an assistant turn persists what its code execution printed', () => {
  it('writes it under the key the transcript already reads', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: {
        content: 'The script prints 42.',
        model: 'fixture-model',
        provider: 'anthropic',
        inputTokens: 10,
        outputTokens: 20,
        truncated: false,
        codeExecutionResult: CODE_EXECUTION,
      },
    });

    expect(persistedMetadata()['codeExecutionResult']).toEqual(CODE_EXECUTION);
  });

  it('writes a turn whose only output was the run, which would otherwise be dropped', async () => {
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
        codeExecutionResult: { stdout: '', stderr: 'Traceback: boom', returnCode: 1 },
      },
    });

    expect(persistedMetadata()['codeExecutionResult']).toEqual({
      stdout: '',
      stderr: 'Traceback: boom',
      returnCode: 1,
    });
  });

  it('leaves the key out entirely when the turn ran no code', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: {
        content: 'No code was needed.',
        model: 'fixture-model',
        provider: 'anthropic',
        inputTokens: 10,
        outputTokens: 20,
        truncated: false,
      },
    });

    expect(persistedMetadata()).not.toHaveProperty('codeExecutionResult');
  });
});

const GENERATED_FILES = [
  {
    id: 'asset-1',
    fileName: 'chart.png',
    mimeType: 'image/png',
    uri: '/api/files/asset-1',
    byteCount: 2048,
    kind: 'image',
    surface: 'file' as const,
    previewable: true,
  },
];

/**
 * The bytes behind a generated file are persisted server-side and stay
 * downloadable. Only the row that points at them was client-written, so a
 * failed save dropped every chart and download chip off an answer whose text
 * still described them, and the files became unreachable from the transcript.
 */
describe('an assistant turn persists the files it attached', () => {
  it('writes them under the key the transcript already reads', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: {
        content: 'Here is the chart.',
        model: 'fixture-model',
        provider: 'anthropic',
        inputTokens: 10,
        outputTokens: 20,
        truncated: false,
        generatedFiles: GENERATED_FILES,
      },
    });

    expect(persistedMetadata()['generatedFiles']).toEqual(GENERATED_FILES);
  });

  it('writes a turn whose only output was files, which would otherwise be dropped', async () => {
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
        generatedFiles: GENERATED_FILES,
      },
    });

    expect(persistedMetadata()['generatedFiles']).toEqual(GENERATED_FILES);
  });

  it('leaves the key out entirely when the turn attached nothing', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: {
        content: 'Nothing to attach.',
        model: 'fixture-model',
        provider: 'anthropic',
        inputTokens: 10,
        outputTokens: 20,
        truncated: false,
      },
    });

    expect(persistedMetadata()).not.toHaveProperty('generatedFiles');
  });
});
