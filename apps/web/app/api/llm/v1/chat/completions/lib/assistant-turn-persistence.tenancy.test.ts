import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The pool below models migration 0037's two policies rather than mocking them
 * away: web_conversations is visible to app_rls only when user_id matches the
 * bound subject, and a web_messages row inherits that decision through its
 * conversation. Without it a mocked adapter answers every read the same way for
 * every caller, which is exactly the failure this path had.
 */
const OWNER_USER_ID = 'user-owner';
const OTHER_USER_ID = 'user-other';
const CONVERSATION_ID = '55555555-5555-4555-8555-555555555555';
const MESSAGE_ID = '66666666-6666-4666-8666-666666666666';
const RLS_ROLE = 'app_rls';

interface ConversationRow {
  id: string;
  userId: string;
  organizationId: string | null;
  activeLeafMessageId: string | null;
}

interface MessageRow {
  id: string;
  conversationId: string;
  content: string;
}

const store = {
  conversations: [] as ConversationRow[],
  messages: [] as MessageRow[],
  scopeAtWrite: [] as Array<{ role: string; subject: string | null }>,
};

let boundSubject: string | null = null;
let role = 'schema_owner';

function visibleConversation(id: string): ConversationRow | undefined {
  const row = store.conversations.find((candidate) => candidate.id === id);
  if (!row) return undefined;
  if (role === RLS_ROLE && row.userId !== boundSubject) return undefined;
  return row;
}

function readMessage(id: string): MessageRow | undefined {
  const row = store.messages.find((candidate) => candidate.id === id);
  if (!row) return undefined;
  return visibleConversation(row.conversationId) ? row : undefined;
}

async function runStatement(sql: string, params: unknown[] = []): Promise<unknown[]> {
  if (sql === `set local role ${RLS_ROLE}`) {
    role = RLS_ROLE;
    return [];
  }
  if (sql.includes("set_config('request.jwt.claim.sub'")) {
    boundSubject = String(params[0]);
    return [];
  }
  if (sql.includes('select active_leaf_message_id')) {
    const row = visibleConversation(String(params[0]));
    if (!row || row.userId !== String(params[1])) return [];
    return [{ active_leaf_message_id: row.activeLeafMessageId }];
  }
  if (sql.includes('insert into web_messages')) {
    const row = visibleConversation(String(params[1]));
    if (!row || row.userId !== String(params[8])) return [];
    store.scopeAtWrite.push({ role, subject: boundSubject });
    store.messages.push({
      id: String(params[0]),
      conversationId: row.id,
      content: String(params[2]),
    });
    return [{ id: String(params[0]) }];
  }
  return [];
}

const mocks = vi.hoisted(() => ({ scheduleArtifactIndexing: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts', () => ({
  scheduleArtifactIndexing: mocks.scheduleArtifactIndexing,
}));
vi.mock('@/lib/server/neon-db', () => {
  const tx = {
    query: runStatement,
    execute: async (sql: string, params: unknown[] = []) =>
      (await runStatement(sql, params)).length,
  };
  const pool = {
    ...tx,
    transaction: async (run: (handle: typeof tx) => Promise<unknown>) => {
      role = 'schema_owner';
      boundSubject = null;
      const result = await run(tx);
      role = 'schema_owner';
      boundSubject = null;
      return result;
    },
  };
  return { getNeonDb: () => pool };
});

const { persistAssistantTurn } = await import('./assistant-turn-persistence');
type ProcessedRequest = Parameters<typeof persistAssistantTurn>[0]['processed'];

function turnFor(userId: string) {
  return {
    userId,
    processed: {
      requestId: 'request-1',
      organizationId: null,
      conversationId: CONVERSATION_ID,
      assistantMessageId: MESSAGE_ID,
      conversationIsTemporary: false,
    } as ProcessedRequest,
    snapshot: {
      content: 'the answer the stream never delivered',
      model: 'fixture-model',
      provider: 'fixture-provider',
      inputTokens: 10,
      outputTokens: 2,
      truncated: true,
    },
  };
}

function readAs(userId: string): MessageRow | undefined {
  role = RLS_ROLE;
  boundSubject = userId;
  const row = readMessage(MESSAGE_ID);
  role = 'schema_owner';
  boundSubject = null;
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.conversations = [
    {
      id: CONVERSATION_ID,
      userId: OWNER_USER_ID,
      organizationId: null,
      activeLeafMessageId: null,
    },
  ];
  store.messages = [];
  store.scopeAtWrite = [];
  role = 'schema_owner';
  boundSubject = null;
});

describe('a turn persisted after the request context is gone', () => {
  it('writes on a connection already bound to the turn owner, not the schema owner', async () => {
    await persistAssistantTurn(turnFor(OWNER_USER_ID));

    expect(store.scopeAtWrite).toEqual([{ role: RLS_ROLE, subject: OWNER_USER_ID }]);
  });

  it('is visible to the user the turn carries', async () => {
    await persistAssistantTurn(turnFor(OWNER_USER_ID));

    expect(readAs(OWNER_USER_ID)?.content).toBe(turnFor(OWNER_USER_ID).snapshot.content);
  });

  it('is invisible to another tenant', async () => {
    await persistAssistantTurn(turnFor(OWNER_USER_ID));

    expect(readAs(OTHER_USER_ID)).toBeUndefined();
  });

  it('writes nothing when the claimed user does not own the conversation', async () => {
    await persistAssistantTurn(turnFor(OTHER_USER_ID));

    expect(store.messages).toEqual([]);
    expect(mocks.scheduleArtifactIndexing).not.toHaveBeenCalled();
  });
});
