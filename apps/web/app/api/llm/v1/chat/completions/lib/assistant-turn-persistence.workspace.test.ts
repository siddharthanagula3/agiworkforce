import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(async () => [] as unknown[]) }));

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

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

describe('assistant turn workspace persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(1);
    // A conversation that has never branched: the single-statement path.
    mocks.query.mockResolvedValue([{ active_leaf_message_id: null }]);
  });

  it.each([null, ORGANIZATION_ID])(
    'binds the workspace captured at admission (%s)',
    async (organizationId) => {
      await persistAssistantTurn({
        userId: 'user-1',
        processed: {
          requestId: 'request-1',
          organizationId,
          conversationId: '22222222-2222-4222-8222-222222222222',
          assistantMessageId: '33333333-3333-4333-8333-333333333333',
          conversationIsTemporary: false,
        } as ProcessedRequest,
        snapshot: {
          content: 'Done',
          model: 'fixture-model',
          provider: 'fixture-provider',
          inputTokens: 10,
          outputTokens: 2,
          truncated: false,
        },
      });

      const [sql, params] = mocks.execute.mock.calls.find(([text]) =>
        String(text).includes('insert into web_messages'),
      ) as [string, unknown[]];
      expect(sql).toContain('c.organization_id is not distinct from $10::uuid');
      expect(params[9]).toBe(organizationId);
    },
  );
});
