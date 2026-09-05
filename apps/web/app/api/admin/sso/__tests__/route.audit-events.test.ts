import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockGetSubscription,
  mockGetClerkAuthUser,
  mockVerifyDomainOwnership,
  mockCreateEnterpriseConnection,
  mockUpdateEnterpriseConnection,
  mockDeleteEnterpriseConnection,
  mockRecordAuditEvent,
} = vi.hoisted(() => ({
  mockGetSubscription: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
  mockVerifyDomainOwnership: vi.fn(),
  mockCreateEnterpriseConnection: vi.fn(),
  mockUpdateEnterpriseConnection: vi.fn(),
  mockDeleteEnterpriseConnection: vi.fn(),
  mockRecordAuditEvent: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: vi.fn(async () => undefined),
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
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
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const METADATA_URL = 'https://example.okta.com/app/abc/sso/saml/metadata';

type Row = Record<string, unknown>;

const store = {
  connection: null as Row | null,
  role: 'owner' as string | null,
};

const mockQuery = vi.fn(async (sql: string, params: unknown[] = []): Promise<Row[]> => {
  const text = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  if (text.startsWith('select role from organization_members')) {
    return store.role ? [{ role: store.role }] : [];
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

  if (text.startsWith('update sso_connections set domain_verified_at = now()')) {
    store.connection = {
      ...store.connection,
      domain_verified_at: '2026-08-04T01:00:00.000Z',
      domain_verification_token: null,
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

import { DELETE, POST } from '../route';
import { PATCH } from '../[id]/route';
import { POST as VERIFY } from '../verify-domain/route';

function req(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

const params = { params: Promise.resolve({ id: CONNECTION_ID }) };

async function createDraft() {
  return POST(
    req('http://localhost/api/admin/sso', 'POST', {
      organization_id: ORG_ID,
      provider_type: 'saml',
      domain: 'example.com',
      display_name: 'Okta',
      metadata_url: METADATA_URL,
      attribute_mapping: { emailAddress: 'user.email' },
    }),
  );
}

function auditEventTypes() {
  return mockRecordAuditEvent.mock.calls.map(
    (call) => (call[0] as { eventType: string }).eventType,
  );
}

describe('SSO connection audit trail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.connection = null;
    store.role = 'owner';
    process.env['CLERK_SECRET_KEY'] = 'sk_test_fixture';
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'owner-user' });
    mockGetSubscription.mockResolvedValue({ plan_tier: 'enterprise', status: 'active' });
    mockVerifyDomainOwnership.mockResolvedValue({ verified: true });
    mockCreateEnterpriseConnection.mockResolvedValue({
      id: 'ec_live_1',
      active: true,
      samlConnection: {
        acsUrl: 'https://accounts.example.com/v1/saml/acs/ec_live_1',
        spEntityId: 'https://accounts.example.com/saml/ec_live_1',
        spMetadataUrl: 'https://accounts.example.com/v1/saml/metadata/ec_live_1',
      },
    });
    mockUpdateEnterpriseConnection.mockImplementation(
      async (_id: string, connectionParams: { active: boolean }) => ({
        id: 'ec_live_1',
        active: connectionParams.active,
        samlConnection: connectionParams.active
          ? {
              acsUrl: 'https://accounts.example.com/v1/saml/acs/ec_live_1',
              spEntityId: 'https://accounts.example.com/saml/ec_live_1',
              spMetadataUrl: 'https://accounts.example.com/v1/saml/metadata/ec_live_1',
            }
          : null,
      }),
    );
  });

  it('records sso_connection_created with the connection id, domain and organization', async () => {
    await createDraft();

    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-user',
        eventType: 'sso_connection_created',
        organizationId: ORG_ID,
        detail: expect.objectContaining({
          resourceType: 'sso_connection',
          resourceId: CONNECTION_ID,
          resourceName: 'example.com',
          source: 'saml',
        }),
      }),
    );
  });

  it('records sso_connection_activated when a verified connection is turned on', async () => {
    await createDraft();
    await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', { connectionId: CONNECTION_ID }),
    );
    mockRecordAuditEvent.mockClear();

    await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'sso_connection_activated',
        organizationId: ORG_ID,
        severity: 'warning',
        detail: expect.objectContaining({
          resourceId: CONNECTION_ID,
          resourceName: 'example.com',
          status: 'active',
        }),
      }),
    );
  });

  it('records sso_connection_updated for a config edit that does not touch is_active', async () => {
    await createDraft();
    await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', { connectionId: CONNECTION_ID }),
    );
    await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );
    mockRecordAuditEvent.mockClear();

    await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', {
        display_name: 'Okta (renamed)',
      }),
      params,
    );

    expect(auditEventTypes()).toEqual(['sso_connection_updated']);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warning' }),
    );
  });

  it('records sso_connection_deactivated when an active connection is turned off', async () => {
    await createDraft();
    await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', { connectionId: CONNECTION_ID }),
    );
    await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );
    mockRecordAuditEvent.mockClear();

    await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: false }),
      params,
    );

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'sso_connection_deactivated',
        severity: 'critical',
        detail: expect.objectContaining({ status: 'inactive' }),
      }),
    );
  });

  it('records sso_connection_deactivated on a soft DELETE', async () => {
    await createDraft();
    mockRecordAuditEvent.mockClear();

    const response = await DELETE(
      req(`http://localhost/api/admin/sso?id=${CONNECTION_ID}`, 'DELETE'),
    );

    expect(response.status).toBe(200);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'sso_connection_deactivated',
        organizationId: ORG_ID,
        severity: 'critical',
        detail: expect.objectContaining({ resourceId: CONNECTION_ID, resourceName: 'example.com' }),
      }),
    );
  });

  it('records sso_connection_deleted on a hard DELETE', async () => {
    await createDraft();
    await VERIFY(
      req('http://localhost/api/admin/sso/verify-domain', 'POST', { connectionId: CONNECTION_ID }),
    );
    await PATCH(
      req(`http://localhost/api/admin/sso/${CONNECTION_ID}`, 'PATCH', { is_active: true }),
      params,
    );
    mockRecordAuditEvent.mockClear();

    const response = await DELETE(
      req(`http://localhost/api/admin/sso?id=${CONNECTION_ID}&hard=true`, 'DELETE'),
    );

    expect(response.status).toBe(200);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'sso_connection_deleted',
        organizationId: ORG_ID,
        severity: 'critical',
      }),
    );
  });
});
