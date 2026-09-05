import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(async (_sql: string, _params?: unknown[]): Promise<number> => 0),
  query: vi.fn(async (_sql: string, _params?: unknown[]): Promise<unknown[]> => []),
}));

vi.mock('@/lib/server/neon-db', () => {
  const pool = {
    execute: mocks.execute,
    query: mocks.query,
    transaction: (run: (tx: unknown) => Promise<unknown>) => run(pool),
  };
  return { getNeonDb: () => pool };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { persistAssistantTurn } from './assistant-turn-persistence';
import type { ProcessedRequest } from './request-processor';
import { logger } from '@/lib/logger';
import { deriveArtifacts } from '@agiworkforce/artifacts';

const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = 'user-1';

const HTML_ARTIFACT_CONTENT = [
  'Here is your page:',
  '',
  '```html',
  '<!doctype html><title>Report</title><h1>Hi</h1>',
  '```',
].join('\n');

function baseParams(content: string) {
  return {
    userId: USER_ID,
    processed: {
      requestId: 'request-1',
      organizationId: null,
      conversationId: CONVERSATION_ID,
      assistantMessageId: MESSAGE_ID,
      conversationIsTemporary: false,
    } as ProcessedRequest,
    snapshot: {
      content,
      model: 'fixture-model',
      provider: 'fixture-provider',
      inputTokens: 10,
      outputTokens: 2,
      truncated: false,
    },
  };
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('persistAssistantTurn -> artifact indexing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The web_messages upsert affected exactly one row unless a test says otherwise.
    mocks.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('insert into web_messages')) return 1;
      return 0;
    });
    // A conversation that has never branched: the single-statement path.
    mocks.query.mockResolvedValue([{ active_leaf_message_id: null }]);
  });

  it('indexes a renderable fence under the same id the client would derive', async () => {
    await persistAssistantTurn(baseParams(HTML_ARTIFACT_CONTENT));
    await flushMicrotasks();

    const expected = deriveArtifacts(HTML_ARTIFACT_CONTENT, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });
    expect(expected.length).toBeGreaterThan(0);

    const insertCall = mocks.execute.mock.calls.find((c) =>
      String(c[0]).includes('insert into web_artifact_index'),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[0]).toEqual(expected.map((a) => a.id));
    expect(params[1]).toBe(USER_ID);
    expect(params[2]).toBe(CONVERSATION_ID);
    expect(params[3]).toBe(MESSAGE_ID);
  });

  it('does not fail or delay persistence when the indexer fails', async () => {
    mocks.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('insert into web_messages')) return 1;
      if (sql.includes('web_artifact_index')) throw new Error('index db down');
      return 0;
    });

    await expect(persistAssistantTurn(baseParams(HTML_ARTIFACT_CONTENT))).resolves.toBeUndefined();
    await flushMicrotasks();

    // The message insert itself is unaffected by the indexer throwing.
    expect(
      mocks.execute.mock.calls.some((c) => String(c[0]).includes('insert into web_messages')),
    ).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CONVERSATION_ID, messageId: MESSAGE_ID }),
      expect.stringContaining('failed to index message artifacts'),
    );
  });

  it('clears any prior index row but writes nothing for non-renderable content', async () => {
    await persistAssistantTurn(baseParams('Just prose, no fenced blocks at all.'));
    await flushMicrotasks();

    const artifactCalls = mocks.execute.mock.calls.filter((c) =>
      String(c[0]).includes('web_artifact_index'),
    );
    expect(artifactCalls).toHaveLength(1);
    expect(String(artifactCalls[0]![0])).toContain('delete from web_artifact_index');
  });

  it('never invokes the indexer when the message insert affects no rows', async () => {
    mocks.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('insert into web_messages')) return 0;
      return 0;
    });

    await persistAssistantTurn(baseParams(HTML_ARTIFACT_CONTENT));
    await flushMicrotasks();

    expect(mocks.execute.mock.calls.some((c) => String(c[0]).includes('web_artifact_index'))).toBe(
      false,
    );
  });
});
