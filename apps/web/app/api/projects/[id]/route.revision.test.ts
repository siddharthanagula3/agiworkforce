type ProjectMembershipModule = typeof import('@/lib/services/project-membership-service');
type OrgSharingModule = typeof import('@/lib/services/org-sharing-service');
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { query, access, membership, state } = vi.hoisted(() => ({
  query: vi.fn(),
  access: vi.fn(),
  membership: vi.fn(),
  state: { version: 4, name: 'Original', owner: true, exists: true, writes: 0 },
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    userId: 'fixture-owner',
    organizationId: '11111111-1111-4111-8111-111111111111',
    db: { query, transaction: vi.fn(async (run) => run({ query })) },
  })),
}));
vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<OrgSharingModule>()),
  resolveProjectWriteAccess: access,
  resolveSharedProjectScope: vi.fn(async () => null),
}));
vi.mock('@/lib/services/project-membership-service', async (importOriginal) => ({
  ...(await importOriginal<ProjectMembershipModule>()),
  replaceProjectConversationMembership: membership,
}));
vi.mock('@/lib/server/project-deletion', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  retireOwnedProject: vi.fn(),
  releaseDeletedProjectContents: vi.fn(),
}));

import { GET, PUT } from './route';
const projectId = '22222222-2222-4222-8222-222222222222';
const organizationId = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ id: projectId }) };
function request(body?: unknown, version?: string) {
  return new Request(`http://localhost:3000/api/projects/${projectId}`, {
    method: body === undefined ? 'GET' : 'PUT',
    headers: { 'content-type': 'application/json', ...(version ? { 'if-match': version } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as NextRequest;
}
function row() {
  return {
    id: projectId,
    user_id: state.owner ? 'fixture-owner' : 'other-owner',
    organization_id: organizationId,
    name: state.name,
    description: '',
    instructions: '',
    is_archived: false,
    server_version: String(state.version),
    default_privacy_mode: 'managed',
    default_provider_mode: 'ManagedGateway',
    created_at: '2026-11-09T00:00:00Z',
    updated_at: '2026-11-09T00:00:01Z',
    is_org_shared: !state.owner,
    shared_access: state.owner ? null : 'write',
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { version: 4, name: 'Original', owner: true, exists: true, writes: 0 });
  access.mockImplementation(async () => (!state.exists ? null : state.owner ? 'owner' : 'editor'));
  query.mockImplementation(async (sql: string, params: unknown[]) => {
    expect(params).toContain(organizationId);
    if (!state.exists) return [];
    if (sql.startsWith('update user_projects')) {
      expect(sql).toMatch(/organization_id is not distinct from \$\d+::uuid/);
      if (state.owner === sql.includes('user_id <>')) return [];
      const conditional = sql.includes('and server_version =');
      if (conditional) {
        expect(sql).toMatch(/and server_version = \$\d+::bigint/);
        if (String(params.at(-1)) !== String(state.version)) return [];
      }
      state.name = typeof params[0] === 'string' ? params[0] : state.name;
      state.version += 1;
      state.writes += 1;
      return [row()];
    }
    if (sql.includes('from user_projects p')) return [row()];
    throw new Error(`Unexpected query: ${sql}`);
  });
});

describe('project revision preconditions', () => {
  it('returns the authoritative version and ETag when a project is read', async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"4"');
    expect((await response.json()).project.serverVersion).toBe('4');
  });
  it('compares the revision in the scoped UPDATE and confirms the new version', async () => {
    const response = await PUT(request({ name: 'Revised' }, '"4"'), context);
    expect(response.status).toBe(200);
    expect(query.mock.calls[0]![0]).toMatch(/and server_version = \$5::bigint/);
    expect(query.mock.calls[0]![1]).toEqual([
      'Revised',
      projectId,
      'fixture-owner',
      organizationId,
      '4',
    ]);
    expect(response.headers.get('etag')).toBe('"5"');
    expect((await response.json()).project.serverVersion).toBe('5');
    expect(state.writes).toBe(1);
  });
  it.each([true, false])(
    'refuses a stale revision without changing the owner/editor record (owner: %s)',
    async (owner) => {
      state.owner = owner;
      const response = await PUT(request({ name: 'Stale' }, '"3"'), context);
      expect(response.status).toBe(412);
      expect(response.headers.get('etag')).toBe('"4"');
      expect((await response.json()).current.name).toBe('Original');
      expect(state.writes).toBe(0);
    },
  );
  it('does not change conversation membership after a conditional update misses', async () => {
    const response = await PUT(request({ name: 'Stale', conversationIds: [] }, '"3"'), context);
    expect(response.status).toBe(412);
    expect(membership).not.toHaveBeenCalled();
    expect(state.writes).toBe(0);
  });
  it('keeps owner-only settings protected even for a stale editor request', async () => {
    state.owner = false;
    const response = await PUT(request({ isArchived: true }, '"3"'), context);
    expect(response.status).toBe(403);
    expect(state.writes).toBe(0);
  });
  it('does not disclose a current project when write access is gone', async () => {
    state.exists = false;
    const response = await PUT(request({ name: 'Not owned' }, '"3"'), context);
    expect(response.status).toBe(404);
    expect(await response.json()).not.toHaveProperty('current');
  });
  it('preserves callers that do not send a revision', async () => {
    const response = await PUT(request({ name: 'Unconditional' }), context);
    expect(response.status).toBe(200);
    expect(query.mock.calls[0]![0]).not.toMatch(/and server_version =/);
    expect(state.writes).toBe(1);
  });
  it('rejects a malformed revision before writing', async () => {
    const response = await PUT(request({ name: 'Invalid' }, 'invalid'), context);
    expect(response.status).toBe(400);
    expect(state.writes).toBe(0);
  });
});
