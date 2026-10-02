import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireProviderDefaultModel } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/server/neon-chat');
type ScanModule1 = typeof import('@/lib/server/model-catalogue');
type ScanModule2 = typeof import('@/lib/services/tier-unit-quota-service');

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

vi.mock('server-only', () => ({}));

vi.mock('@/lib/server/neon-chat', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  normalizeMessageMetadata: (v: unknown) => v,
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));

vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
  resolveOrganizationMembershipId: vi.fn(async () => null),
}));

vi.mock('@/lib/server/model-catalogue', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  isConfiguredManagedModelRoute: vi.fn(() => true),
}));

const { mockAssertFreeDailyAllowance } = vi.hoisted(() => ({
  mockAssertFreeDailyAllowance: vi.fn(async (_input: unknown) => undefined),
}));
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  assertFreeDailyAllowance: mockAssertFreeDailyAllowance,
}));

import { GET, POST } from '@/app/api/chat/conversations/route';
import { freeDailyLimitError } from '@/lib/services/tier-unit-quota-service';
import { TEMPORARY_CHAT_PROJECT_REFUSAL } from '@/lib/temporary-chat-policy';

describe('Chat Conversations API', () => {
  const mockConversations = [
    {
      id: 'conv-1',
      title: 'Test Conversation 1',
      model: 'auto',
      project_id: null,
      created_at: '2026-01-25T00:00:00Z',
      updated_at: '2026-01-25T00:00:00Z',
    },
    {
      id: 'conv-2',
      title: 'Test Conversation 2',
      model: CHAT_MODEL,
      project_id: 'proj-1',
      created_at: '2026-01-24T00:00:00Z',
      updated_at: '2026-01-24T00:00:00Z',
    },
  ];

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

  describe('GET /api/chat/conversations', () => {
    describe('Authentication', () => {
      it('should return 401 if no authorization header and no session', async () => {
        const { createError } = await import('@/lib/errors');
        mockGetUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

        const request = new NextRequest('http://localhost/api/chat/conversations');
        const response = await GET(request);

        expect(response.status).toBe(401);
      });

      it('should authenticate with Bearer token', async () => {
        mockQuery.mockResolvedValueOnce(mockConversations);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.conversations).toHaveLength(2);
      });

      it('should reject invalid Bearer token', async () => {
        const { createError } = await import('@/lib/errors');
        mockGetUserScopedDb.mockRejectedValueOnce(createError.unauthorized('Invalid token'));

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer invalid-token' },
        });
        const response = await GET(request);

        expect(response.status).toBe(401);
      });
    });

    describe('Listing Conversations', () => {
      it('should return empty array when no conversations exist', async () => {
        mockQuery.mockResolvedValueOnce([]);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.conversations).toEqual([]);
      });

      it('should return conversations ordered by updated_at desc', async () => {
        mockQuery.mockResolvedValueOnce(mockConversations);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.conversations[0].id).toBe('conv-1');
        expect(data.conversations[1].project_id).toBe('proj-1');
      });

      it('returns owner-scoped non-temporary history totals when requested', async () => {
        mockQuery
          .mockResolvedValueOnce(mockConversations)
          .mockResolvedValueOnce([{ conversation_count: '195', message_count: '842' }]);

        const request = new NextRequest(
          'http://localhost/api/chat/conversations?includeHistoryStats=1',
          { headers: { Authorization: 'Bearer valid-token' } },
        );
        const response = await GET(request);

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
          historyStats: { conversationCount: 195, messageCount: 842 },
        });
        expect(mockQuery).toHaveBeenNthCalledWith(
          2,
          expect.stringMatching(
            /where user_id = \$1[\s\S]*organization_id is not distinct from \$2[\s\S]*deleted_at is null[\s\S]*is_temporary = false/,
          ),
          ['user-123', null],
        );
      });

      it('should select project_id for project-aware sidebar actions', async () => {
        mockQuery.mockResolvedValueOnce(mockConversations);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        await GET(request);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('project_id'),
          expect.any(Array),
        );
      });

      it('should filter conversations by the authenticated user and selected project', async () => {
        mockQuery.mockResolvedValueOnce([mockConversations[1]]);

        const request = new NextRequest(
          'http://localhost/api/chat/conversations?projectId=proj-1&limit=25&offset=0',
          { headers: { Authorization: 'Bearer valid-token' } },
        );
        const response = await GET(request);

        expect(response.status).toBe(200);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringMatching(
            /user_id = \$1[\s\S]*organization_id is not distinct from \$2[\s\S]*project_id = \$3/,
          ),
          ['user-123', null, 'proj-1', 26, 0],
        );
      });

      it('should filter out deleted conversations', async () => {
        mockQuery.mockResolvedValueOnce(mockConversations);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await GET(request);

        expect(response.status).toBe(200);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('deleted_at is null'),
          expect.any(Array),
        );
      });

      it('should default-limit results to 50 conversations', async () => {
        mockQuery.mockResolvedValueOnce(mockConversations);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          headers: { Authorization: 'Bearer valid-token' },
        });
        await GET(request);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('limit $3'),
          expect.arrayContaining([expect.any(String), 51]),
        );
      });

      it('should return 500 on database error', async () => {
        mockQuery.mockRejectedValueOnce(new Error('Database error'));

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
        const newConv = { id: 'new-conv', title: 'New conversation', model: 'auto' };
        mockQuery.mockResolvedValueOnce([newConv]);

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
        const newConv = { id: 'new-conv', title: 'My Custom Title', model: 'auto' };
        mockQuery.mockResolvedValueOnce([newConv]);

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
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('insert into web_conversations'),
          expect.arrayContaining(['My Custom Title']),
        );
      });

      it('should create conversation with specific model', async () => {
        const newConv = { id: 'new-conv', title: 'New conversation', model: CHAT_MODEL };
        mockQuery.mockResolvedValueOnce([newConv]);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: CHAT_MODEL }),
        });
        const response = await POST(request);

        expect(response.status).toBe(201);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('insert into web_conversations'),
          expect.arrayContaining([CHAT_MODEL]),
        );
      });

      it('counts one new conversation against the Free daily cap before writing it', async () => {
        const newConv = { id: 'new-conv', title: 'New conversation', model: 'auto' };
        mockQuery.mockResolvedValueOnce([newConv]);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await POST(request);

        expect(response.status).toBe(201);
        expect(mockAssertFreeDailyAllowance).toHaveBeenCalledWith(
          expect.objectContaining({ userId: 'user-123', requested: { conversation_creates: 1 } }),
        );
      });

      it('answers 429 and writes nothing once the Free daily conversation cap is used up', async () => {
        mockAssertFreeDailyAllowance.mockRejectedValueOnce(
          freeDailyLimitError('conversation_creates'),
        );

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await POST(request);

        expect(response.status).toBe(429);
        await expect(response.json()).resolves.toMatchObject({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: freeDailyLimitError('conversation_creates').message,
          },
        });
        expect(mockQuery).not.toHaveBeenCalledWith(
          expect.stringContaining('insert into web_conversations'),
          expect.anything(),
        );
      });

      it('refuses a provider pin until its additive migration is present', async () => {
        mockQuery.mockResolvedValueOnce([{ supported: false }]);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: CHAT_MODEL, selectedRouteId: 'provider/route' }),
        });
        const response = await POST(request);

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({
          error: { code: 'route_pin_not_ready' },
        });
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('information_schema.columns'),
        );
      });

      it('persists a provider pin after its additive migration is present', async () => {
        const newConv = {
          id: 'new-conv',
          title: 'New conversation',
          model: CHAT_MODEL,
          selected_route_id: 'provider/route',
        };
        mockQuery.mockResolvedValueOnce([{ supported: true }]).mockResolvedValueOnce([newConv]);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: CHAT_MODEL, selectedRouteId: 'provider/route' }),
        });
        const response = await POST(request);

        expect(response.status).toBe(201);
        expect(mockQuery).toHaveBeenNthCalledWith(
          2,
          expect.stringContaining('selected_route_id'),
          expect.arrayContaining(['provider/route']),
        );
      });

      it('should create conversation with a project association', async () => {
        const newConv = {
          id: 'new-conv',
          title: 'New conversation',
          model: 'auto',
          project_id: 'proj-1',
        };
        mockQuery.mockResolvedValueOnce([{ id: 'proj-1' }]).mockResolvedValueOnce([newConv]);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ projectId: 'proj-1' }),
        });
        const response = await POST(request);

        expect(response.status).toBe(201);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('project_id'),
          expect.arrayContaining(['proj-1']),
        );
      });

      it('should reject a project association that is not owned by the authenticated user', async () => {
        mockQuery.mockResolvedValueOnce([]);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ projectId: 'proj-foreign' }),
        });
        const response = await POST(request);

        expect(response.status).toBe(404);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringMatching(/user_projects[\s\S]*id = \$1[\s\S]*user_id = \$2/),
          ['proj-foreign', 'user-123'],
        );
      });

      it('refuses a temporary chat that names a project, and writes nothing', async () => {
        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ projectId: 'proj-1', isTemporary: true }),
        });
        const response = await POST(request);

        expect(response.status).toBe(400);
        expect((await response.json()).error.message).toBe(TEMPORARY_CHAT_PROJECT_REFUSAL);
        expect(mockQuery).not.toHaveBeenCalled();
      });

      it('refuses to file an existing temporary chat under a project', async () => {
        const clientId = '0190a000-0000-7000-8000-0000000000bb';
        mockQuery
          .mockResolvedValueOnce([{ id: 'proj-1' }])
          .mockResolvedValueOnce([{ is_temporary: true }]);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: clientId, projectId: 'proj-1' }),
        });
        const response = await POST(request);

        expect(response.status).toBe(400);
        expect((await response.json()).error.message).toBe(TEMPORARY_CHAT_PROJECT_REFUSAL);
        expect(mockQuery).not.toHaveBeenCalledWith(
          expect.stringContaining('insert into web_conversations'),
          expect.anything(),
        );
      });

      it('keeps the upsert from filing a temporary row under a project', async () => {
        const clientId = '0190a000-0000-7000-8000-0000000000cc';
        mockQuery.mockResolvedValueOnce([{ id: clientId }]);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: clientId }),
        });
        await POST(request);

        const upsert = String(mockQuery.mock.calls[0]?.[0]).replace(/\s+/g, ' ');
        expect(upsert).toContain(
          "not ( coalesce(web_conversations.is_temporary, false) and nullif(excluded.project_id, '') is not null )",
        );
      });

      it('should accept a client-supplied UUID id (offline-first sync)', async () => {
        const clientId = '0190a000-0000-7000-8000-0000000000aa';
        const newConv = { id: clientId, title: 'New conversation', model: 'auto' };
        mockQuery.mockResolvedValueOnce([newConv]);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: clientId, title: 'New conversation' }),
        });
        const response = await POST(request);

        expect(response.status).toBe(201);
        const data = await response.json();
        expect(data.conversation.id).toBe(clientId);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('on conflict (id)'),
          expect.arrayContaining([clientId]),
        );
      });

      it('should reject a non-UUID client id', async () => {
        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: 'not-a-uuid' }),
        });
        const response = await POST(request);

        expect(response.status).toBe(400);
      });

      it('should associate conversation with authenticated user', async () => {
        const newConv = { id: 'new-conv' };
        mockQuery.mockResolvedValueOnce([newConv]);

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token' },
        });
        await POST(request);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('insert into web_conversations'),
          expect.arrayContaining(['user-123']),
        );
      });

      it('should return 500 on database insert error', async () => {
        mockQuery.mockRejectedValueOnce(new Error('Insert failed'));

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-token' },
        });
        const response = await POST(request);

        expect(response.status).toBe(500);
      });

      it('should return 401 if not authenticated', async () => {
        const { createError } = await import('@/lib/errors');
        mockGetUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

        const request = new NextRequest('http://localhost/api/chat/conversations', {
          method: 'POST',
        });
        const response = await POST(request);

        expect(response.status).toBe(401);
      });
    });
  });
});
