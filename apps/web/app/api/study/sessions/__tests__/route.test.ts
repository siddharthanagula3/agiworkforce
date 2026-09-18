import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
  })),
}));

import { DELETE, GET, POST } from '../route';

const CONVERSATION = '11111111-1111-4111-8111-111111111111';

function row(over: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    conversation_id: CONVERSATION,
    topic: 'Eigenvalues',
    mode: 'learn',
    level: 'beginner',
    started_at: '2026-09-18T00:00:00.000Z',
    ended_at: null,
    ...over,
  };
}

function send(method: string, body?: unknown, query = ''): Request {
  return new Request(`https://app.test/api/study/sessions${query}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('GET', () => {
  it('lists the caller sessions on the scoped connection', async () => {
    mocks.query.mockResolvedValue([row()]);

    const response = await GET(send('GET') as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions[0]).toMatchObject({ topic: 'Eigenvalues', conversationId: CONVERSATION });
    expect(String(mocks.query.mock.calls[0]?.[0])).toMatch(/from public\.study_sessions/);
    expect((mocks.query.mock.calls[0]?.[1] as unknown[])[0]).toBe('user-1');
  });

  it('answers whether one conversation is a study session', async () => {
    mocks.query.mockResolvedValue([row()]);

    const response = await GET(send('GET', undefined, `?conversationId=${CONVERSATION}`) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toHaveLength(1);
    expect(String(mocks.query.mock.calls[0]?.[0])).toMatch(
      /where user_id = \$1 and conversation_id/,
    );
    expect((mocks.query.mock.calls[0]?.[1] as unknown[])[1]).toBe(CONVERSATION);
  });

  it('answers an empty list for a conversation that is not one', async () => {
    mocks.query.mockResolvedValue([]);

    const response = await GET(send('GET', undefined, `?conversationId=${CONVERSATION}`) as never);

    expect(response.status).toBe(200);
    expect((await response.json()).sessions).toEqual([]);
  });

  it('refuses a conversationId that is not a uuid rather than querying on it', async () => {
    const response = await GET(send('GET', undefined, '?conversationId=not-a-uuid') as never);

    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe('POST', () => {
  it('starts a session on an existing conversation', async () => {
    mocks.query.mockResolvedValue([row()]);

    const response = await POST(
      send('POST', {
        conversationId: CONVERSATION,
        topic: 'Eigenvalues',
        mode: 'learn',
        level: 'beginner',
      }) as never,
    );

    expect(response.status).toBe(201);
    expect(String(mocks.query.mock.calls[0]?.[0])).toMatch(
      /insert into public\.study_sessions[\s\S]*on conflict \(conversation_id\) do update/,
    );
  });

  it('refuses a mode or level the feature does not offer', async () => {
    const bad = await POST(
      send('POST', {
        conversationId: CONVERSATION,
        topic: 'Eigenvalues',
        mode: 'cram',
        level: 'beginner',
      }) as never,
    );

    expect(bad.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('refuses a blank topic', async () => {
    const response = await POST(
      send('POST', {
        conversationId: CONVERSATION,
        topic: '   ',
        mode: 'learn',
        level: 'beginner',
      }) as never,
    );

    expect(response.status).toBe(400);
  });
});

describe('DELETE', () => {
  it('ends the session and leaves the conversation alone', async () => {
    mocks.query.mockResolvedValue([row({ ended_at: '2026-09-18T02:00:00.000Z' })]);

    const response = await DELETE(send('DELETE', { conversationId: CONVERSATION }) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session.endedAt).toBe('2026-09-18T02:00:00.000Z');
    const sql = String(mocks.query.mock.calls[0]?.[0]);
    expect(sql).toMatch(/update public\.study_sessions/);
    expect(sql).not.toMatch(/web_conversations|web_messages/);
  });

  it('answers 404 when nothing is running on that conversation', async () => {
    mocks.query.mockResolvedValue([]);

    const response = await DELETE(send('DELETE', { conversationId: CONVERSATION }) as never);

    expect(response.status).toBe(404);
  });
});
