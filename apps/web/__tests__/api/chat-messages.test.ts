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

// Mock Neon DB and Clerk auth — routes use these instead of Neon after Wave 3.
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
    model: 'gpt-5.5',
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
          model: 'gpt-5.5',
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
        // message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // count
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello', skipLlm: true }),
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
      it('should save message and return it in the response', async () => {
        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // count for auto-title check
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello, AI!', skipLlm: true }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBeDefined();
        // LLM is NOT called inline; streaming is handled by /api/llm/v1/chat/completions
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should not call LLM API (streaming is handled externally via useChatStream)', async () => {
        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // count
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello', model: 'gpt-5.5', skipLlm: true }),
        });
        await POST(request, mockContext);

        // The route never calls the LLM directly; streaming is the caller's responsibility
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should return 500 if message save fails', async () => {
        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // message insert throws
        mockQuery.mockRejectedValueOnce(new Error('DB error'));

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello', skipLlm: true }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(500);
      });

      it('should warn but still save when skipLlm is omitted (legacy callers)', async () => {
        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // count
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello' }), // skipLlm omitted (defaults to false)
        });
        const response = await POST(request, mockContext);

        // Still saves message and returns 200; no LLM call
        expect(response.status).toBe(200);
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });

    describe('Auto-titling', () => {
      it('should auto-title conversation on first user message', async () => {
        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // count = 1 (first message triggers auto-title)
        mockQuery.mockResolvedValueOnce([{ count: '1' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'What is the weather today?', skipLlm: true }),
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
        // message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // count = 1 (first message)
        mockQuery.mockResolvedValueOnce([{ count: '1' }]);

        const longMessage =
          'This is a very long message that should be truncated when used as the conversation title because it exceeds fifty characters';

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: longMessage, skipLlm: true }),
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
      it('should store the model on assistant messages when provided', async () => {
        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // message insert (assistant role, model provided)
        mockQuery.mockResolvedValueOnce([mockAssistantMessage]);
        // count
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: 'I can help!',
            role: 'assistant',
            model: 'gpt-5.5',
            skipLlm: true,
          }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(200);
        // LLM is never called inline; model is passed through to DB insert
        expect(mockFetch).not.toHaveBeenCalled();
        // Verify the insert includes the model parameter
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('insert into web_messages'),
          expect.arrayContaining(['gpt-5.5']),
        );
      });
    });

    describe('Response shape', () => {
      it('should return { message } (not usage or assistantMessage) in response', async () => {
        // conversation lookup
        mockQuery.mockResolvedValueOnce([mockConversation]);
        // message insert
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        // count
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello', skipLlm: true }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBeDefined();
        // Route no longer returns assistantMessage or usage (streaming is external)
        expect(data.assistantMessage).toBeUndefined();
        expect(data.usage).toBeUndefined();
      });
    });
  });
});
