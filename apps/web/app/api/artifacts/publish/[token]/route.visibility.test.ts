import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';

type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type OrganizationPermissionServiceModule =
  typeof import('@/lib/services/organization-permission-service');
type OrgEntitlementsModule = typeof import('@/lib/services/org-entitlements');
type LoggerModule = typeof import('@/lib/logger');
type ManagedComputeGateModule = typeof import('@/lib/managed-compute-gate');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  rootQuery: vi.fn(),
  transaction: vi.fn(),
  inspect: vi.fn(),
  permission: vi.fn(),
  csrf: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  scopedDb: vi.fn(),
  permissions: new Set<string>(['content.read', 'content.share']),
  canShareArtifacts: vi.fn(async (..._args: unknown[]) => true),
  usesConnectors: false,
  sharingGate: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: (...a: unknown[]) => mocks.csrf(...a),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: (...a: unknown[]) => mocks.rateLimit(...a),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: (...a: unknown[]) => mocks.scopedDb(...a),
}));
vi.mock('@/lib/services/organization-permission-service', async (importOriginal) => {
  const { createError } = await import('@/lib/errors');
  return {
    ...(await importOriginal<OrganizationPermissionServiceModule>()),
    SHARE_INTO_WORKSPACE_DENIED_MESSAGE: 'read-only',
    requireOrganizationPermission: vi.fn(
      async (_userId: string, _organizationId: string, permission: string, message: string) => {
        mocks.permission(_userId, _organizationId, permission, message);
        if (!mocks.permissions.has(permission)) throw createError.forbidden(message);
      },
    ),
    resolveOrganizationPermissions: vi.fn(async () => new Set(mocks.permissions)),
  };
});
vi.mock('@/lib/services/org-entitlements', async (importOriginal) => ({
  ...(await importOriginal<OrgEntitlementsModule>()),
  organizationCanShareArtifacts: (...a: unknown[]) => mocks.canShareArtifacts(...a),
  getWorkspaceArtifactSharingErrorMessage: () => 'Upgrade to share with your workspace.',
}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<ManagedComputeGateModule>()),
  buildExternalSharingGateResponse: (...a: unknown[]) => mocks.sharingGate(...a),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/security/outbound-content-inspection', async (importOriginal) => ({
  ...(await importOriginal<MockedModule0>()),
  inspectOutboundContent: (...args: unknown[]) => mocks.inspect(...args),
}));

const { PATCH } = await import('./route');

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const ARTIFACT = '33333333-3333-4333-8333-333333333333';

function call(body: unknown, token = TOKEN, organizationId?: string) {
  return PATCH(
    new NextRequest(`https://agiworkforce.com/api/artifacts/publish/${token}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...(organizationId ? { [MANAGED_CLOUD_ORGANIZATION_HEADER]: organizationId } : {}),
      },
    }),
    { params: Promise.resolve({ token }) },
  );
}

function artifactRow(visibility: 'public' | 'organization' | 'invited') {
  return {
    id: ARTIFACT,
    token: TOKEN,
    user_id: 'user-1',
    artifact_id: 'artifact-1',
    conversation_id: null,
    title: 'Plan',
    kind: 'markdown',
    language: null,
    content: '# plan',
    visibility,
    created_at: '2026-09-13T00:00:00.000Z',
    updated_at: '2026-09-13T00:00:00.000Z',
  };
}

// This SQL model does not establish PostgreSQL RLS or concurrent transaction behavior.
function respond(
  visibility: 'public' | 'organization' | 'invited',
  existingGrant: string | null = ORG,
) {
  let grant = existingGrant;
  return (sql: string, params: unknown[] = []) => {
    const text = String(sql);
    if (text.includes('organization_shared_artifacts')) {
      if (text.includes('delete from')) {
        expect(params).toEqual([ARTIFACT, grant]);
        const removed = grant;
        grant = null;
        return removed ? [{ organization_id: removed, published_artifact_id: ARTIFACT }] : [];
      }
      if (text.includes('insert into')) grant = String(params[0]);
      return grant ? [{ organization_id: grant, published_artifact_id: ARTIFACT }] : [];
    }
    if (text.includes('live_artifacts')) {
      return [{ uses_connectors: mocks.usesConnectors }];
    }
    if (text.includes('update public.published_artifacts')) {
      return [{ ...artifactRow(visibility), title: params[4] ?? 'Plan' }];
    }
    if (text.includes('published_artifacts')) {
      return [artifactRow('organization')];
    }
    if (text.includes('web_conversations')) return [];
    throw new Error(`Unexpected SQL: ${text}`);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.csrf.mockResolvedValue(null);
  mocks.rateLimit.mockResolvedValue(null);
  mocks.permissions = new Set(['content.read', 'content.share']);
  mocks.canShareArtifacts.mockResolvedValue(true);
  mocks.usesConnectors = false;
  mocks.sharingGate.mockResolvedValue(null);
  mocks.query.mockImplementation(respond('organization', null));
  mocks.rootQuery.mockImplementation(() => {
    throw new Error('Audience query escaped transaction');
  });
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) =>
    work({ query: mocks.query }),
  );
  mocks.inspect.mockImplementation(async ({ value }: { value: string }) => ({
    action: 'allowed',
    value,
    findings: [],
  }));
  mocks.scopedDb.mockResolvedValue({
    db: { query: mocks.rootQuery, transaction: mocks.transaction },
    userId: 'user-1',
    organizationId: ORG,
  });
});

describe('PATCH /api/artifacts/publish/[token]', () => {
  it('asks the workspaces the publication is stored under before reopening its public link', async () => {
    mocks.query.mockImplementation(respond('public'));
    mocks.sharingGate.mockResolvedValue(
      Response.json({ error: { code: 'external_sharing_disabled' } }, { status: 403 }),
    );

    const response = await call({ visibility: 'public' });

    expect(response.status).toBe(403);
    expect(mocks.sharingGate).toHaveBeenCalledWith('user-1', expect.anything(), [ORG]);
    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.some((sql) => sql.includes('delete from public.organization_shared_artifacts')),
    ).toBe(false);
    expect(statements.some((sql) => sql.includes('update public.published_artifacts'))).toBe(false);
  });

  it('does not ask the external sharing policy for a move into the workspace', async () => {
    expect((await call({ visibility: 'organization' })).status).toBe(200);
    expect(mocks.sharingGate).not.toHaveBeenCalled();
  });

  it('mints the grant row and records the workspace audience', async () => {
    const response = await call({ visibility: 'organization' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      token: TOKEN,
      visibility: 'organization',
      organizationId: ORG,
    });

    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.some((sql) => sql.includes('insert into public.organization_shared_artifacts')),
    ).toBe(true);
    expect(statements.some((sql) => sql.includes('set visibility = $4'))).toBe(true);
  });

  it('refuses a read-only viewer before any grant row is written', async () => {
    mocks.permissions = new Set(['content.read']);

    const response = await call({ visibility: 'organization' });

    expect(response.status).toBe(403);
    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.some((sql) =>
        /(?:insert into|delete from) public.organization_shared_artifacts/.test(sql),
      ),
    ).toBe(false);
    expect(statements.some((sql) => sql.includes('update public.published_artifacts'))).toBe(false);
  });

  it('still lets a viewer withdraw their own artifact from the workspace', async () => {
    mocks.permissions = new Set(['content.read']);
    mocks.query.mockImplementation(respond('public'));

    expect((await call({ visibility: 'public' })).status).toBe(200);
  });

  it('drops the grant row when the audience goes back to public', async () => {
    mocks.query.mockImplementation(respond('public'));

    const response = await call({ visibility: 'public' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ visibility: 'public', organizationId: null });

    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.some((sql) => sql.includes('delete from public.organization_shared_artifacts')),
    ).toBe(true);
    expect(
      statements.some((sql) => sql.includes('insert into public.organization_shared_artifacts')),
    ).toBe(false);
  });

  it('limits the page to invited people and drops any workspace grant', async () => {
    mocks.query.mockImplementation(respond('invited'));

    const response = await call({ visibility: 'invited' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ visibility: 'invited', organizationId: null });
    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.some((sql) => sql.includes('delete from public.organization_shared_artifacts')),
    ).toBe(true);
  });

  it('lets someone outside any workspace share with invited people', async () => {
    mocks.query.mockImplementation(respond('invited', null));
    mocks.scopedDb.mockResolvedValue({
      db: { query: mocks.rootQuery, transaction: mocks.transaction },
      userId: 'user-1',
      organizationId: null,
    });

    const response = await call({ visibility: 'invited' });

    expect(response.status).toBe(200);
    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.some((sql) =>
        /(?:insert into|delete from) public.organization_shared_artifacts/.test(sql),
      ),
    ).toBe(false);
  });

  it('rejects an audience the schema does not model', async () => {
    expect((await call({ visibility: 'everyone-on-earth' })).status).toBe(400);
  });

  it('404s a malformed token before auth, rate limit or any query', async () => {
    const response = await call({ visibility: 'public' }, 'short');
    expect(response.status).toBe(404);
    expect(mocks.csrf).not.toHaveBeenCalled();
    expect(mocks.scopedDb).not.toHaveBeenCalled();
  });

  it('refuses when the caller belongs to no workspace', async () => {
    mocks.scopedDb.mockResolvedValue({
      db: { query: mocks.rootQuery, transaction: mocks.transaction },
      userId: 'user-1',
      organizationId: null,
    });
    expect((await call({ visibility: 'organization' })).status).toBe(403);
  });

  it('reports a failed audience move as a server error, not an unconfigured feature', async () => {
    mocks.query.mockImplementation(async () => {
      throw new Error('connection terminated');
    });
    expect((await call({ visibility: 'organization' })).status).toBe(500);
  });

  it('refuses workspace sharing when the workspace plan does not include it', async () => {
    mocks.canShareArtifacts.mockResolvedValue(false);

    const response = await call({ visibility: 'organization' });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    expect(mocks.canShareArtifacts).toHaveBeenCalledWith(ORG);
    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.some((sql) => sql.includes('insert into public.organization_shared_artifacts')),
    ).toBe(false);
    expect(statements.some((sql) => sql.includes('update public.published_artifacts'))).toBe(false);
  });

  it('refuses to make an artifact with connected apps public and changes nothing', async () => {
    mocks.usesConnectors = true;
    mocks.query.mockImplementation(respond('public'));

    const response = await call({ visibility: 'public' });

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain(
      'not available on publicly shared artifacts',
    );
    const statements = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.some((sql) =>
        /(?:insert into|delete from) public.organization_shared_artifacts/.test(sql),
      ),
    ).toBe(false);
    expect(statements.some((sql) => sql.includes('update public.published_artifacts'))).toBe(false);
  });

  it('lets an artifact with connected apps move to invited people', async () => {
    mocks.usesConnectors = true;
    mocks.query.mockImplementation(respond('invited'));

    expect((await call({ visibility: 'invited' })).status).toBe(200);
  });

  it('forwards mocked authoritative resolver B without querying saved A again', async () => {
    mocks.query.mockImplementation(respond('organization', ORG));
    mocks.scopedDb.mockImplementation(async (request: NextRequest) => {
      expect(request.headers.get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(OTHER_ORG);
      return {
        db: { query: mocks.rootQuery, transaction: mocks.transaction },
        userId: 'user-1',
        organizationId: OTHER_ORG,
      };
    });
    const response = await call({ visibility: 'organization' }, TOKEN, OTHER_ORG);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ organizationId: OTHER_ORG });
    expect(mocks.canShareArtifacts).toHaveBeenCalledWith(OTHER_ORG);
    expect(mocks.permission).toHaveBeenCalledWith(
      'user-1',
      OTHER_ORG,
      'content.share',
      expect.any(String),
    );
    expect(mocks.rootQuery).not.toHaveBeenCalled();
    expect(
      mocks.query.mock.calls.some(([sql]) => /user_settings|organization_members/.test(sql)),
    ).toBe(false);
  });

  it('puts an inspected combined rename in the audience transaction with no separate rename', async () => {
    mocks.query.mockImplementation(respond('invited'));
    mocks.inspect.mockResolvedValue({ action: 'redacted', value: 'Safe name', findings: [] });
    const response = await call({ visibility: 'invited', title: 'Unsafe name' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ title: 'Safe name', visibility: 'invited' });
    const writes = mocks.query.mock.calls.filter(([sql]) =>
      sql.includes('update public.published_artifacts'),
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[1]).toEqual([ARTIFACT, TOKEN, 'user-1', 'invited', 'Safe name']);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.rootQuery).not.toHaveBeenCalled();
  });

  it('propagates a gate refusal out of the transaction before returning its response', async () => {
    mocks.query.mockImplementation(respond('public'));
    mocks.sharingGate.mockResolvedValue(Response.json({ error: 'blocked' }, { status: 403 }));
    const outcomes: string[] = [];
    mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => {
      try {
        const result = await work({ query: mocks.query });
        outcomes.push('commit');
        return result;
      } catch (error) {
        outcomes.push('rollback');
        throw error;
      }
    });
    expect((await call({ visibility: 'public' })).status).toBe(403);
    expect(outcomes).toEqual(['rollback']);
  });
});

type MockedModule0 = typeof import('@/lib/security/outbound-content-inspection');
