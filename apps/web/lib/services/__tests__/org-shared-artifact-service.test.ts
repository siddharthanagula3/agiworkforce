import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  getOrgReadableArtifactByToken,
  listSharedArtifacts,
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

  it('preserves invited visibility when a stale grant is returned by the adapter', async () => {
    const { db } = makeDb(() => [sharedRow({ visibility: 'invited' })]);
    const [artifact] = await listSharedArtifacts(db, ORG);
    expect(artifact?.visibility).toBe('invited');
  });

  it('surfaces a missing sharing table instead of listing nothing', async () => {
    const { db } = makeDb(() => {
      throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
    });
    await expect(listSharedArtifacts(db, ORG)).rejects.toMatchObject({ code: '42P01' });
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

    const artifact = await getOrgReadableArtifactByToken(db, TOKEN, 'user_owner');

    expect(artifact?.visibility).toBe('organization');
    expect(issued[0]?.sql).toContain('where token = $1');
    expect(issued[0]?.sql).not.toContain('user_id =');
    expect(issued[0]?.params).toEqual([TOKEN]);
  });

  it('preserves invited visibility through the canonical row mapper', async () => {
    const { db, issued } = makeDb(() => [{
      id: ARTIFACT, token: TOKEN, user_id: 'user_owner', artifact_id: 'artifact-1',
      conversation_id: null, title: 'Invited', kind: 'markdown', language: null,
      content: '# private invitation', visibility: 'invited',
      created_at: '2026-09-13T00:00:00.000Z', updated_at: '2026-09-13T00:00:00.000Z',
    }]);
    const artifact = await getOrgReadableArtifactByToken(db, TOKEN, 'invited-viewer');
    expect(artifact?.visibility).toBe('invited');
    expect(issued).toHaveLength(1);
  });

  it('refuses a malformed token without touching the database', async () => {
    const { db, issued } = makeDb(() => []);
    await expect(getOrgReadableArtifactByToken(db, 'nope', 'user_owner')).resolves.toBeNull();
    expect(issued).toHaveLength(0);
  });
});
