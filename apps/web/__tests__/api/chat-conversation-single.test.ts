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
const mockKillE2BSession = vi.fn();

vi.mock('@/lib/e2b/runtime', () => ({
  killE2BSession: (...args: unknown[]) => mockKillE2BSession(...args),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/server/neon-chat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-chat')>()),
  normalizeMessageMetadata: (v: unknown) => v,
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));

vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
  resolveOrganizationMembershipId: vi.fn(async () => null),
}));

import { GET, PUT, DELETE } from '@/app/api/chat/conversations/[id]/route';

describe('Single Conversation API', () => {
  const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
  const mockConversation = {
    id: CONVERSATION_ID,
    title: 'Test Conversation',
    model: 'auto',
    project_id: null,
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
      metadata: null,
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'Hi there!',
      model: CHAT_MODEL,
      provider: 'openai',
      input_tokens: 10,
      output_tokens: 5,
      cost_cents: 0.001,
      created_at: '2026-01-25T00:01:00Z',
      metadata: null,
    },
  ];

  const mockContext = { params: Promise.resolve({ id: CONVERSATION_ID }) };

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUserScopedDb.mockResolvedValue({
      db: { query: mockQuery, execute: mockExecute },
      userId: 'user-123',
      organizationId: null,
    });

    mockQuery.mockResolvedValue([]);
    mockExecute.mockResolvedValue(undefined);
  });

  describe('GET /api/chat/conversations/[id]', () => {
    describe('Authentication', () => {
      it('should return 401 if not authenticated', async () => {
        const { createError } = await import('@/lib/errors');
        mockGetUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
        );
        const response = await GET(request, mockContext);

        expect(response.status).toBe(401);
      });
    });

    describe('Fetching Conversation with Messages', () => {
      it('should return conversation with messages', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce(mockMessages);

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            headers: { Authorization: 'Bearer valid-token' },
          },
        );
        const response = await GET(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.conversation).toEqual(mockConversation);
        expect(data.messages).toHaveLength(2);
        expect(data.messages[1]).not.toHaveProperty('cost_cents');
      });

      it('should return 404 if conversation not found', async () => {
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

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            headers: { Authorization: 'Bearer valid-token' },
          },
        );
        await GET(request, mockContext);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('user_id'),
          expect.arrayContaining(['user-123']),
        );
      });

      it('should return empty messages array when conversation has no messages', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockResolvedValueOnce([]);

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            headers: { Authorization: 'Bearer valid-token' },
          },
        );
        const response = await GET(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.messages).toEqual([]);
      });

      it('should return 500 on messages fetch error', async () => {
        mockQuery.mockResolvedValueOnce([mockConversation]);
        mockQuery.mockRejectedValueOnce(new Error('DB error'));

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            headers: { Authorization: 'Bearer valid-token' },
          },
        );
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

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            method: 'PUT',
            headers: {
              Authorization: 'Bearer valid-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title: 'Updated Title' }),
          },
        );
        const response = await PUT(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.conversation.title).toBe('Updated Title');
      });

      it('should update conversation model', async () => {
        const updated = { ...mockConversation, model: CHAT_MODEL };
        mockQuery.mockResolvedValueOnce([updated]);

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            method: 'PUT',
            headers: {
              Authorization: 'Bearer valid-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model: CHAT_MODEL }),
          },
        );
        const response = await PUT(request, mockContext);

        expect(response.status).toBe(200);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('update web_conversations'),
          expect.arrayContaining([CHAT_MODEL]),
        );
      });

      it('should update conversation project association after verifying project ownership', async () => {
        const updated = { ...mockConversation, project_id: 'proj-1' };
        mockQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
        mockQuery.mockResolvedValueOnce([updated]);

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            method: 'PUT',
            headers: {
              Authorization: 'Bearer valid-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ projectId: 'proj-1' }),
          },
        );
        const response = await PUT(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.conversation.project_id).toBe('proj-1');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('from user_projects'),
          expect.arrayContaining(['proj-1', 'user-123']),
        );
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('project_id'),
          expect.arrayContaining([true, 'proj-1']),
        );
      });

      it('rejects moving a conversation into a project the user does not own', async () => {
        mockQuery.mockResolvedValueOnce([]);

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            method: 'PUT',
            headers: {
              Authorization: 'Bearer valid-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ projectId: 'someone-elses-project' }),
          },
        );
        const response = await PUT(request, mockContext);

        expect(response.status).toBe(404);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery).not.toHaveBeenCalledWith(
          expect.stringContaining('update web_conversations'),
          expect.anything(),
        );
      });

      it('allows clearing the project association (projectId null) without an ownership check', async () => {
        const updated = { ...mockConversation, project_id: null };
        mockQuery.mockResolvedValueOnce([updated]);

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            method: 'PUT',
            headers: {
              Authorization: 'Bearer valid-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ projectId: null }),
          },
        );
        const response = await PUT(request, mockContext);

        expect(response.status).toBe(200);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('update web_conversations'),
          expect.anything(),
        );
      });

      it('should return 404 if conversation not found', async () => {
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
        mockGetUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Updated Title' }),
          },
        );
        const response = await PUT(request, mockContext);

        expect(response.status).toBe(401);
      });
    });
  });

  describe('DELETE /api/chat/conversations/[id]', () => {
    describe('Soft Deleting Conversation', () => {
      const deleteSql = /update web_conversations/i;

      it('should soft delete conversation by setting deleted_at', async () => {
        mockQuery.mockImplementation(async (sql: string) =>
          deleteSql.test(sql) ? [{ id: CONVERSATION_ID }] : [],
        );

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            method: 'DELETE',
            headers: { Authorization: 'Bearer valid-token' },
          },
        );
        const response = await DELETE(request, mockContext);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('deleted_at'),
          expect.any(Array),
        );
      });

      it('should return 404 when no row matches, rather than reporting success', async () => {
        mockQuery.mockImplementation(async () => []);

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            method: 'DELETE',
            headers: { Authorization: 'Bearer valid-token' },
          },
        );
        const response = await DELETE(request, mockContext);

        expect(response.status).toBe(404);
      });

      it('should return 500 on database error', async () => {
        mockQuery.mockImplementation(async (sql: string) => {
          if (deleteSql.test(sql)) throw new Error('DB error');
          return [];
        });

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            method: 'DELETE',
            headers: { Authorization: 'Bearer valid-token' },
          },
        );
        const response = await DELETE(request, mockContext);

        expect(response.status).toBe(500);
      });

      it('should return 401 if not authenticated', async () => {
        const { createError } = await import('@/lib/errors');
        mockGetUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            method: 'DELETE',
          },
        );
        const response = await DELETE(request, mockContext);

        expect(response.status).toBe(401);
      });

      it('should only delete conversations owned by authenticated user', async () => {
        mockQuery.mockImplementation(async (sql: string) =>
          /update web_conversations/i.test(sql) ? [{ id: CONVERSATION_ID }] : [],
        );

        const request = new NextRequest(
          `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
          {
            method: 'DELETE',
            headers: { Authorization: 'Bearer valid-token' },
          },
        );
        await DELETE(request, mockContext);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringMatching(/user_id = \$2[\s\S]*organization_id is not distinct from \$3/),
          [CONVERSATION_ID, 'user-123', null],
        );
        expect(mockKillE2BSession).toHaveBeenCalledWith({
          tenantId: 'managed-cloud',
          userId: 'user-123',
          conversationId: CONVERSATION_ID,
        });
      });
    });
  });
});
