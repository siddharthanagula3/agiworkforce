
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAuth, mockNeonQuery } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockNeonQuery: vi.fn(),
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
  auth: mockAuth,
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
  })),
}));

import { POST } from '../route';

function makeRequest(body: unknown) {
  return new Request('http://localhost:3000/api/mobile/content-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

const validBody = {
  reportId: 'rpt_1700000000000_abc123',
  messageId: 'msg-1',
  conversationId: 'conv-1',
  category: 'harmful',
  contentExcerpt: 'some excerpt',
  userNote: 'this is wrong',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockNeonQuery.mockResolvedValue([]);
});

describe('POST /api/mobile/content-report', () => {
  it('inserts a report attributed to the signed-in user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-1' });

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(200);
    expect(mockNeonQuery).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.content_reports'),
      [
        'user-1',
        'rpt_1700000000000_abc123',
        'msg-1',
        'conv-1',
        'harmful',
        'some excerpt',
        'this is wrong',
        expect.stringContaining('"source":"mobile"'),
      ],
    );
  });

  it('is idempotent on the client report id (on conflict do nothing)', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-1' });

    await POST(makeRequest(validBody));

    expect(mockNeonQuery).toHaveBeenCalledWith(
      expect.stringMatching(/on conflict \(client_report_id\) do nothing/i),
      expect.any(Array),
    );
  });

  it('accepts an anonymous report with a null user_id when not signed in', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(200);
    expect(mockNeonQuery).toHaveBeenCalledWith(expect.any(String), [
      null,
      'rpt_1700000000000_abc123',
      'msg-1',
      'conv-1',
      'harmful',
      'some excerpt',
      'this is wrong',
      expect.any(String),
    ]);
  });

  it('defaults optional excerpt/note to empty strings', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-1' });

    const res = await POST(
      makeRequest({
        reportId: 'rpt_x',
        messageId: 'm',
        conversationId: 'c',
        category: 'other',
      }),
    );

    expect(res.status).toBe(200);
    expect(mockNeonQuery).toHaveBeenCalledWith(expect.any(String), [
      'user-1',
      'rpt_x',
      'm',
      'c',
      'other',
      '',
      '',
      expect.any(String),
    ]);
  });

  it('400s on an invalid category', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-1' });

    const res = await POST(makeRequest({ ...validBody, category: 'spam' }));

    expect(res.status).toBe(400);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('400s on a missing conversationId', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-1' });

    const res = await POST(makeRequest({ reportId: 'r', messageId: 'm', category: 'harmful' }));

    expect(res.status).toBe(400);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('400s on a user note over 2000 characters', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-1' });

    const res = await POST(makeRequest({ ...validBody, userNote: 'x'.repeat(2001) }));

    expect(res.status).toBe(400);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });
});
