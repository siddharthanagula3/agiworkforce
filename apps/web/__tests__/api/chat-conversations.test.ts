/**
 * Chat Conversations API Tests
 *
 * Tests for /api/chat/conversations endpoints
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

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

// Mock Supabase clients
const mockSupabaseAuth = {
  auth: {
    getUser: vi.fn(),
    getSession: vi.fn(),
  },
};

const mockSupabaseData = {
  auth: {
    getUser: vi.fn(),
    getSession: vi.fn(),
  },
  from: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((_url: string, key: string) => {
    // Return different mock based on the key (anon vs service role)
    if (key.includes('service')) {
      return mockSupabaseData;
    }
    return mockSupabaseAuth;
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => mockSupabaseAuth),
}));

// Import after mocks
import { GET, POST } from '@/app/api/chat/conversations/route';

describe('Chat Conversations API', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const mockConversations = [
    {
      id: 'conv-1',
      title: 'Test Conversation 1',
      model: 'auto',
      created_at: '2026-01-25T00:00:00Z',
      updated_at: '2026-01-25T00:00:00Z',
    },
    {
      id: 'conv-2',
      title: 'Test Conversation 2',
      model: 'gpt-5.4',
      created_at: '2026-01-24T00:00:00Z',
      updated_at: '2026-01-24T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user (both auth and service-role clients)
    mockSupabaseAuth.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });
    // Service-role client is used by getAuthenticatedUser for Bearer token auth
    mockSupabaseData.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });
  });

  describe('GET /api/chat/conversations', () => {
    describe('Authentication', () => {
      it('should return 401 if no authorization header and no session', async () => {
        mockSupabaseAuth.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid token' },
        });
        mockSupabaseAuth.auth.getSession.mockResolvedValue({
          data: { session: null },
        });

        const request = new NextRequest('http://localhost/api/chat/conversations');
        const response = await GET(request);

        expect(response.status).toBe(401);
      });

      it('should authenticate with Bearer token', async () => {
        mockSupabaseData.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: mockConversations, error: null }),
                }),
              }),
            }),
          }),
        });

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.conversations).toHaveLength(2);
      });

      it('should reject invalid Bearer token', async () => {
        mockSupabaseData.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid token' },
        });

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer invalid-token' },
        });
        const response = await GET(request);

        expect(response.status).toBe(401);
      });
    });

    describe('Listing Conversations', () => {
      it('should return empty array when no conversations exist', async () => {
        mockSupabaseData.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        });

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.conversations).toEqual([]);
      });

      it('should return conversations ordered by updated_at desc', async () => {
        mockSupabaseData.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: mockConversations, error: null }),
                }),
              }),
            }),
          }),
        });

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.conversations[0].id).toBe('conv-1');
      });

      it('should filter out deleted conversations', async () => {
        const isNull = vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: mockConversations, error: null }),
          }),
        });

        mockSupabaseData.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: isNull,
            }),
          }),
        });

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request);

        expect(response.status).toBe(200);
        expect(isNull).toHaveBeenCalledWith('deleted_at', null);
      });

      it('should limit results to 50 conversations', async () => {
        const limitFn = vi.fn().mockResolvedValue({ data: mockConversations, error: null });

        mockSupabaseData.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: limitFn,
                }),
              }),
            }),
          }),
        });

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        await GET(request);

        expect(limitFn).toHaveBeenCalledWith(50);
      });

      it('should return 500 on database error', async () => {
        mockSupabaseData.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Database error' },
                  }),
                }),
              }),
            }),
          }),
        });

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request);

        expect(response.status).toBe(500);
      });
    });
  });

  describe('POST /api/chat/conversations', () => {
    describe('Creating Conversations', () => {
      it('should create conversation with default title and model', async () => {
        const insertFn = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'new-conv', title: 'New conversation', model: 'auto' },
              error: null,
            }),
          }),
        });

        mockSupabaseData.from.mockReturnValue({ insert: insertFn });

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await POST(request);

        expect(response.status).toBe(201);
        const data = await response.json();
        expect(data.conversation.title).toBe('New conversation');
        expect(data.conversation.model).toBe('auto');
      });

      it('should create conversation with custom title', async () => {
        const insertFn = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'new-conv', title: 'My Custom Title', model: 'auto' },
              error: null,
            }),
          }),
        });

        mockSupabaseData.from.mockReturnValue({ insert: insertFn });

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title: 'My Custom Title' }),
        });
        const response = await POST(request);

        expect(response.status).toBe(201);
        expect(insertFn).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'My Custom Title' }),
        );
      });

      it('should create conversation with specific model', async () => {
        const insertFn = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'new-conv', title: 'New conversation', model: 'gpt-5.4' },
              error: null,
            }),
          }),
        });

        mockSupabaseData.from.mockReturnValue({ insert: insertFn });

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: 'gpt-5.4' }),
        });
        const response = await POST(request);

        expect(response.status).toBe(201);
        expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.4' }));
      });

      it('should associate conversation with authenticated user', async () => {
        const insertFn = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'new-conv' },
              error: null,
            }),
          }),
        });

        mockSupabaseData.from.mockReturnValue({ insert: insertFn });

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token' },
        });
        await POST(request);

        expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-123' }));
      });

      it('should return 500 on database insert error', async () => {
        mockSupabaseData.from.mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Insert failed' },
              }),
            }),
          }),
        });

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await POST(request);

        expect(response.status).toBe(500);
      });

      it('should return 401 if not authenticated', async () => {
        mockSupabaseAuth.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid token' },
        });
        mockSupabaseAuth.auth.getSession.mockResolvedValue({
          data: { session: null },
        });

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
        });
        const response = await POST(request);

        expect(response.status).toBe(401);
      });
    });
  });
});
