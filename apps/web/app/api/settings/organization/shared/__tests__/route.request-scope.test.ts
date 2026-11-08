import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
  ownerQuery: vi.fn(),
  permissions: vi.fn(),
  audit: vi.fn(),
  evict: vi.fn(),
  rate: vi.fn(),
  csrf: vi.fn(),
  listProjects: vi.fn(),
  listConnectors: vi.fn(),
  listArtifacts: vi.fn(),
  listSessions: vi.fn(),
  shareProject: vi.fn(),
  unshareProject: vi.fn(),
  setAccess: vi.fn(),
  clearAccess: vi.fn(),
  shareConnector: vi.fn(),
  unshareConnector: vi.fn(),
  unshareArtifact: vi.fn(),
  unshareSession: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.auth }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: mocks.ownerQuery }) }));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<RetainedMockModule0>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.rate }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.csrf }));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mocks.audit,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/services/organization-permission-service', async (importOriginal) => ({
  ...(await importOriginal<CompleteMockModule0>()),
  resolveOrganizationPermissions: mocks.permissions,
}));
vi.mock('@/lib/connectors/connector-capability', () => ({ assertConnectorsReleased: vi.fn() }));
vi.mock('@/lib/user-connector-tools', () => ({ evictOrgSharedConnectorCaches: mocks.evict }));
vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<MockedModule0>()),
  listSharedProjects: mocks.listProjects,
  shareProject: mocks.shareProject,
  unshareProject: mocks.unshareProject,
  setProjectMemberAccess: mocks.setAccess,
  clearProjectMemberAccess: mocks.clearAccess,
}));
vi.mock('@/lib/services/org-shared-connector-service', () => ({
  listSharedConnectors: mocks.listConnectors,
  shareConnector: mocks.shareConnector,
  unshareConnector: mocks.unshareConnector,
}));
vi.mock('@/lib/services/org-shared-artifact-service', () => ({
  listSharedArtifacts: mocks.listArtifacts,
  unshareArtifactFromOrganization: mocks.unshareArtifact,
}));
vi.mock('@/lib/services/org-shared-session-service', () => ({
  updateSharedSessionAudience: vi.fn(),
  listSharedSessions: mocks.listSessions,
  unshareSessionFromOrganization: mocks.unshareSession,
}));

import { GET } from '../route';
import {
  PUT as projectPut,
  PATCH as projectPatch,
  DELETE as projectDelete,
} from '../projects/[projectId]/route';
import { PUT as connectorPut, DELETE as connectorDelete } from '../connectors/[connectorId]/route';
import { DELETE as artifactDelete } from '../artifacts/[artifactId]/route';
import { DELETE as sessionDelete } from '../conversations/[sharedSessionId]/route';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const RESOURCE = '33333333-3333-4333-8333-333333333333';
const USER = 'multi-workspace-user';
const db = { query: mocks.query };
const projectContext = { params: Promise.resolve({ projectId: RESOURCE }) };
const connectorContext = { params: Promise.resolve({ connectorId: RESOURCE }) };
const artifactContext = { params: Promise.resolve({ artifactId: RESOURCE }) };
const sessionContext = { params: Promise.resolve({ sharedSessionId: RESOURCE }) };
const mutations = [
  mocks.shareProject,
  mocks.unshareProject,
  mocks.setAccess,
  mocks.clearAccess,
  mocks.shareConnector,
  mocks.unshareConnector,
  mocks.unshareArtifact,
  mocks.unshareSession,
];
const lists = [mocks.listProjects, mocks.listConnectors, mocks.listArtifacts, mocks.listSessions];
const cases = [
  {
    name: 'overview GET',
    method: 'GET',
    invoke: (r: never) => GET(r),
    mutation: null,
  },
  {
    name: 'project PUT',
    method: 'PUT',
    body: {},
    invoke: (r: never) => projectPut(r, projectContext),
    mutation: mocks.shareProject,
  },
  {
    name: 'project PATCH grant',
    method: 'PATCH',
    body: { userId: 'target', access: 'read' },
    invoke: (r: never) => projectPatch(r, projectContext),
    mutation: mocks.setAccess,
  },
  {
    name: 'project PATCH inherit',
    method: 'PATCH',
    body: { userId: 'target', access: 'inherit' },
    invoke: (r: never) => projectPatch(r, projectContext),
    mutation: mocks.clearAccess,
  },
  {
    name: 'project DELETE',
    method: 'DELETE',
    invoke: (r: never) => projectDelete(r, projectContext),
    mutation: mocks.unshareProject,
  },
  {
    name: 'connector PUT',
    method: 'PUT',
    invoke: (r: never) => connectorPut(r, connectorContext),
    mutation: mocks.shareConnector,
  },
  {
    name: 'connector DELETE',
    method: 'DELETE',
    invoke: (r: never) => connectorDelete(r, connectorContext),
    mutation: mocks.unshareConnector,
  },
  {
    name: 'artifact DELETE',
    method: 'DELETE',
    invoke: (r: never) => artifactDelete(r, artifactContext),
    mutation: mocks.unshareArtifact,
  },
  {
    name: 'conversation DELETE',
    method: 'DELETE',
    invoke: (r: never) => sessionDelete(r, sessionContext),
    mutation: mocks.unshareSession,
  },
];

function request(
  entry: (typeof cases)[number],
  explicit = true,
  body: unknown = entry.body,
  headerValue = B,
): never {
  return new Request(`http://localhost/api/settings/organization/shared?organizationId=${A}`, {
    method: entry.method,
    headers: explicit ? { [MANAGED_CLOUD_ORGANIZATION_HEADER]: headerValue } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

function bindScope(scope: string | null): void {
  mocks.auth.mockResolvedValue({ db, userId: USER, organizationId: scope });
}

function assertNoEffects(): void {
  for (const mutation of mutations) expect(mutation).not.toHaveBeenCalled();
  for (const list of lists) expect(list).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.evict).not.toHaveBeenCalled();
  expect(mocks.ownerQuery).not.toHaveBeenCalled();
}

describe('sharing routes consume mocked authenticated scope through the real membership helper', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    bindScope(B);
    mocks.rate.mockResolvedValue(null);
    mocks.csrf.mockResolvedValue(null);
    mocks.permissions.mockResolvedValue(new Set(['sharing.manage', 'content.share']));
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (/public\.user_settings/i.test(sql)) return [{ organization_id: A }];
      if (/public\.organization_members/i.test(sql)) {
        return [{ organization_id: params[0], role: 'admin' }];
      }
      return [];
    });
    mocks.ownerQuery.mockResolvedValue([]);
    for (const list of lists) list.mockResolvedValue([]);
    for (const mutation of mutations) mutation.mockResolvedValue(true);
    mocks.shareProject.mockResolvedValue({
      projectId: RESOURCE,
      name: 'Project',
      defaultAccess: 'read',
    });
    mocks.setAccess.mockResolvedValue({ userId: 'target', access: 'read' });
    mocks.shareConnector.mockResolvedValue({ connectorRowId: RESOURCE });
  });

  for (const entry of cases) {
    it.each([true, false])(
      `${entry.name} retains resolved B with saved A (explicit header: %s)`,
      async (explicit) => {
        const req = request(entry, explicit);
        const response = await entry.invoke(req);
        expect(response.status).toBe(200);
        expect(mocks.auth).toHaveBeenCalledTimes(1);
        expect(mocks.auth).toHaveBeenCalledWith(req);
        expect(mocks.query).toHaveBeenCalledTimes(1);
        expect(mocks.query).toHaveBeenCalledWith(
          expect.stringMatching(
            /where organization_id = \$1 and user_id = \$2\s+and status = 'active'/,
          ),
          [B, USER],
        );
        if (entry.mutation) {
          expect(entry.mutation).toHaveBeenCalledTimes(1);
          const args = entry.mutation.mock.calls[0]!;
          expect(args[0]).toBe(db);
          expect(typeof args[1] === 'string' ? args[1] : args[1].organizationId).toBe(B);
          expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId: B, userId: USER }),
          );
        } else {
          expect((await response.json()).organizationId).toBe(B);
          for (const list of lists) expect(list).toHaveBeenCalledWith(db, B);
          expect(mocks.ownerQuery).toHaveBeenCalledWith(expect.any(String), [B]);
        }
        if (
          entry.name.startsWith('project') ||
          entry.name.startsWith('connector') ||
          !entry.mutation
        ) {
          expect(mocks.permissions).toHaveBeenCalledTimes(1);
          expect(mocks.permissions).toHaveBeenCalledWith(B, USER);
        }
        if (entry.name === 'connector DELETE')
          expect(mocks.evict).toHaveBeenCalledWith(B, RESOURCE);
      },
    );

    it(`${entry.name} preserves the rate limit before authentication`, async () => {
      mocks.rate.mockResolvedValue(new Response(null, { status: 429 }));
      expect((await entry.invoke(request(entry))).status).toBe(429);
      expect(mocks.auth).not.toHaveBeenCalled();
      assertNoEffects();
    });

    if (entry.mutation) {
      it(`${entry.name} preserves CSRF refusal before authentication`, async () => {
        mocks.csrf.mockResolvedValue(new Response(null, { status: 403 }));
        expect((await entry.invoke(request(entry))).status).toBe(403);
        expect(mocks.auth).not.toHaveBeenCalled();
        assertNoEffects();
      });
    }

    it(`${entry.name} rejects resolved Personal even with saved membership A`, async () => {
      bindScope(null);
      const response = await entry.invoke(
        request(entry, true, entry.body, MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE),
      );
      expect(response.status).toBe(403);
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.permissions).not.toHaveBeenCalled();
      assertNoEffects();
    });

    it.each(['missing', 'inactive', 'mismatched'])(
      `${entry.name} refuses %s membership after mocked scope resolution`,
      async (state) => {
        mocks.query.mockImplementation(async (sql: string) => {
          if (/public\.user_settings/i.test(sql)) return [{ organization_id: A }];
          if (state === 'mismatched') return [{ organization_id: A, role: 'admin' }];
          if (state === 'inactive' && !/status = 'active'/.test(sql)) {
            return [{ organization_id: B, role: 'admin' }];
          }
          return [];
        });
        const response = await entry.invoke(request(entry));
        expect(response.status).toBe(403);
        expect(mocks.permissions).not.toHaveBeenCalled();
        assertNoEffects();
      },
    );
  }

  const permissionGatedCases = cases.filter(
    (item) => item.name.startsWith('project') || item.name.startsWith('connector'),
  );
  for (const entry of permissionGatedCases) {
    it(`${entry.name} honors sharing.manage for a custom member role in B`, async () => {
      mocks.query.mockResolvedValue([{ organization_id: B, role: 'member' }]);
      expect((await entry.invoke(request(entry))).status).toBe(200);
      expect(mocks.permissions).toHaveBeenCalledWith(B, USER);
      expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ organizationId: B }));
    });

    it(`${entry.name} refuses permission in B even if saved A would allow it`, async () => {
      mocks.permissions.mockImplementation(
        async (organizationId: string) =>
          new Set(organizationId === A ? ['sharing.manage'] : ['content.read']),
      );
      const response = await entry.invoke(request(entry));
      expect(response.status).toBe(403);
      expect(mocks.permissions).toHaveBeenCalledTimes(1);
      expect(mocks.permissions).toHaveBeenCalledWith(B, USER);
      assertNoEffects();
    });
  }

  it('project ownership permission stays fenced to the resolved workspace', async () => {
    mocks.permissions.mockResolvedValue(new Set(['content.share']));
    const entry = cases[1]!;
    expect((await entry.invoke(request(entry))).status).toBe(403);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringMatching(/organization_id is not distinct from \$3::uuid/),
      [RESOURCE, USER, B],
    );
    assertNoEffects();
  });

  it('project PUT rejects organizationId in the body instead of treating it as authority', async () => {
    const entry = cases[1]!;
    expect((await entry.invoke(request(entry, true, { organizationId: A }))).status).toBe(400);
    assertNoEffects();
  });
});

type MockedModule0 = typeof import('@/lib/services/org-sharing-service');

type CompleteMockModule0 = typeof import('@/lib/services/organization-permission-service');

type RetainedMockModule0 = typeof import('@/lib/logger');
