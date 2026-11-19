import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isMessageContinuable } from '@agiworkforce/unified-chat/continue-generation';

const CONVERSATION_ID = '77777777-7777-4777-8777-777777777771';
const MESSAGE_ID = '88888888-8888-4888-8888-888888888881';
const USER_ID = 'user-owner';

type StoredRow = { content: string; model: string; metadata: Record<string, unknown> };

const rows = new Map<string, StoredRow>();

const db = {
  query: vi.fn(async (sql: string) => {
    if (sql.includes('select active_leaf_message_id')) return [{ active_leaf_message_id: null }];
    return [];
  }),
  execute: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (!sql.includes('insert into web_messages')) return 0;
    const id = String(params[0]);
    const incoming = JSON.parse(String(params[7])) as Record<string, unknown>;
    const previous = rows.get(id);
    rows.set(id, {
      content: String(params[2]),
      model: String(params[3]),
      metadata: { ...(previous?.metadata ?? {}), ...incoming },
    });
    return 1;
  }),
  transaction: vi.fn(),
};

type LoggerModule = typeof import('@/lib/logger');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type IndexArtifactsModule =
  typeof import('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => db,
}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({ createClaimedUserScopedDb: () => db }));
vi.mock(
  '@/app/api/chat/conversations/[id]/messages/lib/index-artifacts',
  async (importOriginal) => ({
    ...(await importOriginal<IndexArtifactsModule>()),
    scheduleArtifactIndexing: vi.fn(),
  }),
);

import {
  extractAssistantFinishReason,
  persistAssistantTurn,
  wireFinishReason,
  type AssistantTurnSnapshot,
} from './assistant-turn-persistence';
import type { ProcessedRequest } from './request-processor';

const processed = {
  requestId: 'req-finish-reason',
  conversationId: CONVERSATION_ID,
  assistantMessageId: MESSAGE_ID,
  conversationIsTemporary: false,
  organizationId: null,
  requestedModel: 'fixture-requested-model',
  usedFallback: false,
  chatRequest: { model: 'fixture-served-model' },
} as unknown as ProcessedRequest;

const COMPLETE = 'The capital of France is Paris. And then the model was cut';

function snapshot(overrides: Partial<AssistantTurnSnapshot> = {}): AssistantTurnSnapshot {
  return {
    content: COMPLETE,
    model: 'fixture-served-model',
    provider: 'fixture-provider',
    inputTokens: 12,
    outputTokens: 34,
    truncated: false,
    ...overrides,
  };
}

function reloaded(): { role: string; content: string; metadata: Record<string, unknown> } {
  const row = rows.get(MESSAGE_ID);
  expect(row, 'the turn should have been written').toBeDefined();
  return { role: 'assistant', content: row?.content ?? '', metadata: row?.metadata ?? {} };
}

beforeEach(() => {
  rows.clear();
  vi.clearAllMocks();
});

describe('the finish reason stored with an assistant turn', () => {
  it('reloads a turn that ended with stop as not continuable, even when its text reads as cut', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: snapshot({ finishReason: 'stop' }),
    });

    const message = reloaded();
    expect(message.metadata['finishReason']).toBe('stop');
    expect(isMessageContinuable(message)).toBe(false);
  });

  it('reloads a turn that hit the length limit as continuable', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: snapshot({ content: 'The capital of France is Paris.', finishReason: 'length' }),
    });

    const message = reloaded();
    expect(message.metadata['finishReason']).toBe('length');
    expect(isMessageContinuable(message)).toBe(true);
  });

  it('replaces the earlier reason when a Continue reuses the message id', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: snapshot({ finishReason: 'length' }),
    });
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: snapshot({ content: `${COMPLETE} short.`, finishReason: 'stop' }),
    });
    expect(reloaded().metadata['finishReason']).toBe('stop');

    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: snapshot({ finishReason: null }),
    });
    expect(reloaded().metadata).toHaveProperty('finishReason', null);
  });

  it('keeps the reason a client saved when a later server write does not know one', async () => {
    rows.set(MESSAGE_ID, {
      content: COMPLETE,
      model: 'fixture-served-model',
      metadata: { finishReason: 'stopped' },
    });

    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: snapshot({ truncated: true }),
    });

    expect(reloaded().metadata['finishReason']).toBe('stopped');
  });
});

describe('reading the finish reason the client was sent', () => {
  it('takes the last finish reason from wire events', () => {
    expect(
      wireFinishReason([
        { choices: [{ delta: { content: 'a' }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'max_tokens' }] },
        { usage: { prompt_tokens: 1 } },
      ]),
    ).toBe('max_tokens');
    expect(wireFinishReason([{ choices: [{ delta: { content: 'a' } }] }])).toBeNull();
  });

  it('takes the last finish reason from SSE bytes', () => {
    const encoder = new TextEncoder();
    expect(
      extractAssistantFinishReason(
        encoder.encode(
          'data: {"choices":[{"delta":{"content":"a"},"finish_reason":null}]}\n\n' +
            'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',
        ),
      ),
    ).toBe('length');
    expect(
      extractAssistantFinishReason(encoder.encode('data: {"choices":[{"delta":{}}]}\n\n')),
    ).toBeNull();
  });
});
