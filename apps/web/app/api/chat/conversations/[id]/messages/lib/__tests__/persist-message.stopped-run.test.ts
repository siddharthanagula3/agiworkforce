import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const RUN_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = 'user-1';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STOP_STATEMENT = /update web_messages[\s\S]*cancellation_requested_at/;

type NeonChatModule = typeof import('@/lib/server/neon-chat');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type LoggerModule = typeof import('@/lib/logger');
type TierUnitQuotaServiceModule = typeof import('@/lib/services/tier-unit-quota-service');
type GenerateTitleModule = typeof import('../generate-title');
type IndexArtifactsModule = typeof import('../index-artifacts');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  serviceExecute: vi.fn(),
}));

const db = {
  query: mocks.query,
  execute: mocks.execute,
  transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-chat', async (importOriginal) => ({
  ...(await importOriginal<NeonChatModule>()),
  normalizeMessageMetadata: (value: unknown) => value,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => {
  const pool = {
    query: vi.fn(async () => []),
    execute: mocks.serviceExecute,
    transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn(pool),
  };
  return {
    ...(await importOriginal<NeonDbModule>()),
    getNeonDb: () => pool,
  };
});
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => ({
  ...(await importOriginal<TierUnitQuotaServiceModule>()),
  assertFreeDailyAllowance: vi.fn(async () => undefined),
}));
vi.mock('../generate-title', async (importOriginal) => ({
  ...(await importOriginal<GenerateTitleModule>()),
  scheduleConversationTitleGeneration: vi.fn(),
}));
vi.mock('../index-artifacts', async (importOriginal) => ({
  ...(await importOriginal<IndexArtifactsModule>()),
  scheduleArtifactIndexing: vi.fn(),
}));
vi.mock('../resolve-source-urls', () => ({
  resolveSavedMessageSourceUrls: async (metadata: Record<string, unknown>) => metadata,
}));

const { persistConversationMessage } = await import('../persist-message');

const scope = { conversationId: CONVERSATION_ID, userId: USER_ID, organizationId: ORGANIZATION_ID };

function savedRow(metadata: Record<string, unknown>) {
  return {
    id: MESSAGE_ID,
    parent_id: null,
    role: 'assistant',
    content: 'Half an answer',
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    created_at: '2026-11-15T00:00:00.000Z',
    metadata,
  };
}

function runReference(): Record<string, unknown> {
  return { runId: RUN_ID, runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}` };
}

async function save(role: 'assistant' | 'user', metadata: Record<string, unknown>) {
  mocks.query
    .mockResolvedValueOnce([
      { id: CONVERSATION_ID, model: null, active_leaf_message_id: null, is_temporary: false },
    ])
    .mockResolvedValueOnce([savedRow(metadata)]);
  await persistConversationMessage({
    db: db as never,
    scope,
    message: { id: MESSAGE_ID, role, content: 'Half an answer', metadata },
  });
}

function stopStatements(): unknown[][] {
  return mocks.serviceExecute.mock.calls
    .filter(([sql]) => STOP_STATEMENT.test(String(sql)))
    .map(([, params]) => params as unknown[]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReset();
  mocks.execute.mockResolvedValue(1);
  mocks.serviceExecute.mockResolvedValue(1);
});

describe('a turn a client saves for a run the person stopped', () => {
  it('records the stop on the saved row of the run it references', async () => {
    await save('assistant', { cloudAgentRun: runReference(), agentActivity: [] });

    expect(stopStatements()).toEqual([
      [RUN_ID, USER_ID, ORGANIZATION_ID, 'stopped', null, MESSAGE_ID],
    ]);
  });

  it('leaves a reason the client saved', async () => {
    await save('assistant', { cloudAgentRun: runReference(), finishReason: 'stop' });
    await save('assistant', { cloudAgentRun: runReference(), finishReason: null });

    expect(stopStatements()).toEqual([]);
  });

  it('records nothing for a turn that references no run', async () => {
    await save('assistant', { agentActivity: [] });
    await save('assistant', { cloudAgentRun: { runId: 'not-a-run-id' } });

    expect(stopStatements()).toEqual([]);
  });

  it("records nothing for the person's own message", async () => {
    await save('user', { cloudAgentRun: runReference() });

    expect(stopStatements()).toEqual([]);
  });
});
