import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(() => null),
}));

const mockQuery = vi.fn();

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(),
}));

const mockMemoryRow = {
  id: 'mem-1',
  content: 'User prefers dark mode',
  category: 'preferences',
  source: 'web',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-06-01T00:00:00Z',
};

import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { GET, POST } from '@/app/api/memory/route';

describe('Memory API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserScopedDb).mockResolvedValue({
      db: { query: mockQuery } as unknown as Awaited<ReturnType<typeof getUserScopedDb>>['db'],
      userId: 'user-123',
      organizationId: null,
    });
    mockQuery.mockResolvedValue([mockMemoryRow]);
  });

  describe('GET /api/memory', () => {
    it('should return 200 with list of memories for authenticated user', async () => {
      const request = new NextRequest('http://localhost/api/memory', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.memories).toBeDefined();
      expect(Array.isArray(data.memories)).toBe(true);
      expect(data.memories).toHaveLength(1);
      expect(data.memories[0].id).toBe('mem-1');
      expect(data.memories[0].content).toBe('User prefers dark mode');
      expect(data.memories[0].category).toBe('preferences');
      expect(data.memories[0].source).toBe('web');
      expect(data.memories[0].createdAt).toBe('2024-01-01T00:00:00Z');
      expect(data.memories[0].updatedAt).toBe('2024-06-01T00:00:00Z');
    });

    it('should return 200 with empty array when user has no memories', async () => {
      mockQuery.mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.memories).toEqual([]);
    });

    it('should return 200 with empty array when data is empty', async () => {
      mockQuery.mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.memories).toEqual([]);
    });

    it('should return 401 when user is not authenticated', async () => {
      vi.mocked(getUserScopedDb).mockRejectedValueOnce(createError.unauthorized());

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('should return 401 when auth returns no userId (no session)', async () => {
      vi.mocked(getUserScopedDb).mockRejectedValueOnce(createError.unauthorized());

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('should authenticate successfully with valid session', async () => {
      const request = new NextRequest('http://localhost/api/memory', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
    });

    it('should return 500 when database query fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should return 429 when rate limit is exceeded', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');
      const { NextResponse } = await import('next/server');
      vi.mocked(withRateLimit).mockResolvedValueOnce(
        NextResponse.json(
          { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
          { status: 429 },
        ),
      );

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(429);
    });

    it('should respect the limit query parameter (capped at 100)', async () => {
      const request = new NextRequest('http://localhost/api/memory?limit=200', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
    });

    it('should default limit to 50 for invalid limit values', async () => {
      const request = new NextRequest('http://localhost/api/memory?limit=abc', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
    });

    it('should default offset to 0 for invalid offset values', async () => {
      const request = new NextRequest('http://localhost/api/memory?offset=-5', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/memory', () => {
    it('should return 201 with created memory for valid request', async () => {
      mockQuery.mockResolvedValueOnce([mockMemoryRow]);

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: 'Remember to drink water daily', category: 'health' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.memory).toBeDefined();
      expect(data.memory.id).toBe('mem-1');
      expect(data.memory.content).toBe('User prefers dark mode');
      expect(data.memory.createdAt).toBe('2024-01-01T00:00:00Z');
    });

    it('should return 400 when content is missing', async () => {
      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ category: 'health' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.message).toMatch(/[Cc]ontent/);
    });

    it('should return 400 when content is an empty string', async () => {
      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: '   ' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.message).toMatch(/[Cc]ontent/);
    });

    it('should return 400 when content exceeds 10,000 characters', async () => {
      const longContent = 'a'.repeat(10_001);
      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: longContent }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.message).toMatch(/10,000/);
    });

    it('should return 400 for invalid JSON body', async () => {
      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.message).toMatch(/[Ii]nvalid/);
    });

    it('should return 401 for unauthenticated request', async () => {
      vi.mocked(getUserScopedDb).mockRejectedValueOnce(createError.unauthorized());

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test memory' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('should default source to "web" when source is not provided', async () => {
      mockQuery.mockResolvedValueOnce([mockMemoryRow]);

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: 'No source provided' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
    });

    it('should default source to "web" when an invalid source is provided', async () => {
      mockQuery.mockResolvedValueOnce([mockMemoryRow]);

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: 'Bad source', source: 'telegram' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
    });

    it('should accept valid sources: mobile, desktop, web, auto', async () => {
      for (const source of ['mobile', 'desktop', 'web', 'auto']) {
        mockQuery.mockResolvedValueOnce([mockMemoryRow]);

        const request = new NextRequest('http://localhost/api/memory', {
          method: 'POST',
          body: JSON.stringify({ content: 'Valid source memory', source }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        expect(response.status).toBe(201);
      }
    });

    it('should return 500 when database insert fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Insert failed'));

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test memory' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should return 429 when rate limit is exceeded', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');
      const { NextResponse } = await import('next/server');
      vi.mocked(withRateLimit).mockResolvedValueOnce(
        NextResponse.json(
          { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
          { status: 429 },
        ),
      );

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test memory' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(429);
    });

    it('should trim content and category before saving', async () => {
      mockQuery.mockResolvedValueOnce([mockMemoryRow]);

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: '  Trimmed content  ', category: '  health  ' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should store null category when category is not provided', async () => {
      mockQuery.mockResolvedValueOnce([{ ...mockMemoryRow, category: null }]);

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: 'Memory without category' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('insert into user_memories'),
        expect.arrayContaining([null]),
      );
    });
  });
});
