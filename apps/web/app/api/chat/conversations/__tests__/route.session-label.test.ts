import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockNeonQuery } = vi.hoisted(() => ({
  mockNeonQuery: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
  resolveOrganizationMembershipId: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockNeonQuery(...args) },
    userId: 'user_label_1',
    organizationId: null,
  })),
}));

import { POST } from '../route';

function makePostRequest(body: unknown) {
  return new Request('http://localhost:3000/api/chat/conversations', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/chat/conversations, cloud_chat session labeling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('still returns 201 with the unchanged conversation response shape (additive)', async () => {
    mockNeonQuery
      // the insert...returning
      .mockResolvedValueOnce([
        {
          id: 'conv_label_1',
          title: 'New conversation',
          model: 'auto',
          project_id: null,
          pinned: false,
          starred: false,
          archived: false,
          is_temporary: false,
          created_at: '2026-07-15T00:00:00.000Z',
          updated_at: '2026-07-15T00:00:00.000Z',
        },
      ]);

    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(Object.keys(body)).toEqual(['conversation']);
    expect(body.conversation.id).toBe('conv_label_1');
  });

  it('does not throw the assertion for a project-scoped conversation either', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj_9' }]).mockResolvedValueOnce([
      {
        id: 'conv_label_2',
        title: 'Project chat',
        model: 'auto',
        project_id: 'proj_9',
        pinned: false,
        starred: false,
        archived: false,
        is_temporary: false,
        created_at: '2026-07-15T00:00:00.000Z',
        updated_at: '2026-07-15T00:00:00.000Z',
      },
    ]);

    const res = await POST(makePostRequest({ title: 'Project chat', projectId: 'proj_9' }));
    expect(res.status).toBe(201);
  });
});
