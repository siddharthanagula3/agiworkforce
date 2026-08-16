
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

const mockClerkAuth = vi.fn(() => Promise.resolve({ userId: 'user-123' }));
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
}));

const mockQuery = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (sql: string, params: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('account_status')) {
        return Promise.resolve([]);
      }
      return mockQuery(sql, params);
    },
    execute: vi.fn().mockResolvedValue(1),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

const mockMemoryRow = {
  id: 'mem-42',
  content: 'User prefers dark mode in the evening',
  category: 'preferences',
  source: 'web',
  created_at: '2024-03-10T08:00:00Z',
  updated_at: '2024-03-15T12:00:00Z',
};

import { GET } from '@/app/api/memory/search/route';

describe('Memory Search API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClerkAuth.mockResolvedValue({ userId: 'user-123' });
    mockQuery.mockResolvedValue([mockMemoryRow]);
  });

  describe('Authentication', () => {
    it('should return 401 when no session', async () => {
      mockClerkAuth.mockResolvedValueOnce({ userId: null as unknown as string });

      const request = new NextRequest('http://localhost/api/memory/search?q=dark+mode', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('should return 401 when userId is null', async () => {
      mockClerkAuth.mockResolvedValueOnce({ userId: null as unknown as string });

      const request = new NextRequest('http://localhost/api/memory/search?q=dark+mode', {
        method: 'GET',
        headers: { Authorization: 'Bearer bad-token' },
      });

      const response = await GET(request);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error.message).toMatch(/Authentication required|UNAUTHORIZED/i);
    });

    it('should succeed with valid session', async () => {
      const request = new NextRequest('http://localhost/api/memory/search?q=dark+mode', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
    });
  });

  describe('Input Validation', () => {
    it('should return 400 when query parameter q is missing', async () => {
      const request = new NextRequest('http://localhost/api/memory/search', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.message).toMatch(/[Ss]earch query/);
    });

    it('should return 400 when query parameter q is empty string', async () => {
      const request = new NextRequest('http://localhost/api/memory/search?q=', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.message).toMatch(/[Ss]earch query/);
    });

    it('should return 400 when query parameter q is whitespace only', async () => {
      const request = new NextRequest('http://localhost/api/memory/search?q=   ', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.message).toMatch(/[Ss]earch query/);
    });

    it('should return 400 when query exceeds 500 characters', async () => {
      const longQuery = 'x'.repeat(501);
      const request = new NextRequest(
        `http://localhost/api/memory/search?q=${encodeURIComponent(longQuery)}`,
        { method: 'GET' },
      );

      const response = await GET(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.message).toMatch(/500/);
    });

    it('should accept a query of exactly 500 characters', async () => {
      const maxQuery = 'a'.repeat(500);
      const request = new NextRequest(
        `http://localhost/api/memory/search?q=${encodeURIComponent(maxQuery)}`,
        { method: 'GET' },
      );

      const response = await GET(request);
      expect(response.status).toBe(200);
    });
  });

  describe('Happy Path', () => {
    it('should return 200 with matching memories and echo back query', async () => {
      const request = new NextRequest('http://localhost/api/memory/search?q=dark+mode', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.memories).toBeDefined();
      expect(Array.isArray(data.memories)).toBe(true);
      expect(data.memories).toHaveLength(1);
      expect(data.query).toBe('dark mode');
    });

    it('should map database row fields to camelCase response shape', async () => {
      const request = new NextRequest('http://localhost/api/memory/search?q=dark', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      const memory = data.memories[0];
      expect(memory.id).toBe('mem-42');
      expect(memory.content).toBe('User prefers dark mode in the evening');
      expect(memory.category).toBe('preferences');
      expect(memory.source).toBe('web');
      expect(memory.createdAt).toBe('2024-03-10T08:00:00Z');
      expect(memory.updatedAt).toBe('2024-03-15T12:00:00Z');
    });

    it('should return 200 with empty array when no memories match', async () => {
      mockQuery.mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/memory/search?q=no-match', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.memories).toEqual([]);
      expect(data.query).toBe('no-match');
    });

    it('should return multiple matching memories', async () => {
      const secondRow = {
        id: 'mem-99',
        content: 'Dark mode is also preferred on mobile',
        category: null,
        source: 'mobile',
        created_at: '2024-04-01T00:00:00Z',
        updated_at: '2024-04-05T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce([mockMemoryRow, secondRow]);

      const request = new NextRequest('http://localhost/api/memory/search?q=dark+mode', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.memories).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 when database query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection timeout'));

      const request = new NextRequest('http://localhost/api/memory/search?q=dark+mode', {
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

      const request = new NextRequest('http://localhost/api/memory/search?q=dark+mode', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(429);
    });
  });

  describe('LIKE Wildcard Escaping', () => {
    it('should handle queries containing LIKE wildcard characters (%) without error', async () => {
      const request = new NextRequest('http://localhost/api/memory/search?q=50%25+off', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
    });

    it('should handle queries containing underscore wildcard (_) without error', async () => {
      const request = new NextRequest('http://localhost/api/memory/search?q=hello_world', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
    });
  });
});
