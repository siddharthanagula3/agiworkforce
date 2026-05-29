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

// Mock Neon DB and Clerk auth — routes use these instead of Neon after Wave 3.
const mockQuery = vi.fn();
const mockExecute = vi.fn();
const mockRequireCurrentUserId = vi.fn();

vi.mock('@/lib/server/neon-chat', () => ({
  getNeonChatDb: () => ({ query: mockQuery, execute: mockExecute }),
  requireCurrentUserId: (...args: unknown[]) => mockRequireCurrentUserId(...args),
  normalizeMessageMetadata: (v: unknown) => v,
}));

// Import after mocks
import { GET, PUT, DELETE } from '@/app/api/chat/conversations/[id]/route';

describe('Single Conversation API', () => {
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

    // Default: authenticated user
    mockRequireCurrentUserId.mockResolvedValue('user-123');

    // Default: empty DB results
    mockQuery.mockResolvedValue([]);
    mockExecute.mockResolvedValue(undefined);
  });

  describe('GET /api/chat/conversations/[id]', () => {
    describe('Authentication', () => {
      it('should return 401 if not authenticated', async () => {
        const { createError } = await import('@/lib/errors');
        mockRequireCurrentUserId.mockRejectedValueOnce(createError.unauthorized());

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1');
        const response = await GET(request, mockContext);

        expect(response.status).toBe(401);
      });
    });

    describe('Fetching Conversation with Messages', () => {
      it('should return conversation with messages', async () => {
        // First query: conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // Second query: messages
        mockQuery.mockResolvedValueOnce(mockMessages);

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
        // Empty result = not found
        mockQuery.mockResolvedValueOnce([]);

        const request = new NextRequest('http://localhost/api/chat/conversations/nonexistent', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request, mockContext);

        expect(response.status).toBe(404);
      });

      it('should only return conversations owned by authenticated user', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce(mockMessages);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        await GET(request, mockContext);

        // Verify user_id filter is applied in the SQL
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('user_id'),
          expect.arrayContaining(['user-123']),
        );
      });

      it('should return empty messages array when conversation has no messages', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce([]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.messages).toEqual([]);
      });

      it('should return 500 on messages fetch error', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockRejectedValueOnce(new Error('DB error'));

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
        const updated = { ...mockConversation, title: 'Updated Title' };
        mockQuery.mockResolvedValueOnce([updated]);

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
        const updated = { ...mockConversation, model: 'gpt-5.4' };
        mockQuery.mockResolvedValueOnce([updated]);

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
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('update web_conversations'),
          expect.arrayContaining(['gpt-5.4']),
        );
      });

      it('should return 404 if conversation not found', async () => {
        // Empty result = no conversation matched (wrong user or not found)
        mockQuery.mockResolvedValueOnce([]);

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
        mockRequireCurrentUserId.mockRejectedValueOnce(createError.unauthorized());

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
        mockExecute.mockResolvedValueOnce(undefined);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          method: 'DELETE',
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await DELETE(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);

        // Verify soft delete uses deleted_at = now() (not hard delete)
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining('deleted_at'),
          expect.any(Array),
        );
      });

      it('should return 500 on database error', async () => {
        mockExecute.mockRejectedValueOnce(new Error('DB error'));

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          method: 'DELETE',
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await DELETE(request, mockContext);

        expect(response.status).toBe(500);
      });

      it('should return 401 if not authenticated', async () => {
        const { createError } = await import('@/lib/errors');
        mockRequireCurrentUserId.mockRejectedValueOnce(createError.unauthorized());

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          method: 'DELETE',
        });
        const response = await DELETE(request, mockContext);

        expect(response.status).toBe(401);
      });

      it('should only delete conversations owned by authenticated user', async () => {
        mockExecute.mockResolvedValueOnce(undefined);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1', {
          method: 'DELETE',
          headers: { Authorization: 'Bearer valid-token' },
        });
        await DELETE(request, mockContext);

        // Verify user_id filter is applied
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining('user_id'),
          expect.arrayContaining(['user-123']),
        );
      });
    });
  });
});
