import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireProviderDefaultModel } from '@agiworkforce/types';

const CHAT_MODEL = requireProviderDefaultModel('openai');

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

const mockQuery = vi.fn();
const mockExecute = vi.fn();
const mockGetUserScopedDb = vi.fn();

vi.mock('@/lib/server/neon-chat', () => ({
  normalizeMessageMetadata: (v: unknown) => v,
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));

vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
  resolveOrganizationMembershipId: vi.fn(async () => null),
}));

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    checkAvailable: vi.fn().mockResolvedValue(true),
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

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
    model: CHAT_MODEL,
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

    process.env['NEXT_PUBLIC_SITE_URL'] = 'http://localhost:3001';

    mockGetUserScopedDb.mockResolvedValue({
      db: { query: mockQuery, execute: mockExecute },
      userId: 'user-123',
      organizationId: null,
    });

    mockQuery.mockResolvedValue([]);
    mockExecute.mockResolvedValue(undefined);

    vi.mocked(CreditService.checkAvailable).mockResolvedValue(true);

    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'Hello! How can I help you?' } }],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
          model: CHAT_MODEL,
          provider: 'openai',
          cost_cents: 0.001,
        }),
    });
  });

  describe('POST /api/chat/conversations/[id]/messages', () => {
    describe('Authentication', () => {
      it('should return 401 if not authenticated', async () => {
        const { createError } = await import('@/lib/errors');
        mockGetUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

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
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
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

        expect(mockQuery).toHaveBeenNthCalledWith(
          1,
          expect.stringMatching(/user_id = \$2[\s\S]*organization_id is not distinct from \$3/),
          ['conv-1', 'user-123', null],
        );
      });

      it('should return 404 when trying to message a conversation owned by another user', async () => {
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
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
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
        expect(data.message).not.toHaveProperty('cost_cents');
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should not call LLM API (streaming is handled externally via useChatStream)', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Hello', model: CHAT_MODEL, skipLlm: true }),
        });
        await POST(request, mockContext);

        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should return 500 if message save fails', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
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
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
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

        expect(response.status).toBe(200);
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });

    describe('Auto-titling', () => {
      it('should auto-title conversation on first user message', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
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

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining('update web_conversations'),
          expect.arrayContaining(['What is the weather today?']),
        );
      });

      it('should truncate long messages for title', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
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

        expect(mockExecute).toHaveBeenCalledWith(
          expect.stringContaining('update web_conversations'),
          expect.arrayContaining([expect.stringMatching(/^.{50}\.\.\./)]),
        );
      });
    });

    describe('Model Selection', () => {
      it('should store the model on assistant messages when provided', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce([mockAssistantMessage]);
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
            model: CHAT_MODEL,
            skipLlm: true,
          }),
        });
        const response = await POST(request, mockContext);

        expect(response.status).toBe(200);
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('insert into web_messages'),
          expect.arrayContaining([CHAT_MODEL]),
        );
      });
    });

    describe('Idempotency / retry-safety (P1 silent-data-loss fix)', () => {
      function getInsertSql(): string {
        const insertCall = mockQuery.mock.calls.find(
          (call) => typeof call[0] === 'string' && call[0].includes('insert into web_messages'),
        );
        expect(insertCall, 'expected an insert into web_messages').toBeDefined();
        return insertCall![0] as string;
      }

      it('upserts the message id (ON CONFLICT) so retries cannot duplicate or throw', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '11111111-1111-4111-8111-111111111111',
            content: 'Hello',
            skipLlm: true,
          }),
        });
        await POST(request, mockContext);

        const sql = getInsertSql().toLowerCase();
        expect(sql).toContain('on conflict (id) do update');
      });

      it('scopes the ON CONFLICT update to the same conversation (IDOR-safe)', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
        mockQuery.mockResolvedValueOnce([{ count: '5' }]);

        const request = new NextRequest('http://localhost/api/chat/conversations/conv-1/messages', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '11111111-1111-4111-8111-111111111111',
            content: 'Hello',
            skipLlm: true,
          }),
        });
        await POST(request, mockContext);

        const sql = getInsertSql().toLowerCase().replace(/\s+/g, ' ');
        expect(sql).toContain('where web_messages.conversation_id = excluded.conversation_id');
      });
    });

    describe('Response shape', () => {
      it('should return { message } (not usage or assistantMessage) in response', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce([mockUserMessage]);
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
        expect(data.assistantMessage).toBeUndefined();
        expect(data.usage).toBeUndefined();
      });
    });
  });
});
