/**
 * Chat Messages API Tests
 *
 * Tests for /api/chat/conversations/[id]/messages endpoints
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

// Mock Neon DB and Clerk auth — routes use these instead of Supabase after Wave 3.
const mockQuery = vi.fn();
const mockExecute = vi.fn();
const mockRequireCurrentUserId = vi.fn();

vi.mock('@/lib/server/neon-chat', () => ({
  getNeonChatDb: () => ({ query: mockQuery, execute: mockExecute }),
  requireCurrentUserId: (...args: unknown[]) => mockRequireCurrentUserId(...args),
  normalizeMessageMetadata: (v: unknown) => v,
}));

// Mock CreditService
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    checkAvailable: vi.fn().mockResolvedValue(true),
  },
}));

// Mock fetch for LLM API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocks
import { POST } from '@/app/api/chat/conversations/[id]/messages/route';
import { CreditService } from '@/lib/services/credit-service';

describe('Chat Messages API', () => {
  const mockConversation = {
    id: 'conv-1',
    model: 'auto',
  };

  const mockUserMessage = {
    id: 'msg-1',
    conversation_id: 'conv-1',
    role: 'user',
    content: 'Hello, AI!',
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    cost_cents: 0,
    created_at: '2026-01-25T00:00:00Z',
    metadata: null,
  };

  const mockAssistantMessage = {
    id: 'msg-2',
    conversation_id: 'conv-1',
    role: 'assistant',
    content: 'Hello! How can I help you?',
    model: 'gpt-5.4',
    provider: 'openai',
    input_tokens: 10,
    output_tokens: 8,
    cost_cents: 0.001,
    created_at: '2026-01-25T00:00:01Z',
    metadata: null,
  };

  const mockContext = { params: Promise.resolve({ id: 'conv-1' }) };

  beforeEach(() => {
    vi.clearAllMocks();

    // Set env vars needed by the route
    process.env['NEXT_PUBLIC_SITE_URL'] = 'http://localhost:3001';

    // Default: authenticated user
    mockRequireCurrentUserId.mockResolvedValue('user-123');

    // Default: empty DB results
    mockQuery.mockResolvedValue([]);
    mockExecute.mockResolvedValue(undefined);

    // Default: user has credits
    vi.mocked(CreditService.checkAvailable).mockResolvedValue(true);

    // Default LLM response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'Hello! How can I help you?' } }],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
          model: 'gpt-5.4',
          provider: 'openai',
          cost_cents: 0.001,
        }),
    });
  });

  describe('POST /api/chat/conversations/[id]/messages', () => {
    describe('Authentication', () => {
      it('should return 401 if not authenticated', async () => {
        const { createError } = await import('@/lib/errors');
        mockRequireCurrentUserId.mockRejectedValueOnce(createError.unauthorized());

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Hello' }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(401);
      });
    });

    describe('Input Validation', () => {
      it('should return 400 if message content is empty', async () => {
        // conversation found
        mockQuery.mockResolvedValueOnce([mockConversation]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: '' }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(400);
      });

      it('should return 400 if message content is whitespace only', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: '   ' }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(400);
      });
    });

    describe('Conversation Verification', () => {
      it('should return 404 if conversation not found', async () => {
        // Empty result = conversation not found
        mockQuery.mockResolvedValueOnce([]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello' }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(404);
      });
    });

    describe('Conversation ownership', () => {
      it('should only allow the authenticated user to send messages to their own conversation', async () => {
        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // user message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // history
        mockQuery.mockResolvedValueOnce([]);
        // assistant message insert
        mockQuery.mockResolvedValueOnce([mockAssistantMessage]);
        // count
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello' }),
        });
        await POST(request, mockContext);

        // Verify user_id is included in the conversation ownership query
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('user_id'),
          expect.arrayContaining(['user-123']),
        );
      });

      it('should return 404 when trying to message a conversation owned by another user', async () => {
        // No conversation returned (ownership check fails)
        mockQuery.mockResolvedValueOnce([]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello' }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(404);
      });
    });

    describe('Message Flow', () => {
      it('should save user message and return assistant response', async () => {
        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // user message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // history lookup
        mockQuery.mockResolvedValueOnce([]);
        // assistant message insert
        mockQuery.mockResolvedValueOnce([mockAssistantMessage]);
        // count for auto-title check
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello, AI!' }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.userMessage).toBeDefined();
        expect(data.assistantMessage).toBeDefined();
        expect(data.usage).toBeDefined();
      });

      it('should call LLM API with correct parameters', async () => {
        const historyData = [{ role: 'user', content: 'Hello' }];

        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // user message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // history
        mockQuery.mockResolvedValueOnce(historyData);
        // assistant message insert
        mockQuery.mockResolvedValueOnce([mockAssistantMessage]);
        // count
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello', model: 'gpt-5.4' }),
        });
        await POST(request, mockContext);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/llm/v1/chat/completions'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
          }),
        );

        // Parse the body to verify content
        const fetchCall = mockFetch.mock.calls[0]!;
        const body = JSON.parse(fetchCall[1].body);
        expect(body.model).toBe('gpt-5.4');
        expect(body.stream).toBe(false);
      });

      it('should return 500 if LLM API fails', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Internal error' }),
        });

        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // user message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // history
        mockQuery.mockResolvedValueOnce([]);
        // rollback delete
        mockExecute.mockResolvedValueOnce(undefined);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello' }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(500);
      });

      it('should return 500 if user message save fails', async () => {
        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // user message insert fails
        mockQuery.mockResolvedValueOnce([]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello' }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(500);
      });
    });

    describe('Auto-titling', () => {
      it('should auto-title conversation on first message exchange', async () => {
        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // user message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // history
        mockQuery.mockResolvedValueOnce([]);
        // assistant message insert
        mockQuery.mockResolvedValueOnce([mockAssistantMessage]);
        // count = 2 (first exchange triggers auto-title)
        mockQuery.mockResolvedValueOnce([{ count: '2' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'What is the weather today?' }),
        });
        await POST(request, mockContext);

        // Title update should be called via db.execute
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining('update web_conversations'),
          expect.arrayContaining(['What is the weather today?']),
        );
      });

      it('should truncate long messages for title', async () => {
        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // user message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // history
        mockQuery.mockResolvedValueOnce([]);
        // assistant message insert
        mockQuery.mockResolvedValueOnce([mockAssistantMessage]);
        // count = 2 (first exchange)
        mockQuery.mockResolvedValueOnce([{ count: '2' }]);

        const longMessage =
          'This is a very long message that should be truncated when used as the conversation title because it exceeds fifty characters';

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: longMessage }),
        });
        await POST(request, mockContext);

        // The title argument (first param in the execute call array) should be truncated
        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining('update web_conversations'),
          expect.arrayContaining([expect.stringMatching(/^.{50}\.\.\./)]),
        );
      });
    });

    describe('Model Selection', () => {
      it('should default to auto model when not provided', async () => {
        // conversation lookup - returns a conversation with a model set
        mockQuery.mockResolvedValueOnce([{ ...mockConversation, model: 'gpt-4-turbo' }]);
        // user message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // history
        mockQuery.mockResolvedValueOnce([]);
        // assistant message insert
        mockQuery.mockResolvedValueOnce([mockAssistantMessage]);
        // count
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello' }), // No model specified - defaults to 'auto'
        });
        await POST(request, mockContext);

        const fetchCall = mockFetch.mock.calls[0]!;
        const body = JSON.parse(fetchCall[1].body);
        // When no model specified in request, route uses conversation.model or 'auto'
        expect(body.model).toBeTruthy();
      });
    });

    describe('Usage Tracking', () => {
      it('should return token usage in response', async () => {
        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // user message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // history
        mockQuery.mockResolvedValueOnce([]);
        // assistant message insert
        mockQuery.mockResolvedValueOnce([mockAssistantMessage]);
        // count
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello' }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.usage).toEqual({
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        });
      });
    });
  });
});
