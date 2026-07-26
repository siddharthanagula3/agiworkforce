import { beforeEach, describe, expect, it, vi } from 'vitest';

const feedbackRouteMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: feedbackRouteMocks.auth,
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: feedbackRouteMocks.query })),
}));

import { POST } from './route';

function request(body: unknown) {
  return new Request('http://localhost:3000/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feedbackRouteMocks.auth.mockResolvedValue({ userId: 'user-web' });
    feedbackRouteMocks.query.mockResolvedValue([]);
  });

  it('stores web composer feedback with bounded diagnostic metadata', async () => {
    const response = await POST(
      request({
        subject: 'Something is broken · Web chat',
        message: 'The artifact did not refresh.',
        metadata: {
          source: 'web',
          platform: 'web',
          version: '1.2.3',
          user_agent: 'test browser',
          page_path: '/chat/conversation-7',
          conversation_id: 'conversation-7',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(feedbackRouteMocks.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.feedback'),
      [
        'user-web',
        'Something is broken · Web chat',
        'The artifact did not refresh.',
        expect.stringContaining('"source":"web"'),
      ],
    );
    expect(feedbackRouteMocks.query.mock.calls[0]?.[1]?.[3]).toContain(
      '"conversation_id":"conversation-7"',
    );
  });

  it('keeps existing desktop payloads backward compatible', async () => {
    const response = await POST(
      request({
        subject: 'Desktop report',
        message: 'Something happened.',
        user_id: 'untrusted-client-id',
        metadata: {
          platform: 'macos',
          version: '1.0.0',
          user_agent: 'AGI Desktop',
        },
      }),
    );

    expect(response.status).toBe(200);
    const metadata = String(feedbackRouteMocks.query.mock.calls[0]?.[1]?.[3]);
    expect(metadata).toContain('"source":"desktop"');
    expect(metadata).toContain('"claimed_user_id":"untrusted-client-id"');
  });
});
