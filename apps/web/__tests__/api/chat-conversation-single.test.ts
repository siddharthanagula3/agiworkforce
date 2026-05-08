/**
 * Single Conversation API Tests
 *
 * Tests for /api/chat/conversations/[id] endpoints (GET, PUT, DELETE)
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

// RLS-bound Supabase client returned by getAuthenticatedUserWithClient.
// Tests set up .from() chains on this object to simulate DB responses.
const mockSupabaseData = {
  from: vi.fn(),
};

// Mock api-auth so routes receive {user, userDb: mockSupabaseData} directly,
// bypassing the real getServiceClient/getUserClient singleton calls.
const mockGetAuthenticatedUserWithClient = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUserWithClient: (...args: unknown[]) =>
    mockGetAuthenticatedUserWithClient(...args),
}));

// Import after mocks
import { GET, PUT, DELETE } from '@/app/api/chat/conversations/[id]/route';

describe('Single Conversation API', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const mockConversation = {
    id: 'conv-1',
    title: 'Test Conversation',
    model: 'auto',
    created_at: '2026-01-25T00:00:00Z',
    updated_at: '2026-01-25T00:00:00Z',
  };

  const mockMessages = [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      model: null,
      provider: null,
      input_tokens: 0,
      output_tokens: 0,
      cost_cents: 0,
      created_at: '2026-01-25T00:00:00Z',
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'Hi there!',
      model: 'gpt-5.4',
      provider: 'openai',
      input_tokens: 10,
      output_tokens: 5,
      cost_cents: 0.001,
      created_at: '2026-01-25T00:01:00Z',
    },
  ];

  const mockContext = { params: Promise.resolve({ id: 'conv-1' }) };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user — routes receive {user, userDb} via mocked helper.
    mockGetAuthenticatedUserWithClient.mockResolvedValue({
      user: mockUser,
      userDb: mockSupabaseData,
    });
  });

  describe('GET /api/chat/conversations/[id]', () => {
    describe('Authentication', () => {
      it('should return 401 if not authenticated', async () => {
        const { createError } = await import('@/lib/errors');
        mockGetAuthenticatedUserWithClient.mockRejectedValueOnce(createError.unauthorized());

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1');
        const response = await GET(request, mockContext);

        expect(response.status).toBe(401);
      });
    });

    describe('Fetching Conversation with Messages', () => {
      it('should return conversation with messages', async () => {
        // Mock conversation query
        const convQueryChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockConversation, error: null }),
        };

        // Mock messages query
        const msgQueryChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockMessages, error: null }),
        };

        mockSupabaseData.from.mockImplementation((table: string) => {
          if (table === 'web_conversations') {
            return convQueryChain;
          }
          if (table === 'web_messages') {
            return msgQueryChain;
          }
          return null;
        });

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.conversation).toEqual(mockConversation);
        expect(data.messages).toHaveLength(2);
      });

      it('should return 404 if conversation not found', async () => {
        mockSupabaseData.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  single: vi
                    .fn()
                    .mockResolvedValue({ data: null, error: { message: 'Not found' } }),
                }),
              }),
            }),
          }),
        });

        const request = new NextRequest('http://localhost/api/chat/conversations/nonexistent', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request, mockContext);

        expect(response.status).toBe(404);
      });

      it('should only return conversations owned by authenticated user', async () => {
        const eqMock = vi.fn().mockReturnThis();
        mockSupabaseData.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: eqMock,
            is: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockConversation, error: null }),
            }),
          }),
        });

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        await GET(request, mockContext);

        // Verify user_id filter is applied
        expect(eqMock).toHaveBeenCalledWith('user_id', 'user-123');
      });

      it('should return empty messages array when conversation has no messages', async () => {
        mockSupabaseData.from.mockImplementation((table: string) => {
          if (table === 'web_conversations') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({ data: mockConversation, error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'web_messages') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            };
          }
          return null;
        });

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.messages).toEqual([]);
      });

      it('should return 500 on messages fetch error', async () => {
        mockSupabaseData.from.mockImplementation((table: string) => {
          if (table === 'web_conversations') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({ data: mockConversation, error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'web_messages') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
                }),
              }),
            };
          }
          return null;
        });

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request, mockContext);

        expect(response.status).toBe(500);
      });
    });
  });

  describe('PUT /api/chat/conversations/[id]', () => {
    describe('Updating Conversation', () => {
      it('should update conversation title', async () => {
        const updateFn = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { ...mockConversation, title: 'Updated Title' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        });

        mockSupabaseData.from.mockReturnValue({ update: updateFn });

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title: 'Updated Title' }),
        });
        const response = await PUT(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.conversation.title).toBe('Updated Title');
      });

      it('should update conversation model', async () => {
        const updateFn = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { ...mockConversation, model: 'gpt-5.4' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        });

        mockSupabaseData.from.mockReturnValue({ update: updateFn });

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: 'gpt-5.4' }),
        });
        const response = await PUT(request, mockContext);

        expect(response.status).toBe(200);
        expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.4' }));
      });

      it('should return 404 if conversation not found', async () => {
        mockSupabaseData.from.mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi
                      .fn()
                      .mockResolvedValue({ data: null, error: { message: 'Not found' } }),
                  }),
                }),
              }),
            }),
          }),
        });

        const request = new NextRequest('http://localhost/api/chat/conversations/nonexistent', {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title: 'Updated Title' }),
        });
        const response = await PUT(request, mockContext);

        expect(response.status).toBe(404);
      });

      it('should return 401 if not authenticated', async () => {
        const { createError } = await import('@/lib/errors');
        mockGetAuthenticatedUserWithClient.mockRejectedValueOnce(createError.unauthorized());

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Updated Title' }),
        });
        const response = await PUT(request, mockContext);

        expect(response.status).toBe(401);
      });
    });
  });

  describe('DELETE /api/chat/conversations/[id]', () => {
    describe('Soft Deleting Conversation', () => {
      it('should soft delete conversation by setting deleted_at', async () => {
        const updateFn = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        });

        mockSupabaseData.from.mockReturnValue({ update: updateFn });

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          method: 'DELETE',
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await DELETE(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);

        // Verify soft delete (not hard delete)
        expect(updateFn).toHaveBeenCalledWith(
          expect.objectContaining({
            deleted_at: expect.any(String),
          }),
        );
      });

      it('should return 500 on database error', async () => {
        mockSupabaseData.from.mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
              }),
            }),
          }),
        });

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          method: 'DELETE',
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await DELETE(request, mockContext);

        expect(response.status).toBe(500);
      });

      it('should return 401 if not authenticated', async () => {
        const { createError } = await import('@/lib/errors');
        mockGetAuthenticatedUserWithClient.mockRejectedValueOnce(createError.unauthorized());

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          method: 'DELETE',
        });
        const response = await DELETE(request, mockContext);

        expect(response.status).toBe(401);
      });

      it('should only delete conversations owned by authenticated user', async () => {
        const eqMock = vi.fn().mockReturnThis();
        mockSupabaseData.from.mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: eqMock,
            is: vi.fn().mockResolvedValue({ error: null }),
          }),
        });

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          method: 'DELETE',
          headers: { Authorization: 'Bearer valid-token' },
        });
        await DELETE(request, mockContext);

        // Verify user_id filter is applied
        expect(eqMock).toHaveBeenCalledWith('user_id', 'user-123');
      });
    });
  });
});
