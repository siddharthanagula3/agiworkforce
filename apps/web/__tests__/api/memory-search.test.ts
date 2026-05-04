/**
 * Memory Search API Tests
 *
 * Tests for GET /api/memory/search?q=... (search user memories by content)
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
  id: 'mem-42',
  content: 'User prefers dark mode in the evening',
  category: 'preferences',
  source: 'web',
  created_at: '2024-03-10T08:00:00Z',
  updated_at: '2024-03-15T12:00:00Z',
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

// Build chainable mock query for the search route
// Pattern: .eq().eq().ilike().order().limit()
const mockLimit = vi.fn();
const mockOrder = vi.fn();
const mockIlike = vi.fn();
const mockEqIsDeleted = vi.fn();
const mockEqUserId = vi.fn();
const mockSelectFn = vi.fn();
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
import { GET } from '@/app/api/memory/search/route';

describe('Memory Search API', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Wire up the Supabase query chain for a successful search result
    mockLimit.mockResolvedValue({ data: [mockMemoryRow], error: null });
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockIlike.mockReturnValue({ order: mockOrder });
    mockEqIsDeleted.mockReturnValue({ ilike: mockIlike });
    mockEqUserId.mockReturnValue({ eq: mockEqIsDeleted });
    mockSelectFn.mockReturnValue({ eq: mockEqUserId });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_memories') {
        return { select: mockSelectFn };
      }
      return {};
    });
  });

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  describe('Authentication', () => {
    it('should return 401 when no session (cookie auth)', async () => {
      const { createServerClient } = await import('@supabase/ssr');
      vi.mocked(createServerClient).mockReturnValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'No session' },
          }),
        },
      } as never);

      const request = new NextRequest('http://localhost/api/memory/search?q=dark+mode', {
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

      const request = new NextRequest('http://localhost/api/memory/search?q=dark+mode', {
        method: 'GET',
        headers: { Authorization: 'Bearer bad-token' },
      });

      const response = await GET(request);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error.message).toMatch(/Authentication required|UNAUTHORIZED/);
    });

    it('should succeed with valid Bearer token', async () => {
      const request = new NextRequest('http://localhost/api/memory/search?q=dark+mode', {
        method: 'GET',
        headers: { Authorization: 'Bearer valid-jwt-token' },
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Input Validation
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Happy Path
  // ---------------------------------------------------------------------------

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
      mockLimit.mockResolvedValue({ data: [], error: null });

      const request = new NextRequest('http://localhost/api/memory/search?q=no-match', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.memories).toEqual([]);
      expect(data.query).toBe('no-match');
    });

    it('should return 200 with empty array when data is null', async () => {
      mockLimit.mockResolvedValue({ data: null, error: null });

      const request = new NextRequest('http://localhost/api/memory/search?q=test', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.memories).toEqual([]);
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
      mockLimit.mockResolvedValue({ data: [mockMemoryRow, secondRow], error: null });

      const request = new NextRequest('http://localhost/api/memory/search?q=dark+mode', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.memories).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should return 500 when database query fails', async () => {
      mockLimit.mockResolvedValue({
        data: null,
        error: { message: 'Connection timeout' },
      });

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

  // ---------------------------------------------------------------------------
  // LIKE Wildcard Escaping
  // ---------------------------------------------------------------------------

  describe('LIKE Wildcard Escaping', () => {
    it('should handle queries containing LIKE wildcard characters (%)  without error', async () => {
      const request = new NextRequest('http://localhost/api/memory/search?q=50%25+off', {
        method: 'GET',
      });

      const response = await GET(request);
      // Should not throw — wildcards are escaped server-side
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
