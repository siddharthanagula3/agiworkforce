/**
 * Contract test for GET/POST /api/chat/sync.
 *
 * Asserts the live route handlers' JSON output parses against the shared
 * `ChatSyncPullResponseSchema` / `ChatSyncPushResponseSchema` from
 * @agiworkforce/services — the schemas mobile's cloudSyncEngine validates
 * every pulled page with. If the route's response shape drifts, this fails
 * first, before any client breaks in production.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatSyncPullResponseSchema, ChatSyncPushResponseSchema } from '@agiworkforce/services';

vi.mock('server-only', () => ({}));

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

// vi.fn(impl) creation-time implementations survive the config-level
// `mockReset: true` (which wipes .mockResolvedValue set in factories).
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user_contract_1',
  })),
}));

import { GET, POST } from '../route';

const CONV_ID = '018f6f2a-0000-7000-8000-000000000001';
const MSG_ID = '018f6f2a-0000-7000-8000-000000000002';
const ART_ID = '018f6f2a-0000-7000-8000-000000000003';

const conversationRow = {
  id: CONV_ID,
  title: 'Quarterly plan',
  model: 'model-x',
  project_id: null,
  pinned: false,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
  deleted_at: null,
  server_version: '42',
};

const messageRow = {
  id: MSG_ID,
  conversation_id: CONV_ID,
  role: 'assistant',
  content: 'Here is the plan…',
  model: 'model-x',
  provider: 'provider-y',
  input_tokens: 120,
  output_tokens: 480,
  cost_cents: 3,
  metadata: null,
  created_at: '2026-07-02T00:00:01.000Z',
  updated_at: '2026-07-02T00:00:01.000Z',
  deleted_at: null,
  server_version: '43',
};

const artifactRow = {
  id: ART_ID,
  conversation_id: CONV_ID,
  message_id: MSG_ID,
  title: 'plan.md',
  artifact_type: 'markdown',
  language: null,
  content: '# Plan',
  current_version: 1,
  pinned: false,
  tags: [],
  created_at: '2026-07-02T00:00:02.000Z',
  updated_at: '2026-07-02T00:00:02.000Z',
  deleted_at: null,
  server_version: '44',
};

function makeGet(since = '0') {
  return new Request(`http://localhost:3000/api/chat/sync?since=${since}`, {
    method: 'GET',
  }) as never;
}

function makePost(body: unknown) {
  return new Request('http://localhost:3000/api/chat/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('GET /api/chat/sync — shared cloud contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pull page with rows parses against ChatSyncPullResponseSchema', async () => {
    mockQuery
      .mockResolvedValueOnce([conversationRow]) // conversations
      .mockResolvedValueOnce([messageRow]) // messages
      .mockResolvedValueOnce([artifactRow]); // artifacts

    const res = await GET(makeGet());
    expect(res.status).toBe(200);

    const parsed = ChatSyncPullResponseSchema.safeParse(await res.json());
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cursor).toBe('44');
      expect(parsed.data.hasMore).toBe(false);
    }
  });

  it('empty pull page parses', async () => {
    mockQuery.mockResolvedValue([]);

    const res = await GET(makeGet('99'));
    const parsed = ChatSyncPullResponseSchema.safeParse(await res.json());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cursor).toBe('99');
  });
});

describe('POST /api/chat/sync — shared cloud contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('push ack parses against ChatSyncPushResponseSchema', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: CONV_ID, server_version: '45' }]) // conversation upsert
      .mockResolvedValueOnce([{ id: MSG_ID, server_version: '46' }]); // message insert

    const res = await POST(
      makePost({
        conversations: [
          { id: CONV_ID, title: 'Quarterly plan', updatedAt: '2026-07-02T00:00:00.000Z' },
        ],
        messages: [{ id: MSG_ID, conversationId: CONV_ID, role: 'user', content: 'hello' }],
      }),
    );
    expect(res.status).toBe(200);

    const parsed = ChatSyncPushResponseSchema.safeParse(await res.json());
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cursor).toBe('46');
  });

  it('empty push ack parses', async () => {
    const res = await POST(makePost({}));
    expect(ChatSyncPushResponseSchema.safeParse(await res.json()).success).toBe(true);
  });
});
