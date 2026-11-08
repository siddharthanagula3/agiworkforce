import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/services/org-sharing-service');

vi.mock('server-only', () => ({}));

const { mockRlsQuery, mockResolveSharedProjectScope, mockActiveOrganizationId } = vi.hoisted(
  () => ({
    mockRlsQuery: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
    mockResolveSharedProjectScope: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    mockActiveOrganizationId: { current: null as string | null },
  }),
);

const { mockSavedWorkspace, mockPermissions, mockStorageAllowance, mockStorageAvailable } =
  vi.hoisted(() => ({
    mockSavedWorkspace: vi.fn(),
    mockPermissions: vi.fn(),
    mockStorageAllowance: vi.fn(),
    mockStorageAvailable: vi.fn(),
  }));

vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  resolveActiveOrganizationId: mockSavedWorkspace,
}));
vi.mock('@/lib/services/organization-permission-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  resolveOrganizationPermissions: mockPermissions,
}));
vi.mock('@/lib/server/file-storage', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  resolveFileStorageAllowance: mockStorageAllowance,
  assertFileStorageAvailable: mockStorageAvailable,
}));

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
  ...(await importOriginal<ScanModule0>()),
  resolveSharedProjectScope: (...args: unknown[]) => mockResolveSharedProjectScope(...args),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => null) },
}));

import { GET, POST } from '../knowledge-files/route';
import { READABLE_PROJECT_SCOPE_SQL } from '@/lib/server/project-read-access';
import {
  checkProjectKnowledgeCapacity,
  type ProjectKnowledgeScope,
} from '@/lib/server/project-knowledge-files';
import { MAX_PROJECT_KNOWLEDGE_FILES } from '@agiworkforce/types';
import { createError } from '@/lib/errors';

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
  mockSavedWorkspace.mockReset().mockResolvedValue(ORG);
  mockPermissions.mockReset().mockResolvedValue(new Set(['content.read', 'content.share']));
  mockStorageAllowance.mockReset().mockResolvedValue({ planTier: 'free', limitBytes: null });
  mockStorageAvailable.mockReset().mockResolvedValue(undefined);
  mockActiveOrganizationId.current = ORG;
  mockResolveSharedProjectScope.mockResolvedValue({
    organizationId: ORG,
    projectIds: [SHARED_PROJECT],
  });
});

describe('shared knowledge capacity keeps the admitted workspace', () => {
  const SAVED_ORG = '22222222-2222-4222-8222-222222222222';
  const metadata = {
    fileName: 'notes.txt',
    mimeType: 'text/plain',
    byteCount: 12,
    checksumSha256: 'a'.repeat(64),
  };

  function capacityFixture(
    options: {
      organizationId?: string | null;
      role?: 'member' | 'viewer';
      membership?: boolean;
      write?: boolean;
      archived?: boolean;
      count?: number;
      duplicate?: boolean;
    } = {},
  ) {
    const organizationId = options.organizationId === undefined ? ORG : options.organizationId;
    const query = vi.fn(async (sql: string, parameters: unknown[]) => {
      if (sql.includes('from user_projects') && sql.includes('user_id = $2')) {
        expect(parameters).toEqual([SHARED_PROJECT, 'member-1', organizationId]);
        expect(sql).toContain('organization_id is not distinct from $3::uuid');
        expect(sql).toContain('deleted_at is null');
        return [];
      }
      if (sql.includes('from public.organization_members')) {
        expect(parameters).toEqual([ORG, 'member-1']);
        expect(sql).toContain("status = 'active'");
        return options.membership === false
          ? []
          : [{ organization_id: ORG, role: options.role ?? 'member' }];
      }
      if (sql.includes('from public.organization_shared_projects')) {
        expect(parameters).toEqual([ORG, 'member-1']);
        if (sql.includes('join public.organization_project_access')) {
          expect(sql).toContain("a.access = 'write'");
          return options.write === false ? [] : [{ project_id: SHARED_PROJECT }];
        }
        return [{ project_id: SHARED_PROJECT }];
      }
      if (sql.includes('from user_projects')) {
        expect(parameters).toEqual([SHARED_PROJECT, ORG]);
        expect(sql).toContain('organization_id is not distinct from $2::uuid');
        expect(sql).toContain('deleted_at is null');
        return [{ id: SHARED_PROJECT, is_archived: options.archived ?? false }];
      }
      if (sql.includes('from project_knowledge_files')) {
        expect(sql).toContain('deleted_at is null');
        expect(sql).toContain('superseded_at is null');
        if (sql.includes('count(*)')) {
          expect(parameters).toEqual([SHARED_PROJECT]);
          return [{ count: options.count ?? 0 }];
        }
        expect(sql).toContain('checksum_sha256 = $2');
        expect(parameters).toEqual([SHARED_PROJECT, metadata.checksumSha256]);
        return options.duplicate ? [{ id: 'existing-file', file_name: 'existing.txt' }] : [];
      }
      throw new Error(`Unexpected capacity SQL: ${sql}`);
    });
    const scope: ProjectKnowledgeScope = {
      db: { query } as unknown as ProjectKnowledgeScope['db'],
      userId: 'member-1',
      organizationId,
      projectId: SHARED_PROJECT,
    };
    return { query, scope };
  }

  beforeEach(() => {
    mockSavedWorkspace.mockResolvedValue(SAVED_ORG);
  });

  it('admits an explicit editor in captured B even when the saved workspace is A', async () => {
    const { query, scope } = capacityFixture();

    await expect(checkProjectKnowledgeCapacity(scope, metadata)).resolves.toEqual({
      status: 'ready',
      planTier: 'free',
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('from public.organization_members'),
      [ORG, 'member-1'],
    );
    expect(mockPermissions).toHaveBeenCalledWith(ORG, 'member-1');
    expect(mockSavedWorkspace).not.toHaveBeenCalled();
    expect(mockResolveSharedProjectScope).not.toHaveBeenCalled();
    expect(mockStorageAllowance).toHaveBeenCalledWith({
      db: scope.db,
      userId: scope.userId,
      organizationId: ORG,
    });
    expect(mockStorageAvailable).toHaveBeenCalledWith(
      { db: scope.db, userId: scope.userId, organizationId: ORG },
      metadata.byteCount,
      { planTier: 'free', limitBytes: null },
    );
  });

  it('does not fall back to shared membership from Personal', async () => {
    const { query, scope } = capacityFixture({ organizationId: null });

    await expect(checkProjectKnowledgeCapacity(scope, metadata)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(mockSavedWorkspace).not.toHaveBeenCalled();
    expect(mockPermissions).not.toHaveBeenCalled();
    expect(mockStorageAllowance).not.toHaveBeenCalled();
  });

  it.each(['viewer', 'reader', 'missing membership'] as const)(
    'still refuses a %s before capacity or storage checks',
    async (denial) => {
      if (denial === 'viewer') mockPermissions.mockResolvedValue(new Set(['content.read']));
      const { query, scope } = capacityFixture({
        role: denial === 'viewer' ? 'viewer' : 'member',
        write: denial !== 'reader',
        membership: denial !== 'missing membership',
      });

      await expect(checkProjectKnowledgeCapacity(scope, metadata)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(query.mock.calls.some(([sql]) => sql.includes('from project_knowledge_files'))).toBe(
        false,
      );
      expect(mockSavedWorkspace).not.toHaveBeenCalled();
      expect(mockStorageAllowance).not.toHaveBeenCalled();
      expect(mockStorageAvailable).not.toHaveBeenCalled();
    },
  );

  it.each([
    { options: { archived: true }, message: /archived/i },
    { options: { count: MAX_PROJECT_KNOWLEDGE_FILES }, message: /maximum/i },
    { options: { duplicate: true }, message: /already in the project as "existing.txt"/ },
  ])('preserves the shared editor refusal for $message', async ({ options, message }) => {
    const { scope } = capacityFixture(options);

    await expect(checkProjectKnowledgeCapacity(scope, metadata)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(message),
    });
    expect(mockPermissions).toHaveBeenCalledWith(ORG, 'member-1');
    expect(mockStorageAllowance).not.toHaveBeenCalled();
    expect(mockStorageAvailable).not.toHaveBeenCalled();
  });

  it('preserves a storage quota refusal after shared editor admission', async () => {
    const { scope } = capacityFixture();
    const refusal = createError.conflict('Storage quota reached');
    mockStorageAvailable.mockRejectedValue(refusal);

    await expect(checkProjectKnowledgeCapacity(scope, metadata)).rejects.toBe(refusal);
    expect(mockPermissions).toHaveBeenCalledWith(ORG, 'member-1');
    expect(mockStorageAvailable).toHaveBeenCalledWith(
      { db: scope.db, userId: scope.userId, organizationId: ORG },
      metadata.byteCount,
      { planTier: 'free', limitBytes: null },
    );
  });
});

describe('project knowledge files on an org-shared project', () => {
  it('lets a shared member read the sources the database already grants them', async () => {
    mockRlsQuery
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

  it('binds the admitted workspace and current grant in both read statements', async () => {
    mockRlsQuery.mockResolvedValueOnce([{ id: SHARED_PROJECT }]).mockResolvedValue([]);
    mockResolveSharedProjectScope.mockResolvedValue({
      organizationId: '22222222-2222-4222-8222-222222222222',
      projectIds: [],
    });

    const response = await GET(listRequest(), { params });
    expect(response.status).toBe(200);
    expect(mockResolveSharedProjectScope).not.toHaveBeenCalled();
    for (const call of mockRlsQuery.mock.calls.slice(0, 2)) {
      expect(call[0]).toContain(READABLE_PROJECT_SCOPE_SQL);
      expect(call[1]).toEqual([SHARED_PROJECT, 'member-1', ORG]);
    }
    expect(mockRlsQuery.mock.calls[1]?.[0]).toContain('join user_projects p');
  });

  it('returns no files when access disappears after the preliminary project read', async () => {
    mockRlsQuery.mockResolvedValueOnce([{ id: SHARED_PROJECT }]).mockResolvedValue([]);

    const response = await GET(listRequest(), { params });
    expect(response.status).toBe(200);
    expect((await response.json()).files).toEqual([]);
    expect(mockRlsQuery.mock.calls[1]?.[0]).toContain(READABLE_PROJECT_SCOPE_SQL);
  });

  it('returns not found when the statement-local project read is denied', async () => {
    mockRlsQuery.mockResolvedValue([]);

    const response = await GET(listRequest(), { params });
    expect(response.status).toBe(404);
    expect(mockRlsQuery.mock.calls).toHaveLength(1);
    expect(mockRlsQuery.mock.calls[0]?.[0]).toContain(READABLE_PROJECT_SCOPE_SQL);
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

type ImportedModule0 = typeof import('@/lib/services/active-workspace-service');
type ImportedModule1 = typeof import('@/lib/services/organization-permission-service');
type ImportedModule2 = typeof import('@/lib/server/file-storage');
