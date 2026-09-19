import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const TURN_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'user-1';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({
  readPersistedAssistantTurn: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: vi.fn(), execute: vi.fn() },
    userId: USER_ID,
    organizationId: ORGANIZATION_ID,
  })),
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));
vi.mock('../../../../lib/assistant-turn-persistence', () => ({
  readPersistedAssistantTurn: mocks.readPersistedAssistantTurn,
}));

const { POST } = await import('./route');

function request(body: unknown, turnId = TURN_ID): NextRequest {
  return new NextRequest(
    `https://agiworkforce.com/api/llm/v1/chat/completions/runs/${turnId}/resume/stream`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
}

const context = (turnId = TURN_ID) => ({ params: Promise.resolve({ runId: turnId }) });

async function readBody(response: Response): Promise<string> {
  return await response.text();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /runs/[runId]/resume/stream', () => {
  it('replays only the characters the cursor has not covered', async () => {
    mocks.readPersistedAssistantTurn.mockResolvedValue({
      content: 'The first half. The second half.',
      model: 'model-under-test',
      truncated: false,
      truncationReason: null,
    });

    const response = await POST(
      request({ conversation_id: CONVERSATION_ID, cursor: { sequence: 9, characters: 16 } }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Stream-Resume')).toBe('turn-cursor');
    const body = await readBody(response as Response);
    expect(body).toContain('"content":"The second half."');
    expect(body).not.toContain('The first half.');
    expect(body).toContain('"finish_reason":"stop"');
    expect(body).toContain('"sequence":10');
  });

  it('sends nothing but a finish frame when the client already has the whole turn', async () => {
    mocks.readPersistedAssistantTurn.mockResolvedValue({
      content: 'all of it',
      model: 'model-under-test',
      truncated: true,
      truncationReason: 'stream_cancelled',
    });

    const response = await POST(
      request({ conversation_id: CONVERSATION_ID, cursor: { sequence: 3, characters: 99 } }),
      context(),
    );

    const body = await readBody(response as Response);
    expect(body).not.toContain('"content"');
    expect(body).toContain('"finish_reason":"stopped"');
    expect(response.headers.get('X-AGI-Stream-Truncation')).toBe('stream_cancelled');
    expect(response.headers.get('X-AGI-Stream-Resume-Characters')).toBe('0');
  });

  it('answers 404 for a turn this reader cannot see', async () => {
    mocks.readPersistedAssistantTurn.mockResolvedValue(null);

    const response = await POST(
      request({ conversation_id: CONVERSATION_ID, cursor: { sequence: 0, characters: 0 } }),
      context(),
    );

    expect(response.status).toBe(404);
  });

  it('refuses a turn id that is not a uuid without reading anything', async () => {
    const response = await POST(request({}, 'not-a-uuid'), context('not-a-uuid'));
    expect(response.status).toBe(404);
    expect(mocks.readPersistedAssistantTurn).not.toHaveBeenCalled();
  });

  it('refuses a cursor that names a negative position', async () => {
    const response = await POST(
      request({ conversation_id: CONVERSATION_ID, cursor: { sequence: -1, characters: 0 } }),
      context(),
    );
    expect(response.status).toBe(400);
    expect(mocks.readPersistedAssistantTurn).not.toHaveBeenCalled();
  });
});
