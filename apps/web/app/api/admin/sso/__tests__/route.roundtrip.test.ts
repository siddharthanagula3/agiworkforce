import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockGetSubscription,
  mockGetClerkAuthUser,
  mockVerifyDomainOwnership,
  mockCreateEnterpriseConnection,
  mockUpdateEnterpriseConnection,
  mockDeleteEnterpriseConnection,
} = vi.hoisted(() => ({
  mockGetSubscription: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
  mockVerifyDomainOwnership: vi.fn(),
  mockCreateEnterpriseConnection: vi.fn(),
  mockUpdateEnterpriseConnection: vi.fn(),
  mockDeleteEnterpriseConnection: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: vi.fn(async () => undefined),
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: (...args: unknown[]) => mockGetSubscription(...args) },
}));
vi.mock('@/lib/server/sso/domain-verification', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/sso/domain-verification')>();
  return {
    ...actual,
    verifyDomainOwnership: (...args: unknown[]) => mockVerifyDomainOwnership(...args),
  };
});
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    enterpriseConnections: {
      createEnterpriseConnection: mockCreateEnterpriseConnection,
      updateEnterpriseConnection: mockUpdateEnterpriseConnection,
      deleteEnterpriseConnection: mockDeleteEnterpriseConnection,
    },
  }),
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '33333333-3333-4333-8333-333333333333';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const METADATA_URL = 'https://example.okta.com/app/abc/sso/saml/metadata';

type Row = Record<string, unknown>;

const store = {
  connection: null as Row | null,
  role: 'owner' as string | null,
  roleByOrg: {} as Record<string, string>,
};

const mockQuery = vi.fn(async (sql: string, params: unknown[] = []): Promise<Row[]> => {
  const text = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  if (text.startsWith('select role from organization_members')) {
    const orgId = params[0] as string;
    const role = store.roleByOrg[orgId] ?? store.role;
    return role ? [{ role }] : [];
  }

  if (text.startsWith('select organization_id from organization_members')) {
    return store.connection ? [{ organization_id: store.connection['organization_id'] }] : [];
  }

  if (text.startsWith('insert into sso_connections')) {
    store.connection = {
      id: CONNECTION_ID,
      organization_id: params[0],
      provider_type: params[1],
      domain: params[2],
      display_name: params[3],
      metadata_url: params[4],
      metadata_xml: params[5],
      oidc_discovery_url: params[6],
      oidc_client_id: params[7],
      attribute_mapping: JSON.parse(params[8] as string),
      created_by: params[9],
      is_active: false,
      domain_verification_token: params[10],
      domain_verified_at: null,
      clerk_connection_id: null,
      acs_url: null,
      sp_entity_id: null,
      sp_metadata_url: null,
      created_at: '2026-08-04T00:00:00.000Z',
      updated_at: '2026-08-04T00:00:00.000Z',
    };
    return [{ ...store.connection }];
  }

  if (text.startsWith('select') && text.includes('from sso_connections where id =')) {
    if (!store.connection || store.connection['id'] !== params[0]) return [];
    return [{ ...store.connection }];
  }

  if (text.startsWith('select') && text.includes('from sso_connections where organization_id =')) {
    const orgIds = Array.isArray(params[0]) ? (params[0] as string[]) : [params[0] as string];
    if (!store.connection || !orgIds.includes(store.connection['organization_id'] as string)) {
      return [];
    }
    return [{ ...store.connection }];
  }

  if (text.startsWith('update sso_connections set domain_verified_at = now()')) {
    store.connection = {
      ...store.connection,
      domain_verified_at: '2026-08-04T01:00:00.000Z',
      domain_verification_token: null,
    };
    return [{ ...store.connection }];
  }

  if (text.startsWith('update sso_connections set domain_verification_token =')) {
    store.connection = {
      ...store.connection,
      domain_verification_token: params[1],
      domain_verified_at: null,
    };
    return [{ ...store.connection }];
  }

  if (text.startsWith('update sso_connections set display_name =')) {
    const current = store.connection!;
    store.connection = {
      ...current,
      display_name: params[1],
      metadata_url: params[2],
      metadata_xml: params[3],
      oidc_discovery_url: params[4],
      oidc_client_id: params[5],
      attribute_mapping: JSON.parse(params[6] as string),
      clerk_connection_id: params[7] ?? current['clerk_connection_id'],
      acs_url: params[8] ?? current['acs_url'],
      sp_entity_id: params[9] ?? current['sp_entity_id'],
      sp_metadata_url: params[10] ?? current['sp_metadata_url'],
      is_active: params[11],
    };
    return [{ ...store.connection }];
  }

  throw new Error(`unexpected sql in test: ${text}`);
});

const mockExecute = vi.fn(async () => undefined);

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: [string, unknown[]?]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...(args as [])),
  })),
}));

import { DELETE, GET as LIST, POST } from '../route';
import { GET as GET_ONE, PATCH } from '../[id]/route';
import { POST as VERIFY, PUT as REISSUE } from '../verify-domain/route';

function req(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

const params = { params: Promise.resolve({ id: CONNECTION_ID }) };

async function createDraft() {
  const response = await POST(
    req('http://localhost/api/admin/sso', 'POST', {
      organization_id: ORG_ID,
      provider_type: 'saml',
      domain: 'example.com',
      display_name: 'Okta',
      metadata_url: METADATA_URL,
      attribute_mapping: { emailAddress: 'user.email' },
    }),
  );
  return response;
}

function publishCorrectTxt() {
  mockVerifyDomainOwnership.mockResolvedValue({ verified: true });
}

describe('SSO configuration round trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.connection = null;
    store.role = 'owner';
    store.roleByOrg = {};
    process.env['CLERK_SECRET_KEY'] = 'sk_test_fixture';
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'owner-user' });
    mockGetSubscription.mockResolvedValue({ plan_tier: 'enterprise', status: 'active' });
    mockCreateEnterpriseConnection.mockResolvedValue({
      id: 'ec_live_1',
      active: true,
      samlConnection: {
        acsUrl: 'https://accounts.example.com/v1/saml/acs/ec_live_1',
        spEntityId: 'https://accounts.example.com/saml/ec_live_1',
        spMetadataUrl: 'https://accounts.example.com/v1/saml/metadata/ec_live_1',
      },
    });
    mockUpdateEnterpriseConnection.mockResolvedValue({
      id: 'ec_live_1',
      active: false,
      samlConnection: null,
    });
  });

  it('creates a dormant draft and hands back the DNS challenge', async () => {
    const response = await createDraft();

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      connection: { status: string; isActive: boolean; domain: string };
      nextStep: string;
      domainVerification: { recordName: string; recordValue: string };
    };

    expect(body.connection.isActive).toBe(false);
    expect(body.connection.status).toBe('awaiting_domain_verification');
    expect(body.connection.domain).toBe('example.com');
    expect(body.nextStep).toBe('verify_domain');
    expect(body.domainVerification.recordName).toBe('_agiworkforce-sso.example.com');
    expect(body.domainVerification.recordValue).toMatch(
      /^agiworkforce-sso-verification=[a-f0-9]{32,64}$/,
    );

    expect(mockCreateEnterpriseConnection).not.toHaveBeenCalled();
  });

  it('refuses to activate a connection whose domain is unverified', async () => {
    await createDraft();

    const response = await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('DOMAIN_NOT_VERIFIED');
    expect(mockCreateEnterpriseConnection).not.toHaveBeenCalled();
    expect(store.connection!['is_active']).toBe(false);
  });

  it('does not verify a domain whose TXT record is absent', async () => {
    await createDraft();
    mockVerifyDomainOwnership.mockResolvedValue({ verified: false, reason: 'no_record' });

    const response = await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', {
        connectionId: CONNECTION_ID,
      }),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { verified: boolean; reason: string };
    expect(body.verified).toBe(false);
    expect(body.reason).toBe('no_record');
    expect(store.connection!['domain_verified_at']).toBeNull();
  });

  it('reports a resolver outage as retryable rather than as a missing record', async () => {
    await createDraft();
    mockVerifyDomainOwnership.mockResolvedValue({ verified: false, reason: 'lookup_failed' });

    const response = await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', {
        connectionId: CONNECTION_ID,
      }),
    );

    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe('lookup_failed');
  });

  it('verifies, provisions, activates, and returns the SP values the IdP needs', async () => {
    await createDraft();
    const issuedToken = store.connection!['domain_verification_token'] as string;
    publishCorrectTxt();

    const verified = await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', {
        connectionId: CONNECTION_ID,
      }),
    );
    expect(verified.status).toBe(200);
    const verifiedBody = (await verified.json()) as {
      verified: boolean;
      connection: { status: string; domainVerification: unknown };
    };
    expect(verifiedBody.verified).toBe(true);
    expect(mockVerifyDomainOwnership).toHaveBeenCalledWith('example.com', issuedToken);
    expect(verifiedBody.connection.status).toBe('awaiting_provider_configuration');
    expect(verifiedBody.connection.domainVerification).toBeNull();

    const activated = await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );

    expect(activated.status).toBe(200);
    const body = (await activated.json()) as {
      connection: {
        isActive: boolean;
        status: string;
        serviceProvider: { acsUrl: string; entityId: string; metadataUrl: string };
      };
    };

    expect(body.connection.isActive).toBe(true);
    expect(body.connection.status).toBe('active');
    expect(body.connection.serviceProvider).toEqual({
      acsUrl: 'https://accounts.example.com/v1/saml/acs/ec_live_1',
      entityId: 'https://accounts.example.com/saml/ec_live_1',
      metadataUrl: 'https://accounts.example.com/v1/saml/metadata/ec_live_1',
    });

    expect(mockCreateEnterpriseConnection).toHaveBeenCalledTimes(1);
    expect(mockCreateEnterpriseConnection).toHaveBeenCalledWith({
      name: 'Okta',
      domains: ['example.com'],
      active: true,
      syncUserAttributes: true,
      saml: {
        allowIdpInitiated: false,
        allowSubdomains: false,
        idpMetadataUrl: METADATA_URL,
        attributeMapping: { emailAddress: 'user.email' },
      },
    });
  });

  it('reads the connection back with its stored provider reference hidden', async () => {
    await createDraft();
    publishCorrectTxt();
    await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', { connectionId: CONNECTION_ID }),
    );
    await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );

    const response = await GET_ONE(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'GET'),
      params,
    );

    expect(response.status).toBe(200);
    const raw = await response.text();
    const connection = JSON.parse(raw).connection as Record<string, unknown>;
    expect(connection['status']).toBe('active');

    expect(connection).not.toHaveProperty('clerkConnectionId');
    expect(connection).not.toHaveProperty('clerk_connection_id');
    expect(raw).not.toContain('metadata_xml');
    expect(raw).not.toContain('domain_verification_token');
  });

  it('rotates SAML metadata on a live connection without recreating it', async () => {
    await createDraft();
    publishCorrectTxt();
    await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', { connectionId: CONNECTION_ID }),
    );
    await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );

    mockUpdateEnterpriseConnection.mockResolvedValue({
      id: 'ec_live_1',
      active: true,
      samlConnection: {
        acsUrl: 'https://accounts.example.com/v1/saml/acs/ec_live_1',
        spEntityId: 'https://accounts.example.com/saml/ec_live_1',
        spMetadataUrl: 'https://accounts.example.com/v1/saml/metadata/ec_live_1',
      },
    });

    const rotated = await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', {
        metadata_url: 'https://example.okta.com/app/abc/sso/saml/metadata-v2',
      }),
      params,
    );

    expect(rotated.status).toBe(200);
    expect((await rotated.json()).connection.metadataUrl).toBe(
      'https://example.okta.com/app/abc/sso/saml/metadata-v2',
    );
    expect(mockCreateEnterpriseConnection).toHaveBeenCalledTimes(1);
    expect(mockUpdateEnterpriseConnection).toHaveBeenCalledWith(
      'ec_live_1',
      expect.objectContaining({
        saml: expect.objectContaining({
          idpMetadataUrl: 'https://example.okta.com/app/abc/sso/saml/metadata-v2',
        }),
      }),
    );
  });

  it('mirrors the provider when deactivating rather than trusting the request', async () => {
    await createDraft();
    publishCorrectTxt();
    await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', { connectionId: CONNECTION_ID }),
    );
    await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );

    const response = await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: false }),
      params,
    );

    expect(response.status).toBe(200);
    expect((await response.json()).connection.isActive).toBe(false);
    expect(mockUpdateEnterpriseConnection).toHaveBeenCalledWith('ec_live_1', { active: false });
  });

  it('reports an unentitled Clerk instance honestly instead of claiming success', async () => {
    await createDraft();
    publishCorrectTxt();
    await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', { connectionId: CONNECTION_ID }),
    );

    const notEntitled = Object.assign(new Error('Payment required'), { status: 402 });
    mockCreateEnterpriseConnection.mockRejectedValue(notEntitled);

    const response = await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.code).toBe('not_entitled');
    expect(body.error).toMatch(/Enhanced Authentication add-on/);
    expect(store.connection!['is_active']).toBe(false);
    expect(store.connection!['clerk_connection_id']).toBeNull();
  });

  it('reports a missing Clerk credential as unprovisioned, not as a server fault', async () => {
    delete process.env['CLERK_SECRET_KEY'];
    await createDraft();
    publishCorrectTxt();
    await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', { connectionId: CONNECTION_ID }),
    );

    const response = await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('missing_credentials');
    process.env['CLERK_SECRET_KEY'] = 'sk_test_fixture';
  });

  it('refuses to reissue a challenge for a live connection', async () => {
    await createDraft();
    publishCorrectTxt();
    await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', { connectionId: CONNECTION_ID }),
    );
    await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );

    const response = await REISSUE(
      req('http://localhost/api/admin/sso/verify-domain', 'PUT', { connectionId: CONNECTION_ID }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('CONNECTION_ACTIVE');
  });

  it('reissues a fresh challenge for a dormant connection', async () => {
    await createDraft();
    const original = store.connection!['domain_verification_token'];

    const response = await REISSUE(
      req('http://localhost/api/admin/sso/verify-domain', 'PUT', { connectionId: CONNECTION_ID }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { domainVerification: { recordValue: string } };
    expect(body.domainVerification.recordValue).not.toContain(original as string);
    expect(store.connection!['domain_verified_at']).toBeNull();
  });

  it('tears the connection down at the provider before removing the local row', async () => {
    await createDraft();
    publishCorrectTxt();
    await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', { connectionId: CONNECTION_ID }),
    );
    await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );

    const response = await DELETE(
      req(`http://localhost/api/admin/sso?id=${CONNECTION_ID}&hard=true`, 'DELETE'),
    );

    expect(response.status).toBe(200);
    expect(mockDeleteEnterpriseConnection).toHaveBeenCalledWith('ec_live_1');
    expect(mockExecute).toHaveBeenCalledWith('delete from sso_connections where id = $1', [
      CONNECTION_ID,
    ]);
  });

  it('leaves the local row alone when the provider teardown fails', async () => {
    await createDraft();
    publishCorrectTxt();
    await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', { connectionId: CONNECTION_ID }),
    );
    await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );

    mockDeleteEnterpriseConnection.mockRejectedValue(
      Object.assign(new Error('boom'), { status: 500 }),
    );

    const response = await DELETE(
      req(`http://localhost/api/admin/sso?id=${CONNECTION_ID}&hard=true`, 'DELETE'),
    );

    expect(response.status).toBe(502);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe('SSO authorization within an entitled organization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.connection = null;
    store.role = 'owner';
    store.roleByOrg = {};
    process.env['CLERK_SECRET_KEY'] = 'sk_test_fixture';
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'some-user' });
    mockGetSubscription.mockResolvedValue({ plan_tier: 'enterprise', status: 'active' });
  });

  it.each(['admin', 'member', 'viewer'])(
    'refuses connection creation to an org %s',
    async (role) => {
      store.role = role;

      const response = await createDraft();

      expect(response.status).toBe(403);
      expect(store.connection).toBeNull();
    },
  );

  it('refuses a non-member of the organization entirely', async () => {
    store.role = null;

    const response = await createDraft();

    expect(response.status).toBe(403);
  });

  it('does not let an owner of a different organization read a connection', async () => {
    store.role = 'owner';
    await createDraft();

    store.roleByOrg = { [ORG_ID]: '', [OTHER_ORG_ID]: 'owner' };
    store.role = null;

    const response = await GET_ONE(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'GET'),
      params,
    );

    expect(response.status).toBe(403);
  });

  it('lets an org admin read but not modify', async () => {
    store.role = 'owner';
    await createDraft();
    store.role = 'admin';

    const read = await GET_ONE(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'GET'),
      params,
    );
    expect(read.status).toBe(200);

    const write = await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { display_name: 'x' }),
      params,
    );
    expect(write.status).toBe(403);
  });

  it('lists connections for an entitled owner', async () => {
    store.role = 'owner';
    await createDraft();

    const response = await LIST(req('http://localhost/api/admin/sso', 'GET'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { connections: Array<{ domain: string }> };
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0]!.domain).toBe('example.com');
  });
});
