import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockGetSubscription, mockCreateEnterpriseConnection } = vi.hoisted(
  () => ({
    mockQuery: vi.fn(),
    mockExecute: vi.fn(),
    mockGetSubscription: vi.fn(),
    mockCreateEnterpriseConnection: vi.fn(),
  }),
);

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
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: vi.fn(async () => ({ userId: 'owner' })) }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: (...args: unknown[]) => mockGetSubscription(...args) },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  })),
}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    enterpriseConnections: {
      createEnterpriseConnection: mockCreateEnterpriseConnection,
      updateEnterpriseConnection: vi.fn(),
      deleteEnterpriseConnection: vi.fn(),
    },
  }),
}));

import { POST } from '../route';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/admin/sso', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  );
}

function base(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: ORG_ID,
    provider_type: 'saml',
    domain: 'example.com',
    metadata_url: 'https://idp.example.com/metadata',
    ...overrides,
  };
}

describe('SSO create rejects hostile identity-provider input', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubscription.mockResolvedValue({ plan_tier: 'enterprise', status: 'active' });
    mockQuery.mockResolvedValue([{ role: 'owner' }]);
    mockExecute.mockResolvedValue(undefined);
  });

  function expectNothingPersisted() {
    const wrote = mockQuery.mock.calls.some(([sql]) =>
      String(sql).toLowerCase().includes('insert into sso_connections'),
    );
    expect(wrote).toBe(false);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockCreateEnterpriseConnection).not.toHaveBeenCalled();
  }

  describe('SSRF via metadata_url', () => {
    it.each([
      ['loopback', 'https://127.0.0.1/metadata'],
      ['loopback name', 'https://localhost/metadata'],
      ['aws/gcp metadata service', 'https://169.254.169.254/latest/meta-data/iam/'],
      ['gcp metadata name', 'https://metadata.google.internal/computeMetadata/v1/'],
      ['rfc1918', 'https://10.0.0.7/metadata'],
      ['ipv6 loopback', 'https://[::1]/metadata'],
      ['internal tld', 'https://vault.internal/metadata'],
      ['plaintext http', 'http://idp.example.com/metadata'],
      ['file scheme', 'file:///etc/passwd'],
      ['embedded credentials', 'https://a:b@idp.example.com/metadata'],
      ['non-standard port', 'https://idp.example.com:2379/metadata'],
    ])('refuses %s', async (_label, metadata_url) => {
      const response = await post(base({ metadata_url }));

      expect(response.status).toBe(400);
      expect((await response.json()).field).toBe('metadata_url');
      expectNothingPersisted();
    });
  });

  describe('XML attacks via metadata_xml', () => {
    it('refuses an XXE payload', async () => {
      const response = await post(
        base({
          metadata_url: undefined,
          metadata_xml:
            '<!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><EntityDescriptor>&xxe;</EntityDescriptor>',
        }),
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/DOCTYPE/);
      expectNothingPersisted();
    });

    it('refuses a billion-laughs style entity bomb', async () => {
      const response = await post(
        base({
          metadata_url: undefined,
          metadata_xml:
            '<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]><EntityDescriptor>&lol2;</EntityDescriptor>',
        }),
      );

      expect(response.status).toBe(400);
      expectNothingPersisted();
    });

    it('refuses a document that is not SAML metadata', async () => {
      const response = await post(
        base({ metadata_url: undefined, metadata_xml: '<html><script>x</script></html>' }),
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/EntityDescriptor/);
      expectNothingPersisted();
    });

    it('refuses an oversized document', async () => {
      const response = await post(
        base({
          metadata_url: undefined,
          metadata_xml: `<EntityDescriptor>${'a'.repeat(600_000)}</EntityDescriptor>`,
        }),
      );

      expect(response.status).toBe(400);
      expectNothingPersisted();
    });
  });

  describe('domain hijack', () => {
    it.each(['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'proton.me'])(
      'refuses to let a tenant claim the public mailbox domain %s',
      async (domain) => {
        const response = await post(base({ domain }));

        expect(response.status).toBe(400);
        expect((await response.json()).error).toMatch(/public mailbox provider/);
        expectNothingPersisted();
      },
    );

    it.each(['localhost', 'not a domain', '-leading-hyphen.com', 'single'])(
      'refuses the malformed domain %s',
      async (domain) => {
        const response = await post(base({ domain }));

        expect(response.status).toBe(400);
        expectNothingPersisted();
      },
    );
  });

  describe('attribute mapping', () => {
    it('refuses an unknown attribute key', async () => {
      const response = await post(base({ attribute_mapping: { isAdmin: 'user.admin' } }));

      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/isAdmin/);
      expectNothingPersisted();
    });

    it('refuses a prototype-pollution key', async () => {
      const response = await post({
        ...base(),
        attribute_mapping: JSON.parse('{"__proto__": "polluted"}'),
      });

      expect(response.status).toBe(400);
      expectNothingPersisted();
    });

    it('refuses an unbounded mapping', async () => {
      const many: Record<string, string> = {};
      for (let i = 0; i < 500; i += 1) many[`k${i}`] = 'v';

      const response = await post(base({ attribute_mapping: many }));

      expect(response.status).toBe(400);
      expectNothingPersisted();
    });
  });

  describe('payload shape', () => {
    it('refuses unknown top-level fields rather than ignoring them', async () => {
      const response = await post(base({ is_active: true, clerk_connection_id: 'ec_attacker' }));

      expect(response.status).toBe(400);
      expectNothingPersisted();
    });

    it('refuses a SAML connection that carries OIDC credentials', async () => {
      const response = await post(
        base({ oidc_client_id: 'abc', oidc_discovery_url: 'https://idp.example.com/.well-known' }),
      );

      expect(response.status).toBe(400);
      expectNothingPersisted();
    });

    it('refuses an OIDC connection that carries SAML metadata', async () => {
      const response = await post(
        base({ provider_type: 'oidc', metadata_url: 'https://idp.example.com/metadata' }),
      );

      expect(response.status).toBe(400);
      expectNothingPersisted();
    });

    it('refuses a SAML connection with no metadata at all', async () => {
      const response = await post(base({ metadata_url: undefined }));

      expect(response.status).toBe(400);
      expectNothingPersisted();
    });

    it('refuses an OIDC connection missing its discovery URL', async () => {
      const response = await post(
        base({ provider_type: 'oidc', metadata_url: undefined, oidc_client_id: 'abc' }),
      );

      expect(response.status).toBe(400);
      expectNothingPersisted();
    });

    it('refuses a non-uuid organization id', async () => {
      const response = await post(base({ organization_id: "1' or '1'='1" }));

      expect(response.status).toBe(400);
      expectNothingPersisted();
    });

    it('refuses a malformed JSON body', async () => {
      const response = await POST(
        new Request('http://localhost/api/admin/sso', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{not json',
        }) as never,
      );

      expect(response.status).toBe(400);
      expectNothingPersisted();
    });
  });

  it('accepts a well-formed payload, proving the suite is not rejecting everything', async () => {
    mockQuery.mockResolvedValueOnce([{ role: 'owner' }]).mockResolvedValueOnce([
      {
        id: '22222222-2222-4222-8222-222222222222',
        organization_id: ORG_ID,
        provider_type: 'saml',
        domain: 'example.com',
        display_name: null,
        metadata_url: 'https://idp.example.com/metadata',
        oidc_discovery_url: null,
        oidc_client_id: null,
        clerk_connection_id: null,
        acs_url: null,
        sp_entity_id: null,
        sp_metadata_url: null,
        domain_verified_at: null,
        domain_verification_token: 'a'.repeat(48),
        attribute_mapping: { emailAddress: 'user.email' },
        is_active: false,
        created_by: 'owner',
        created_at: '2026-08-04T00:00:00.000Z',
        updated_at: '2026-08-04T00:00:00.000Z',
      },
    ]);

    const response = await post(base({ attribute_mapping: { emailAddress: 'user.email' } }));

    expect(response.status).toBe(201);
    expect((await response.json()).connection.isActive).toBe(false);
    expect(mockCreateEnterpriseConnection).not.toHaveBeenCalled();
  });
});
