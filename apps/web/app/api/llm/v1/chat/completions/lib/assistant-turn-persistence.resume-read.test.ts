import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATION_ID = '55555555-5555-4555-8555-555555555555';
const MESSAGE_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = 'user-owner';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), claimedScope: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: (_db: unknown, scope: unknown) => {
    mocks.claimedScope(scope);
    return { query: mocks.query, execute: mocks.execute };
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { readPersistedAssistantTurn } = await import('./assistant-turn-persistence');

const read = () =>
  readPersistedAssistantTurn({
    userId: USER_ID,
    organizationId: ORGANIZATION_ID,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readPersistedAssistantTurn', () => {
  it('reads the turn through the conversation, scoped to the claimed owner', async () => {
    mocks.query.mockResolvedValue([
      { content: 'the answer so far', model: 'model-under-test', metadata: {} },
    ]);

    await expect(read()).resolves.toEqual({
      content: 'the answer so far',
      model: 'model-under-test',
      truncated: false,
      truncationReason: null,
    });

    expect(mocks.claimedScope).toHaveBeenCalledWith({
      userId: USER_ID,
      organizationId: ORGANIZATION_ID,
    });
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('join public.web_conversations c on c.id = m.conversation_id');
    expect(sql).toContain('c.user_id = $3');
    expect(sql).toContain("m.role = 'assistant'");
    expect(params).toEqual([MESSAGE_ID, CONVERSATION_ID, USER_ID, ORGANIZATION_ID]);
  });

  it('returns a turn stored with citation markup without it, so the replay offset counts what the client shows', async () => {
    mocks.query.mockResolvedValue([
      {
        content: 'Starship flew. \uE200cite\uE202turn0search0\uE201Next.',
        model: 'model-under-test',
        metadata: {},
      },
    ]);

    const turn = await read();

    expect(turn?.content).toBe('Starship flew. Next.');
    expect(turn?.content.slice('Starship flew. '.length)).toBe('Next.');
  });

  it('leaves a turn the provider filter already cleaned exactly as stored', async () => {
    mocks.query.mockResolvedValue([
      { content: 'Starship flew. Next.\n\n- one\n- two', model: 'model-under-test', metadata: {} },
    ]);

    await expect(read()).resolves.toMatchObject({
      content: 'Starship flew. Next.\n\n- one\n- two',
    });
  });

  it('reports a turn the stream never finished as truncated, with its reason', async () => {
    mocks.query.mockResolvedValue([
      {
        content: 'half an answer',
        model: 'model-under-test',
        metadata: JSON.stringify({ truncated: true, truncationReason: 'stream_cancelled' }),
      },
    ]);

    await expect(read()).resolves.toMatchObject({
      truncated: true,
      truncationReason: 'stream_cancelled',
    });
  });

  it('answers null when the row is not this reader to see', async () => {
    mocks.query.mockResolvedValue([]);
    await expect(read()).resolves.toBeNull();
  });
});
