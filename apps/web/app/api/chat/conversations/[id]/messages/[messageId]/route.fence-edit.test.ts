import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH,
  MANAGED_CLOUD_CHAT_MAX_STORED_MESSAGE_LENGTH,
  managedCloudMessagePath,
} from '@agiworkforce/cloud-contracts';
import { EXPLICIT_ARTIFACT_DERIVATION_POLICY } from '@agiworkforce/artifacts';
import { TERMINAL_AGENT_TASK_STATES } from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { payloadCeilingBytes } from '@/lib/payload-ceiling';

const USER_ID = 'user-fence-edit';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_PATH = managedCloudMessagePath(CONVERSATION_ID, MESSAGE_ID);
const REQUEST_URL = new URL(MESSAGE_PATH, 'http://localhost').toString();
const OWNERSHIP_QUERY = /select id\s+from web_conversations/;
const MESSAGE_QUERY = /select role, content, metadata,/;
const SAVE_QUERY = /update web_messages\s+set content = \$1/;

const ORIGINAL = [
  'Before the blocks.',
  '',
  '```writing',
  'First draft.',
  '```',
  '',
  'Sibling prose.',
  '',
  '```python',
  'print("keep this code")',
  '```',
  '',
  '```prompt',
  'Second draft.',
  '```',
  '',
  'After the blocks.',
].join('\n');

const EDIT = {
  index: 1,
  language: 'prompt',
  source: 'Second draft.',
  content: 'Saved second draft.',
};
const EXPECTED = ORIGINAL.replace('Second draft.', EDIT.content);

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>(),
  execute: vi.fn(),
  csrf: vi.fn(),
  rateLimit: vi.fn(),
  indexArtifacts: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.auth }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.csrf }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.rateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('../lib/index-artifacts', () => ({ scheduleArtifactIndexing: mocks.indexArtifacts }));
vi.mock('@/lib/server/video-generation-transcript', () => ({
  failUnboundVideoGenerationTranscript: vi.fn(),
}));

const { PATCH } = await import('./route');
const context = { params: Promise.resolve({ id: CONVERSATION_ID, messageId: MESSAGE_ID }) };

interface StoredMessage {
  role: string;
  content: string;
  metadata: Record<string, unknown> | null;
  busy: boolean;
}

let stored: StoredMessage | undefined;
let ownsConversation: boolean;
let activeOrganizationId: string | null;
let saveConflict: boolean;

function request(
  body: unknown = { fenceEdit: EDIT },
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(REQUEST_URL, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function saveCalls() {
  return mocks.query.mock.calls.filter(([sql]) => SAVE_QUERY.test(sql));
}

function expectNoWrite() {
  expect(saveCalls()).toHaveLength(0);
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.indexArtifacts).not.toHaveBeenCalled();
}

async function databaseAnswer(sql: string, params: unknown[] = []): Promise<unknown[]> {
  if (OWNERSHIP_QUERY.test(sql)) {
    expect(sql).toMatch(/user_id = \$2/);
    expect(sql).toMatch(/organization_id is not distinct from \$3/);
    expect(sql).toMatch(/deleted_at is null/);
    expect(params).toEqual([CONVERSATION_ID, USER_ID, activeOrganizationId]);
    return ownsConversation ? [{ id: CONVERSATION_ID }] : [];
  }
  if (MESSAGE_QUERY.test(sql)) {
    expect(sql).toMatch(/where conversation_id = \$2 and state != all\(\$3::text\[\]\)/);
    expect(sql).toMatch(/where id = \$1 and conversation_id = \$2 and deleted_at is null/);
    expect(params).toEqual([MESSAGE_ID, CONVERSATION_ID, [...TERMINAL_AGENT_TASK_STATES]]);
    return stored ? [stored] : [];
  }
  if (SAVE_QUERY.test(sql)) {
    expect(sql).toMatch(/id = \$2 and conversation_id = \$3 and role = 'assistant'/);
    expect(sql).toMatch(/deleted_at is null and content = \$4/);
    expect(params.slice(1)).toEqual([
      MESSAGE_ID,
      CONVERSATION_ID,
      stored?.content,
      expect.any(String),
    ]);
    return saveConflict ? [] : [{ content: params[0], edit_revision: params[4] }];
  }
  throw new Error(`Unexpected database query: ${sql}`);
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  stored = { role: 'assistant', content: ORIGINAL, metadata: null, busy: false };
  ownsConversation = true;
  activeOrganizationId = ORGANIZATION_ID;
  saveConflict = false;
  mocks.auth.mockImplementation(async () => ({
    db: { query: mocks.query, execute: mocks.execute },
    userId: USER_ID,
    organizationId: activeOrganizationId,
  }));
  mocks.query.mockImplementation(databaseAnswer);
  mocks.csrf.mockResolvedValue(null);
  mocks.rateLimit.mockResolvedValue(null);
});

describe('PATCH assistant fence edits', () => {
  it('saves one editable block with a full-source compare-and-swap and preserves every sibling', async () => {
    stored!.metadata = { artifactDerivation: EXPLICIT_ARTIFACT_DERIVATION_POLICY };

    const response = await PATCH(request(), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      content: EXPECTED,
      editRevision: expect.any(String),
    });
    expect(saveCalls()).toHaveLength(1);
    expect(saveCalls()[0]?.[1]).toEqual([
      EXPECTED,
      MESSAGE_ID,
      CONVERSATION_ID,
      ORIGINAL,
      expect.any(String),
    ]);
    expect(mocks.indexArtifacts).toHaveBeenCalledExactlyOnceWith({
      db: { query: mocks.query, execute: mocks.execute },
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      content: EXPECTED,
      artifactDerivation: EXPLICIT_ARTIFACT_DERIVATION_POLICY,
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('waits for SQL confirmation before indexing the authoritative saved source', async () => {
    const authoritative = `${EXPECTED}\nSaved by the database.`;
    let confirmSave!: (rows: unknown[]) => void;
    const pendingSave = new Promise<unknown[]>((resolve) => {
      confirmSave = resolve;
    });
    mocks.query.mockImplementation((sql, params) =>
      SAVE_QUERY.test(sql) ? pendingSave : databaseAnswer(sql, params),
    );

    const pendingResponse = PATCH(request(), context);
    await vi.waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(mocks.indexArtifacts).not.toHaveBeenCalled();
    const editRevision = '33333333-3333-4333-8333-333333333333';
    confirmSave([{ content: authoritative, edit_revision: editRevision }]);
    const response = await pendingResponse;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, content: authoritative, editRevision });
    expect(mocks.indexArtifacts).toHaveBeenCalledOnce();
    expect(mocks.indexArtifacts.mock.calls[0]?.[0].content).toBe(authoritative);
    expect(mocks.indexArtifacts.mock.calls[0]?.[0]).not.toHaveProperty('artifactDerivation');
  });

  it.each([{ source: 'An old draft.' }, { index: 0 }, { index: 9 }, { language: 'writing' }])(
    'rejects a stale source or block identity: %j',
    async (change) => {
      const response = await PATCH(request({ fenceEdit: { ...EDIT, ...change } }), context);

      expect(response.status).toBe(409);
      expectNoWrite();
    },
  );

  it('returns a conflict when the whole message changes while the edit is being saved', async () => {
    saveConflict = true;

    const response = await PATCH(request(), context);

    expect(response.status).toBe(409);
    expect(saveCalls()).toHaveLength(1);
    expect(saveCalls()[0]?.[1]?.[3]).toBe(ORIGINAL);
    expect(mocks.indexArtifacts).not.toHaveBeenCalled();
  });

  it('requires authentication before querying ownership or writing content', async () => {
    mocks.auth.mockRejectedValue(createError.unauthorized());

    const response = await PATCH(request(), context);

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it.each([ORGANIZATION_ID, null])(
    'requires the parent conversation in active scope %s',
    async (organizationId) => {
      activeOrganizationId = organizationId;
      ownsConversation = false;

      const response = await PATCH(request(), context);

      expect(response.status).toBe(404);
      expect(mocks.query).toHaveBeenCalledOnce();
      expect(mocks.query.mock.calls[0]?.[0]).toMatch(OWNERSHIP_QUERY);
      expectNoWrite();
    },
  );

  it('requires the message to belong to the authorized parent conversation', async () => {
    stored = undefined;

    const response = await PATCH(request(), context);

    expect(response.status).toBe(404);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expectNoWrite();
  });

  it('rejects edits to a user message', async () => {
    stored!.role = 'user';

    const response = await PATCH(request(), context);

    expect(response.status).toBe(400);
    expectNoWrite();
  });

  it('rejects edits while a nonterminal run can still change the conversation', async () => {
    stored!.busy = true;

    const response = await PATCH(request(), context);

    expect(response.status).toBe(409);
    expectNoWrite();
  });

  it('honors CSRF rejection before rate limiting or reading chat data', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'CSRF required' }, { status: 403 }));

    const response = await PATCH(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it('honors the chat-message rate limit before reading chat data', async () => {
    mocks.rateLimit.mockResolvedValue(NextResponse.json({ error: 'Rate limit' }, { status: 429 }));
    const patchRequest = request();

    const response = await PATCH(patchRequest, context);

    expect(response.status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith(patchRequest, 'chat-message');
    expect(mocks.query).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it.each(['source', 'content'] as const)(
    'rejects an oversized %s before reading chat data',
    async (field) => {
      const response = await PATCH(
        request({
          fenceEdit: { ...EDIT, [field]: 'x'.repeat(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH + 1) },
        }),
        context,
      );

      expect(response.status).toBe(400);
      expect(mocks.query).not.toHaveBeenCalled();
      expectNoWrite();
    },
  );

  it('rejects a replacement that would make the complete message oversized', async () => {
    stored!.content =
      ORIGINAL + 'x'.repeat(MANAGED_CLOUD_CHAT_MAX_STORED_MESSAGE_LENGTH - ORIGINAL.length - 1);

    const response = await PATCH(
      request({ fenceEdit: { ...EDIT, content: 'x'.repeat(EDIT.source.length + 2) } }),
      context,
    );

    expect(response.status).toBe(400);
    expectNoWrite();
  });

  it('applies the declared transport ceiling before authenticating or reading chat data', async () => {
    const response = await PATCH(
      request(undefined, { 'content-length': String(payloadCeilingBytes(MESSAGE_PATH) + 1) }),
      context,
    );

    expect(response.status).toBe(413);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it.each([
    { fenceEdit: { ...EDIT, index: -1 } },
    { fenceEdit: { ...EDIT, index: 0.5 } },
    { fenceEdit: { ...EDIT, content: '' } },
    { fenceEdit: { ...EDIT, extra: 'unexpected' } },
    { fenceEdit: EDIT, reaction: 'thumbsUp' },
  ])('rejects an invalid fence edit shape before reading chat data: %j', async (body) => {
    const response = await PATCH(request(body), context);

    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
    expectNoWrite();
  });
});
