import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockRlsQuery, mockResolveActiveOrganizationId, mockResolveProjectWriteAccess } = vi.hoisted(
  () => ({
    mockRlsQuery: vi.fn(),
    mockResolveActiveOrganizationId: vi.fn(),
    mockResolveProjectWriteAccess: vi.fn(),
  }),
);

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mockRlsQuery(...args),
      transaction: vi.fn((run: (tx: unknown) => unknown) =>
        run({
          query: (...args: unknown[]) => mockRlsQuery(...args),
          execute: vi.fn(async () => 1),
        }),
      ),
    },
    userId: 'member-1',
    organizationId: await mockResolveActiveOrganizationId(),
  })),
}));
vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/org-sharing-service')>()),
  resolveSharedProjectScope: vi.fn(async () => null),
  resolveProjectWriteAccess: mockResolveProjectWriteAccess,
}));

import { PUT } from '../[id]/route';

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';

function projectRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PROJECT,
    user_id: 'owner-1',
    organization_id: ORG,
    name: 'Roadmap',
    description: '',
    instructions: '',
    color: '#3b82f6',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    conversation_count: 0,
    ...overrides,
  };
}

function putRequest(body: unknown): never {
  return new Request(`http://localhost:3000/api/projects/${PROJECT}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

const context = { params: Promise.resolve({ id: PROJECT }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveActiveOrganizationId.mockResolvedValue(ORG);
});

describe('PUT /api/projects/[id] · editor on a shared project', () => {
  it('saves instructions for a member holding the write grant', async () => {
    mockResolveProjectWriteAccess.mockResolvedValue('editor');
    mockRlsQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([projectRow({ instructions: 'Rewritten' })])
      .mockResolvedValueOnce([
        projectRow({ instructions: 'Rewritten', is_org_shared: true, shared_access: 'write' }),
      ]);

    const response = await PUT(putRequest({ instructions: 'Rewritten' }), context);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      project: { instructions: string | null; sharedAccess: string | null };
    };
    expect(body.project.instructions).toBe('Rewritten');
    expect(body.project.sharedAccess).toBe('write');

    const [ownerAttempt] = mockRlsQuery.mock.calls[0] as [string];
    expect(ownerAttempt).toMatch(/user_id = \$\d+/);
    const [editorAttempt] = mockRlsQuery.mock.calls[1] as [string];
    expect(editorAttempt).toMatch(/user_id <> \$\d+/);
  });

  it('404s a member with no write grant rather than writing anything', async () => {
    mockResolveProjectWriteAccess.mockResolvedValue(null);
    mockRlsQuery.mockResolvedValue([]);

    const response = await PUT(putRequest({ instructions: 'Rewritten' }), context);

    expect(response.status).toBe(404);
    expect(mockRlsQuery).toHaveBeenCalledTimes(1);
  });

  it('refuses to let an editor archive someone else’s project', async () => {
    mockResolveProjectWriteAccess.mockResolvedValue('editor');
    mockRlsQuery.mockResolvedValue([]);

    const response = await PUT(putRequest({ isArchived: true }), context);

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message ?? '').toMatch(/isArchived/);
  });

  it('never asks about editor access when the owner’s own update lands', async () => {
    mockRlsQuery
      .mockResolvedValueOnce([projectRow({ user_id: 'member-1', name: 'Renamed' })])
      .mockResolvedValueOnce([projectRow({ user_id: 'member-1', name: 'Renamed' })]);

    const response = await PUT(putRequest({ name: 'Renamed' }), context);

    expect(response.status).toBe(200);
    expect(mockResolveProjectWriteAccess).not.toHaveBeenCalled();
  });
});
