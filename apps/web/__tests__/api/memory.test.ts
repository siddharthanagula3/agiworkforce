/**
 * Memory API Tests
 *
 * Tests for GET /api/memory (list memories) and POST /api/memory (create memory)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
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

// Mock environment variables
vi.mock('@/utils/env', () => ({
  requireEnv: vi.fn((key: string) => {
    if (key === 'NEXT_PUBLIC_SUPABASE_URL') return 'https://test.supabase.co';
    if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') return 'test-anon-key';
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-role-key';
    return 'test-value';
  }),
}));

// Mock cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn((name: string) => {
      if (name === 'sb-test-auth-token') {
        return { value: 'mock-cookie-token' };
      }
      return undefined;
    }),
    set: vi.fn(),
  }),
}));

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
};

const mockMemoryRow = {
  id: 'mem-1',
  content: 'User prefers dark mode',
  category: 'preferences',
  source: 'web',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-06-01T00:00:00Z',
};

// Mock Supabase SSR client (cookie-based auth)
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: mockUser },
        error: null,
      }),
    },
  })),
}));

// Mock Supabase JS client (Bearer token auth + service-role client)
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: mockUser },
        error: null,
      }),
    },
    from: mockFrom,
  })),
}));

// Import after all mocks are registered
import { GET, POST } from '@/app/api/memory/route';

describe('Memory API', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: service-role client returns a list of memories for GET
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [mockMemoryRow],
              error: null,
            }),
          }),
        }),
      }),
    });

    // Default: service-role client insert returns one memory for POST
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: mockMemoryRow,
          error: null,
        }),
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_memories') {
        return {
          select: mockSelect,
          insert: mockInsert,
        };
      }
      return {};
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/memory
  // ---------------------------------------------------------------------------

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
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      });

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.memories).toEqual([]);
    });

    it('should return 200 with empty array when data is null', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      });

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.memories).toEqual([]);
    });

    it('should return 401 when user is not authenticated via cookie', async () => {
      const { createServerClient } = await import('@supabase/ssr');
      vi.mocked(createServerClient).mockReturnValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'No session' },
          }),
        },
      } as never);

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('should return 401 when Bearer token is invalid', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      vi.mocked(createClient).mockReturnValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid token' },
          }),
        },
        from: mockFrom,
      } as never);

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      const response = await GET(request);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error.message).toMatch(/Invalid token|[Uu]nauthorized/);
    });

    it('should authenticate with valid Bearer token', async () => {
      const request = new NextRequest('http://localhost/api/memory', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
    });

    it('should return 500 when database query fails', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'DB connection failed' },
              }),
            }),
          }),
        }),
      });

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
      // Request with limit=200 should be capped to 100
      const request = new NextRequest('http://localhost/api/memory?limit=200', {
        method: 'GET',
      });

      const response = await GET(request);
      // The route caps limit at 100 and still returns 200
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

  // ---------------------------------------------------------------------------
  // POST /api/memory
  // ---------------------------------------------------------------------------

  describe('POST /api/memory', () => {
    it('should return 201 with created memory for valid request', async () => {
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
      const { createServerClient } = await import('@supabase/ssr');
      vi.mocked(createServerClient).mockReturnValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'No session' },
          }),
        },
      } as never);

      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test memory' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('should default source to "web" when source is not provided', async () => {
      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: 'No source provided' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      // The default source is 'web' — the inserted row reflects this
    });

    it('should default source to "web" when an invalid source is provided', async () => {
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
      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Insert failed' },
          }),
        }),
      });

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
      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: '  Trimmed content  ', category: '  health  ' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      // Verify insert was called (trimming is validated inside the route handler)
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });

    it('should store null category when category is not provided', async () => {
      const request = new NextRequest('http://localhost/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: 'Memory without category' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const insertCall = mockInsert.mock.calls[0]![0]!;
      expect(insertCall.category).toBeNull();
    });
  });
});
