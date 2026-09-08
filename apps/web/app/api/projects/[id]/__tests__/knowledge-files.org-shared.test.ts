import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockRlsQuery, mockResolveSharedProjectScope, mockActiveOrganizationId } = vi.hoisted(
  () => ({
    mockRlsQuery: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
    mockResolveSharedProjectScope: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    mockActiveOrganizationId: { current: null as string | null },
  }),
);

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  withCorsRoute: <T>(handler: T) => handler,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockRlsQuery(...args) },
    userId: 'member-1',
    organizationId: mockActiveOrganizationId.current,
  })),
}));
vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/org-sharing-service')>()),
  resolveSharedProjectScope: (...args: unknown[]) => mockResolveSharedProjectScope(...args),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => null) },
}));

import { GET, POST } from '../knowledge-files/route';

const ORG = '11111111-1111-4111-8111-111111111111';
const SHARED_PROJECT = '33333333-3333-4333-8333-333333333333';

function listRequest(): never {
  return new Request(
    `http://localhost:3000/api/projects/${SHARED_PROJECT}/knowledge-files`,
  ) as never;
}

function registerRequest(): never {
  return new Request(`http://localhost:3000/api/projects/${SHARED_PROJECT}/knowledge-files`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      byteCount: 12,
      storageUri: 's3://bucket/notes.txt',
      checksumSha256: 'a'.repeat(64),
    }),
  }) as never;
}

const params = Promise.resolve({ id: SHARED_PROJECT });

beforeEach(() => {
  vi.clearAllMocks();
  mockActiveOrganizationId.current = ORG;
  mockResolveSharedProjectScope.mockResolvedValue({
    organizationId: ORG,
    projectIds: [SHARED_PROJECT],
  });
});

describe('project knowledge files on an org-shared project', () => {
  it('lets a shared member read the sources the database already grants them', async () => {
    mockRlsQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: SHARED_PROJECT }])
      .mockResolvedValueOnce([
        {
          id: 'file-1',
          project_id: SHARED_PROJECT,
          file_name: 'brief.pdf',
          mime_type: 'application/pdf',
          byte_count: 10,
          checksum_sha256: 'b'.repeat(64),
          added_at: '2026-01-01T00:00:00.000Z',
          storage_uri: 's3://bucket/brief.pdf',
        },
      ])
      .mockResolvedValue([]);

    const response = await GET(listRequest(), { params });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.files).toHaveLength(1);
    expect(body.files[0].fileName).toBe('brief.pdf');
  });

  it('scopes the shared lookup to the ids the sharing service returned', async () => {
    mockRlsQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const response = await GET(listRequest(), { params });
    expect(response.status).toBe(404);

    const sharedLookup = mockRlsQuery.mock.calls[1] as [string, unknown[]];
    expect(sharedLookup[0]).toMatch(/= any\(\$\d::uuid\[\]\)/i);
    expect(sharedLookup[1]).toContain(SHARED_PROJECT);
  });

  it('never widens the read to a project outside the caller organization', async () => {
    mockActiveOrganizationId.current = null;
    mockRlsQuery.mockResolvedValue([]);

    const response = await GET(listRequest(), { params });

    expect(response.status).toBe(404);
    expect(mockResolveSharedProjectScope).not.toHaveBeenCalled();
  });

  it('still refuses a shared member trying to add a source', async () => {
    mockRlsQuery.mockResolvedValue([]);

    const response = await POST(registerRequest(), { params });

    expect(response.ok).toBe(false);
    expect(
      mockRlsQuery.mock.calls.some(([sql]) => String(sql).includes('any(')),
      'the write path must not consult the shared id set',
    ).toBe(false);
  });
});
