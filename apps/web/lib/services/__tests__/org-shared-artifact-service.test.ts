import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockResolveOrgMembership } = vi.hoisted(() => ({
  mockResolveOrgMembership: vi.fn(),
}));

vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/org-sharing-service')>()),
  resolveOrgMembership: mockResolveOrgMembership,
}));

import {
  getOrgReadableArtifactByToken,
  isArtifactSharingSchemaUnavailable,
  listSharedArtifacts,
  resolveArtifactShareTarget,
  shareArtifactWithOrganization,
  unshareArtifactFromOrganization,
} from '../org-shared-artifact-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const ARTIFACT = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAA';

interface Issued {
  sql: string;
  params: unknown[];
}

function makeDb(handler: (sql: string, params: unknown[]) => unknown[]) {
  const issued: Issued[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      issued.push({ sql, params });
      return handler(sql, params);
    }),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    withOrg: vi.fn(),
    dispose: vi.fn(),
  };
  return { db: db as never, issued };
}

function sharedRow(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    published_artifact_id: ARTIFACT,
    token: TOKEN,
    artifact_id: 'artifact-1',
    title: 'Quarterly plan',
    kind: 'markdown',
    visibility: 'organization',
    owner_user_id: 'user_owner',
    shared_by_user_id: 'user_owner',
    created_at: '2026-09-13T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveOrgMembership.mockResolvedValue({ organizationId: ORG, role: 'owner' });
});

describe('listSharedArtifacts', () => {
  it('joins the artifact and scopes to the organization', async () => {
    const { db, issued } = makeDb(() => [sharedRow()]);

    const artifacts = await listSharedArtifacts(db, ORG);

    expect(artifacts).toEqual([
      {
        organizationId: ORG,
        publishedArtifactId: ARTIFACT,
        token: TOKEN,
        artifactId: 'artifact-1',
        title: 'Quarterly plan',
        kind: 'markdown',
        visibility: 'organization',
        ownerUserId: 'user_owner',
        sharedByUserId: 'user_owner',
        createdAt: '2026-09-13T00:00:00.000Z',
      },
    ]);
    expect(issued[0]?.sql).toContain('organization_shared_artifacts');
    expect(issued[0]?.sql).toContain('where share.organization_id = $1');
    expect(issued[0]?.params).toEqual([ORG]);
  });

  it('reads an unknown visibility as public rather than inventing an audience', async () => {
    const { db } = makeDb(() => [sharedRow({ visibility: 'something-else' })]);
    const [artifact] = await listSharedArtifacts(db, ORG);
    expect(artifact?.visibility).toBe('public');
  });

  it('returns nothing when the sharing schema is not applied yet', async () => {
    const { db } = makeDb(() => {
      throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
    });
    await expect(listSharedArtifacts(db, ORG)).resolves.toEqual([]);
  });
});

describe('shareArtifactWithOrganization', () => {
  it('upserts the grant row and returns the share', async () => {
    const { db, issued } = makeDb(() => [sharedRow()]);

    const shared = await shareArtifactWithOrganization(db, {
      organizationId: ORG,
      publishedArtifactId: ARTIFACT,
      actorUserId: 'user_owner',
    });

    expect(shared.publishedArtifactId).toBe(ARTIFACT);
    expect(issued[0]?.sql).toContain('insert into public.organization_shared_artifacts');
    expect(issued[0]?.sql).toContain('on conflict (organization_id, published_artifact_id)');
    expect(issued[0]?.params).toEqual([ORG, ARTIFACT, 'user_owner']);
  });

  it('reports a 404 rather than a 500 when row level security writes nothing', async () => {
    const { db } = makeDb(() => []);
    await expect(
      shareArtifactWithOrganization(db, {
        organizationId: ORG,
        publishedArtifactId: ARTIFACT,
        actorUserId: 'user_stranger',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('unshareArtifactFromOrganization', () => {
  it('deletes the grant row for that organization only', async () => {
    const { db, issued } = makeDb(() => [{ published_artifact_id: ARTIFACT }]);

    await expect(unshareArtifactFromOrganization(db, ORG, ARTIFACT)).resolves.toBe(true);
    expect(issued[0]?.sql).toContain('delete from public.organization_shared_artifacts');
    expect(issued[0]?.params).toEqual([ORG, ARTIFACT]);
  });

  it('is false when nothing was shared', async () => {
    const { db } = makeDb(() => []);
    await expect(unshareArtifactFromOrganization(db, ORG, ARTIFACT)).resolves.toBe(false);
  });
});

describe('getOrgReadableArtifactByToken', () => {
  it('leaves the visibility decision to row level security, adding no owner predicate', async () => {
    const { db, issued } = makeDb(() => [
      {
        id: ARTIFACT,
        token: TOKEN,
        user_id: 'user_owner',
        artifact_id: 'artifact-1',
        conversation_id: null,
        title: 'Quarterly plan',
        kind: 'markdown',
        language: null,
        content: '# plan',
        visibility: 'organization',
        created_at: '2026-09-13T00:00:00.000Z',
        updated_at: '2026-09-13T00:00:00.000Z',
      },
    ]);

    const artifact = await getOrgReadableArtifactByToken(db, TOKEN);

    expect(artifact?.visibility).toBe('organization');
    expect(issued[0]?.sql).toContain('where token = $1');
    expect(issued[0]?.sql).not.toContain('user_id =');
    expect(issued[0]?.params).toEqual([TOKEN]);
  });

  it('refuses a malformed token without touching the database', async () => {
    const { db, issued } = makeDb(() => []);
    await expect(getOrgReadableArtifactByToken(db, 'nope')).resolves.toBeNull();
    expect(issued).toHaveLength(0);
  });
});

describe('resolveArtifactShareTarget', () => {
  it('refuses when the caller belongs to no workspace', async () => {
    mockResolveOrgMembership.mockResolvedValue(null);
    const { db } = makeDb(() => []);
    await expect(
      resolveArtifactShareTarget(db, { userId: 'user_owner', token: TOKEN }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('binds the owner into the artifact lookup', async () => {
    const { db, issued } = makeDb(() => [{ id: ARTIFACT }]);

    const target = await resolveArtifactShareTarget(db, { userId: 'user_owner', token: TOKEN });

    expect(target).toEqual({ organizationId: ORG, publishedArtifactId: ARTIFACT });
    expect(issued[0]?.sql).toContain('where token = $1 and user_id = $2');
    expect(issued[0]?.params).toEqual([TOKEN, 'user_owner']);
  });

  it('is a 404 when the caller does not own that token', async () => {
    const { db } = makeDb(() => []);
    await expect(
      resolveArtifactShareTarget(db, { userId: 'user_stranger', token: TOKEN }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('isArtifactSharingSchemaUnavailable', () => {
  it('recognises a missing table and a missing column, nested in a cause', () => {
    expect(isArtifactSharingSchemaUnavailable({ code: '42P01' })).toBe(true);
    expect(isArtifactSharingSchemaUnavailable({ cause: { code: '42703' } })).toBe(true);
    expect(isArtifactSharingSchemaUnavailable({ code: '23505' })).toBe(false);
  });
});
