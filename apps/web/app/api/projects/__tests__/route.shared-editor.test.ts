import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
type ScanModule0 = typeof import('@/lib/services/org-sharing-service');

vi.mock('server-only', () => ({}));

const {
  mockRlsQuery,
  mockResolveActiveOrganizationId,
  mockResolveProjectWriteAccess,
  mockSavedOrganizationId,
  mockPermissions,
} = vi.hoisted(() => ({
  mockRlsQuery: vi.fn(),
  mockResolveActiveOrganizationId: vi.fn(),
  mockResolveProjectWriteAccess: vi.fn(),
  mockSavedOrganizationId: vi.fn(),
  mockPermissions: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  resolveActiveOrganizationId: mockSavedOrganizationId,
}));
vi.mock('@/lib/services/organization-permission-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  resolveOrganizationPermissions: mockPermissions,
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
  ...(await importOriginal<ScanModule0>()),
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
  mockRlsQuery.mockReset();
  mockResolveProjectWriteAccess.mockReset();
  mockResolveActiveOrganizationId.mockResolvedValue(ORG);
});

describe('PUT with real write access and mocked request-scope receipt', () => {
  const SAVED_ORG = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    const real = await vi.importActual<ScanModule0>('@/lib/services/org-sharing-service');
    mockResolveProjectWriteAccess.mockImplementation(real.resolveProjectWriteAccess);
    mockSavedOrganizationId.mockResolvedValue(SAVED_ORG);
    mockPermissions.mockResolvedValue(new Set(['content.share']));
  });

  function receiptRequest(explicit: boolean): never {
    return new Request(`http://localhost:3000/api/projects/${PROJECT}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...(explicit ? { [MANAGED_CLOUD_ORGANIZATION_HEADER]: ORG } : {}),
      },
      body: JSON.stringify({ instructions: 'Rewritten' }),
    }) as never;
  }

  function respondToWrite(
    options: {
      membership?: Record<string, unknown>[];
      membershipError?: boolean;
      writeGrant?: boolean;
      owner?: boolean;
    } = {},
  ) {
    mockRlsQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('update user_projects')) {
        return sql.includes('user_id <>') || options.owner
          ? [projectRow({ instructions: 'Rewritten' })]
          : [];
      }
      if (sql.includes('from public.organization_members')) {
        if (options.membershipError) throw new Error('membership unavailable');
        return options.membership ?? [{ organization_id: ORG, role: 'member' }];
      }
      if (sql.includes('from public.organization_shared_projects')) {
        return sql.includes("a.access = 'write'") && options.writeGrant === false
          ? []
          : [{ project_id: PROJECT }];
      }
      if (sql.includes('from user_projects p')) {
        return [
          projectRow({
            instructions: 'Rewritten',
            user_id: options.owner ? 'member-1' : 'owner-1',
            is_org_shared: !options.owner,
            shared_access: options.owner ? null : 'write',
          }),
        ];
      }
      if (sql.includes('from user_projects')) return [];
      throw new Error(`Unexpected query: ${sql}`);
    });
  }

  function expectOnlyTargetQueries() {
    expect(mockSavedOrganizationId).not.toHaveBeenCalled();
    for (const [sql, params] of mockRlsQuery.mock.calls) {
      expect(params).not.toContain(SAVED_ORG);
      if (sql.includes('from public.organization_members')) {
        expect(sql).toMatch(/organization_id = \$1 and user_id = \$2[\s\S]*status = 'active'/);
        expect(params).toEqual([ORG, 'member-1']);
      }
      if (sql.includes('from public.organization_shared_projects')) {
        expect(sql).toMatch(/s\.organization_id = \$1/);
        expect(params).toEqual([ORG, 'member-1']);
      }
    }
  }

  it.each([true, false])(
    'writes B with an explicit grant and content.share (explicit header: %s)',
    async (explicit) => {
      respondToWrite();
      const response = await PUT(receiptRequest(explicit), context);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.project.instructions).toBe('Rewritten');
      expect(body.project.sharedAccess).toBe('write');
      expect(mockResolveProjectWriteAccess).toHaveBeenCalledWith(expect.anything(), {
        projectId: PROJECT,
        userId: 'member-1',
        organizationId: ORG,
      });
      expect(mockPermissions).toHaveBeenCalledWith(ORG, 'member-1');
      expectOnlyTargetQueries();
      const grants = mockRlsQuery.mock.calls.find(([sql]) => sql.includes("a.access = 'write'"))!;
      expect(grants[0]).toMatch(/join public\.organization_project_access a/);
      expect(grants[0]).toMatch(/a\.user_id = \$2/);
      const writes = mockRlsQuery.mock.calls.filter(([sql]) =>
        sql.startsWith('update user_projects'),
      );
      expect(writes).toHaveLength(2);
      expect(writes[0]![0]).toMatch(/user_id = \$3/);
      expect(writes[1]![0]).toMatch(/user_id <> \$3/);
      for (const [sql, params] of writes) {
        expect(sql).toMatch(/organization_id is not distinct from \$4::uuid/);
        expect(params).toEqual(['Rewritten', PROJECT, 'member-1', ORG]);
      }
      const [readSql, readParams] = mockRlsQuery.mock.calls.at(-1)!;
      expect(readSql).toMatch(/p\.id = any\(\$3::uuid\[\]\)/);
      expect(readSql).toMatch(/p\.organization_id is not distinct from \$4::uuid/);
      expect(readParams).toEqual([PROJECT, 'member-1', [PROJECT], ORG, 'write']);
    },
  );

  it.each(['reader', 'viewer', 'missing', 'mismatched', 'membership error'] as const)(
    'does not attempt an editor write for %s',
    async (kind) => {
      respondToWrite({
        writeGrant: kind !== 'reader',
        membershipError: kind === 'membership error',
        membership:
          kind === 'missing'
            ? []
            : [
                {
                  organization_id: kind === 'mismatched' ? SAVED_ORG : ORG,
                  role: kind === 'viewer' ? 'viewer' : 'member',
                },
              ],
      });
      if (kind === 'viewer') mockPermissions.mockResolvedValue(new Set());
      const response = await PUT(receiptRequest(false), context);
      expect(response.status).toBe(kind === 'membership error' ? 500 : 404);
      expect(
        mockRlsQuery.mock.calls.filter(([sql]) => sql.startsWith('update user_projects')),
      ).toHaveLength(1);
      expect(mockRlsQuery.mock.calls.some(([sql]) => sql.includes('user_id <>'))).toBe(false);
      if (kind === 'missing' || kind === 'mismatched' || kind === 'membership error') {
        expect(
          mockRlsQuery.mock.calls.some(([sql]) => sql.includes('organization_shared_projects')),
        ).toBe(false);
      }
      expectOnlyTargetQueries();
    },
  );

  it('does not fall back to saved A for a Personal editor attempt', async () => {
    mockResolveActiveOrganizationId.mockResolvedValue(null);
    respondToWrite();
    const response = await PUT(receiptRequest(false), context);
    expect(response.status).toBe(404);
    expect(mockRlsQuery).toHaveBeenCalledTimes(2);
    expect(mockRlsQuery.mock.calls[0]![1]).toEqual(['Rewritten', PROJECT, 'member-1', null]);
    expect(mockRlsQuery.mock.calls[1]![1]).toEqual([PROJECT, 'member-1', null]);
    expect(mockSavedOrganizationId).not.toHaveBeenCalled();
    expect(mockPermissions).not.toHaveBeenCalled();
  });

  it('preserves the owner update without membership or grant lookups', async () => {
    respondToWrite({ owner: true });
    const response = await PUT(receiptRequest(false), context);
    expect(response.status).toBe(200);
    expect(mockRlsQuery).toHaveBeenCalledTimes(2);
    expect(mockResolveProjectWriteAccess).not.toHaveBeenCalled();
    expect(mockPermissions).not.toHaveBeenCalled();
    expectOnlyTargetQueries();
  });
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

type ImportedModule0 = typeof import('@/lib/services/active-workspace-service');
type ImportedModule1 = typeof import('@/lib/services/organization-permission-service');
