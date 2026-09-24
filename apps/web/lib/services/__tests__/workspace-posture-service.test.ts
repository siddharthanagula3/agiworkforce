import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/server/db-pool-tuning', () => ({ SERVICE_POOL_TUNING: {} }));
vi.mock('@/lib/server/db-connection-error', () => ({
  reportDatabaseConnectionError: vi.fn(),
}));

const entitlement = vi.hoisted(() => ({ plan: 'team' as string }));
vi.mock('@/lib/services/org-entitlements', () => ({
  resolveOrganizationEntitlementPlan: vi.fn(async () => entitlement.plan),
}));

import { X509Certificate } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { AUDIT_STREAM_CONTINUITY_ALERT_MINUTES } from '../audit-streaming-service';
import {
  CERTIFICATE_ATTENTION_DAYS,
  MIN_RECOMMENDED_OWNERS,
  readWorkspacePosture,
  type PostureSignal,
} from '../workspace-posture-service';

const ORG = '11111111-1111-4111-8111-111111111111';

/**
 * A self-signed certificate, as an identity provider publishes it inside its
 * SAML metadata: base64 DER, public half only. Every expiry assertion below
 * moves the clock relative to this certificate's own notAfter rather than
 * naming a date, so the fixture never expires out from under the suite.
 */
const IDP_CERTIFICATE_DER =
  'MIIDFzCCAf+gAwIBAgIUV9/JaOgVPSBHmRF1JBs96f3TXycwDQYJKoZIhvcNAQELBQAwGzEZMBcGA1UEAwwQaWRw' +
  'LmV4YW1wbGUudGVzdDAeFw0yNjA5MjExNjU4MjlaFw0zNjA5MTgxNjU4MjlaMBsxGTAXBgNVBAMMEGlkcC5leGFt' +
  'cGxlLnRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC/L/EwTJX3X6T+2H74tBO/iC0TSYo7902e' +
  'iVUgzZpDsQMlpLRcnx7ULlYz9vfEzBJ9UjdZFsa69iAt5OEAuqZpXN9uZmbehsjsCQe7j12sHZcfNSii49PvHRTl' +
  'WWCROqRdA/RzUBnqU3jWXIR5T9jpr1pPXiI2W4JI41KC7jBTMw0VGIMidj/dio8fDKH5D2K7LOWwjd1NCovRw4Y4' +
  'IdejcDnpxEQl/NYxlCOAZl1oquiG3+mwaMuZRVHTjC0mFX4Yh2XO7cUlwb8MWuVpQZ/OPQCQNc3SR3D8L+KKDCn8' +
  'YE73a6Pqt36XWwuy5OLERixYMtJekllKmaviUcasKhgHAgMBAAGjUzBRMB0GA1UdDgQWBBQXds4mcYI4flmx5IRK' +
  'vtWLgCrqoTAfBgNVHSMEGDAWgBQXds4mcYI4flmx5IRKvtWLgCrqoTAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3' +
  'DQEBCwUAA4IBAQAQ55Z/GOJ37eQxSnEAqBTLSPhfIGXhvdiv0jaERswlATvvar4tbYZ5a4lBVdG+Uve7bwbKPpOe' +
  'FE/HZ7lLQMFgskwIXxuw4s3QpEdQWrP8gqyZzbYVgcdypTTHEtvUkP2ABNkrfbf+58MpUaa+2ZzdFFPkKjeFY6bN' +
  'Yvg7gHN2hOtPdcoZyPYGcPWmjFX4DEOODAAqa1c/5zULMnvmAUJFx1Wrg9HcXy5IG0+0jd1ZkyYoaa1/zCRTh7Wa' +
  'jaQ5I2irkpElal9fYvQefIwGktWpmw4EvM4eiTjzei5pnWV2iwFXCcQkJABnNi1dB0zAHol5eO8bVz34nrecBh1/' +
  'ed08';

const CERTIFICATE_EXPIRES_AT = new Date(
  new X509Certificate(Buffer.from(IDP_CERTIFICATE_DER, 'base64')).validTo,
).getTime();

const DAY_MS = 24 * 60 * 60 * 1000;

function samlMetadata(certificate: string): string {
  return [
    '<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">',
    '<md:IDPSSODescriptor><md:KeyDescriptor use="signing"><ds:KeyInfo>',
    `<ds:X509Data><ds:X509Certificate>${certificate}</ds:X509Certificate></ds:X509Data>`,
    '</ds:KeyInfo></md:KeyDescriptor></md:IDPSSODescriptor></md:EntityDescriptor>',
  ].join('');
}

function samlConnection(metadataXml: string | null) {
  return {
    domain: 'acme.test',
    provider_type: 'saml',
    is_active: true,
    domain_verified_at: '2026-08-01T00:00:00.000Z',
    clerk_connection_id: 'conn_1',
    metadata_xml: metadataXml,
  };
}

interface Fixture {
  roles?: { role: string; count: number }[];
  invitations?: number;
  sso?: {
    domain: string;
    provider_type: string;
    is_active: boolean;
    domain_verified_at: string | null;
    clerk_connection_id: string | null;
    metadata_xml?: string | null;
  }[];
  directory?: { provider: string; is_active: boolean; last_sync_at: string | null }[];
  scimTokens?: number;
  scimUsers?: number;
  scimGroups?: number;
  syncErrors?: number;
  sharedProjects?: number;
  sharedConnectors?: number;
  auditEvents?: number;
  activeHolds?: number;
  modelRules?: [number, number, number, number] | null;
  connectorRules?: [number, number, boolean] | null;
  spendLimit?: { cap: number; enforcement: string } | null;
  auditDestination?: { enabled: boolean; failures: number } | null;
  streamBacklog?: { buffered: number; oldestUndeliveredAt: string } | null;
  policyRow?: Record<string, unknown> | null;
  org?: { name: string | null; licensed_seats: number | null; seats_consumed: number | null };
  encryptionKey?: Record<string, unknown> | null;
  region?: { data_region: string | null; data_region_requested: string | null };
}

/**
 * Routes each query by the table it names. The service issues them in one
 * Promise.all, so matching on order would break the moment a query is added.
 */
function harness(fixture: Fixture = {}) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    const text = String(sql);
    const count = (n: number | undefined) => [{ count: n ?? 0 }];

    if (text.includes('from public.organizations')) {
      if (text.includes('data_region')) {
        return [
          {
            data_region: fixture.region?.data_region ?? null,
            data_region_requested: fixture.region?.data_region_requested ?? null,
            data_region_requested_at: null,
          },
        ];
      }
      return [fixture.org ?? { name: 'Acme', licensed_seats: 25, seats_consumed: 4 }];
    }
    if (text.includes('from public.organization_encryption_keys')) {
      return fixture.encryptionKey ? [fixture.encryptionKey] : [];
    }
    if (text.includes('from public.organization_members')) {
      return (
        fixture.roles ?? [
          { role: 'owner', count: 1 },
          { role: 'member', count: 3 },
        ]
      );
    }
    if (text.includes('from public.organization_invitations')) return count(fixture.invitations);
    if (text.includes('from public.sso_connections')) {
      return (fixture.sso ?? []).map((row) => ({ metadata_xml: null, ...row }));
    }
    if (text.includes('from public.directory_sync_connections')) return fixture.directory ?? [];
    if (text.includes('from public.scim_tokens')) return count(fixture.scimTokens);
    if (text.includes('from public.scim_provisioned_users')) return count(fixture.scimUsers);
    if (text.includes('from public.scim_groups')) return count(fixture.scimGroups);
    if (text.includes('from public.directory_sync_events')) return count(fixture.syncErrors);
    if (text.includes('from public.organization_shared_projects'))
      return count(fixture.sharedProjects);
    if (text.includes('from public.organization_shared_connectors'))
      return count(fixture.sharedConnectors);
    if (text.includes('from public.enterprise_audit_events')) return count(fixture.auditEvents);
    if (text.includes('from public.legal_holds')) return count(fixture.activeHolds);
    if (text.includes('from public.organization_audit_destinations')) {
      const a = fixture.auditDestination;
      if (a === undefined || a === null) return [];
      if (text.includes('count(e.id)')) {
        const backlog = fixture.streamBacklog;
        if (!backlog) return [];
        return [
          {
            organization_id: ORG,
            buffered: backlog.buffered,
            oldest_undelivered_at: backlog.oldestUndeliveredAt,
            consecutive_failures: a.failures,
          },
        ];
      }
      return [{ enabled: a.enabled, consecutive_failures: a.failures, last_delivered_at: null }];
    }
    if (text.includes('from public.organization_spend_limits')) {
      const l = fixture.spendLimit;
      if (l === undefined || l === null) return [];
      return [{ monthly_cap_cents: l.cap, enforcement: l.enforcement }];
    }
    if (text.includes('from public.organization_connector_policies')) {
      const c = fixture.connectorRules;
      if (c === undefined || c === null) return [];
      return [
        { allowed_connectors: c[0], blocked_connectors: c[1], allow_custom_connectors: c[2] },
      ];
    }
    if (text.includes('from public.organization_model_policies')) {
      const r = fixture.modelRules;
      if (r === undefined || r === null) return [];
      return [
        {
          allowed_providers: r[0],
          blocked_providers: r[1],
          allowed_models: r[2],
          blocked_models: r[3],
        },
      ];
    }
    if (text.includes('from public.organization_admin_policies')) {
      return fixture.policyRow ? [fixture.policyRow] : [];
    }
    throw new Error(`unmapped query: ${text.slice(0, 90)}`);
  });

  return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, query };
}

function allSignals(groups: { signals: PostureSignal[] }[]): PostureSignal[] {
  return groups.flatMap((group) => group.signals);
}

function signal(groups: { signals: PostureSignal[] }[], id: string): PostureSignal {
  const found = allSignals(groups).find((s) => s.id === id);
  if (!found) throw new Error(`no signal ${id}`);
  return found;
}

describe('readWorkspacePosture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entitlement.plan = 'team';
  });

  it('binds every query to the organization it was asked about', async () => {
    const h = harness();
    await readWorkspacePosture(h.db, ORG);

    expect(h.query).toHaveBeenCalled();
    for (const [, params] of h.query.mock.calls) {
      expect(params).toEqual([ORG]);
    }
  });

  it('never labels a recorded-but-unenforced value as enforced', async () => {
    // The failure this guards is the one a security review exists to catch: a
    // dashboard that renders a stored number as a control. retentionDays is
    // swept by nothing, and per-surface sync reads a client-supplied hint.
    const h = harness();
    const posture = await readWorkspacePosture(h.db, ORG);

    expect(signal(posture.groups, 'retention').enforcement).toBe('stated');
    expect(signal(posture.groups, 'sync-surfaces').enforcement).toBe('stated');
  });

  it('reports capabilities the tree does not have as unavailable, not as off', async () => {
    const h = harness();
    const posture = await readWorkspacePosture(h.db, ORG);

    for (const id of ['sso-required']) {
      const s = signal(posture.groups, id);
      expect(s.value).toBe('Not available');
      expect(s.enforcement).toBe('unconfigured');
    }
  });

  it('describes outcomes and next actions without exposing implementation internals', async () => {
    const posture = await readWorkspacePosture(harness().db, ORG);
    const details = posture.groups.flatMap((group) => group.signals.map((entry) => entry.detail));

    for (const detail of details) {
      expect(detail).not.toMatch(
        /billing webhook|database|policy row|managed-compute routes|server-side|saved row|row-level security|security-definer|direct INSERT/i,
      );
    }
  });

  it('promotes retention to enforced once the workspace opts in', async () => {
    // The badge must follow the workspace, not a constant. Before 0138 this
    // signal was hardcoded to "stated"; a workspace that turns the sweep on has
    // a control, and one that has not still only has a position.
    const h = harness({
      policyRow: {
        organization_id: ORG,
        default_privacy_mode: 'byok',
        allowed_privacy_modes: ['local', 'byok'],
        allow_managed_compute: false,
        require_local_to_byok_preview: true,
        chat_sync_surfaces: ['web'],
        allow_cli_cloud_sync: false,
        allow_vscode_cloud_sync: false,
        allow_chrome_cloud_sync: false,
        audit_export_enabled: true,
        retention_days: 90,
        retention_enforced: true,
        metadata: {},
        updated_at: '2026-08-23T00:00:00.000Z',
      },
    });
    const posture = await readWorkspacePosture(h.db, ORG);
    const retention = signal(posture.groups, 'retention');

    expect(retention.enforcement).toBe('enforced');
    expect(retention.value).toBe('90 days, enforced');
    expect(retention.state).toBe('ok');
  });

  it('says a plan-required window is not yet enforced rather than implying it is', async () => {
    // The commitment is contractual on that plan, so the gap between what is
    // sold and what the sweep deletes against has to be visible, not smoothed.
    entitlement.plan = 'enterprise';
    const h = harness({
      policyRow: {
        organization_id: ORG,
        default_privacy_mode: 'byok',
        allowed_privacy_modes: ['local', 'byok'],
        allow_managed_compute: false,
        require_local_to_byok_preview: true,
        chat_sync_surfaces: ['web'],
        allow_cli_cloud_sync: false,
        allow_vscode_cloud_sync: false,
        allow_chrome_cloud_sync: false,
        audit_export_enabled: true,
        retention_days: 30,
        retention_enforced: false,
        metadata: {},
        updated_at: '2026-08-23T00:00:00.000Z',
      },
    });
    const retention = signal((await readWorkspacePosture(h.db, ORG)).groups, 'retention');

    expect(retention.value).toBe('30 days, required by your plan and not yet enforced');
    expect(retention.state).toBe('attention');
    expect(retention.enforcement).toBe('stated');
    expect(retention.detail).toContain('not a preference');
  });

  it('says plainly when a legal hold is suspending retention', async () => {
    const h = harness({ activeHolds: 2 });
    const hold = signal((await readWorkspacePosture(h.db, ORG)).groups, 'legal-hold');

    expect(hold.value).toBe('2 holds active');
    expect(hold.state).toBe('attention');
    expect(hold.enforcement).toBe('enforced');
  });

  it('reports public sharing from the workspace policy, not as unavailable', async () => {
    const h = harness();
    const s = signal((await readWorkspacePosture(h.db, ORG)).groups, 'external-sharing');

    expect(s.enforcement).toBe('enforced');
    expect(['Allowed', 'Blocked']).toContain(s.value);
  });

  it('flags a SIEM destination that is failing rather than reporting it as delivering', async () => {
    const h = harness({ auditDestination: { enabled: true, failures: 5 } });
    const s = signal((await readWorkspacePosture(h.db, ORG)).groups, 'siem');

    expect(s.value).toBe('Failing (5 in a row)');
    expect(s.state).toBe('attention');
  });

  it('reports a healthy SIEM destination as delivering', async () => {
    const h = harness({ auditDestination: { enabled: true, failures: 0 } });
    const s = signal((await readWorkspacePosture(h.db, ORG)).groups, 'siem');

    expect(s.value).toBe('Delivering');
    expect(s.enforcement).toBe('enforced');
  });

  it('does not call a silent receiver healthy just because nothing errored', async () => {
    // A receiver that accepts the connection and files nothing leaves the
    // failure counter at zero while the trail stops being current.
    const h = harness({
      auditDestination: { enabled: true, failures: 0 },
      streamBacklog: {
        buffered: 240,
        oldestUndeliveredAt: new Date(
          Date.now() - (AUDIT_STREAM_CONTINUITY_ALERT_MINUTES + 5) * 60_000,
        ).toISOString(),
      },
    });
    const s = signal((await readWorkspacePosture(h.db, ORG)).groups, 'siem');

    expect(s.state).toBe('attention');
    expect(s.value).toMatch(/^Behind by /);
    expect(s.detail).toContain('240 events are held');
    expect(s.detail).toMatch(/Nothing is lost/);
  });

  it('leaves a destination inside the alerting window as delivering', async () => {
    const h = harness({
      auditDestination: { enabled: true, failures: 0 },
      streamBacklog: {
        buffered: 3,
        oldestUndeliveredAt: new Date(
          Date.now() - (AUDIT_STREAM_CONTINUITY_ALERT_MINUTES - 5) * 60_000,
        ).toISOString(),
      },
    });
    const s = signal((await readWorkspacePosture(h.db, ORG)).groups, 'siem');

    expect(s.value).toBe('Delivering');
    expect(s.state).toBe('ok');
  });

  it('does not call a notify-only spend cap an enforced control', async () => {
    // notify reports a crossing and refuses nothing. Badging it as enforced
    // would tell a finance owner their budget binds when it does not.
    const h = harness({ spendLimit: { cap: 50_000, enforcement: 'notify' } });
    const s = signal((await readWorkspacePosture(h.db, ORG)).groups, 'spend-limit');

    expect(s.enforcement).toBe('stated');
    expect(s.value).toContain('notify');
  });

  it('reports a blocking spend cap as enforced, and says it is eventual', async () => {
    const h = harness({ spendLimit: { cap: 50_000, enforcement: 'block' } });
    const s = signal((await readWorkspacePosture(h.db, ORG)).groups, 'spend-limit');

    expect(s.enforcement).toBe('enforced');
    expect(s.value).toBe('$500.00 a month, enforced');
    expect(s.detail).toMatch(/eventual rather than exact/i);
  });

  it('flags an uncapped workspace rather than staying silent about it', async () => {
    const h = harness({ spendLimit: null });
    const s = signal((await readWorkspacePosture(h.db, ORG)).groups, 'spend-limit');

    expect(s.value).toBe('None');
    expect(s.state).toBe('attention');
  });

  it('counts switching off custom connectors as a restriction', async () => {
    // Blocking arbitrary member-supplied MCP endpoints is a real control even
    // when no individual connector is named.
    const h = harness({ connectorRules: [0, 0, false] });
    const s = signal((await readWorkspacePosture(h.db, ORG)).groups, 'connector-policy');

    expect(s.enforcement).toBe('enforced');
    expect(s.value).toBe('1 rule in force');
  });

  it('does not call a permissive connector policy a restriction', async () => {
    const h = harness({ connectorRules: [0, 0, true] });
    const s = signal((await readWorkspacePosture(h.db, ORG)).groups, 'connector-policy');

    expect(s.value).toBe('All connectors available');
    expect(s.enforcement).toBe('unconfigured');
  });

  it('does not call an empty model policy a restriction', async () => {
    // A saved row of four empty lists governs nothing. Reporting it as
    // "policy saved" would put an enforced badge on a control that denies
    // nothing.
    const h = harness({ modelRules: [0, 0, 0, 0] });
    const s = signal((await readWorkspacePosture(h.db, ORG)).groups, 'model-policy');

    expect(s.value).toBe('All models available');
    expect(s.enforcement).toBe('unconfigured');
  });

  it('reports a real model restriction as enforced', async () => {
    const h = harness({ modelRules: [0, 2, 0, 1] });
    const s = signal((await readWorkspacePosture(h.db, ORG)).groups, 'model-policy');

    expect(s.value).toBe('3 rules in force');
    expect(s.enforcement).toBe('enforced');
    expect(s.detail).toMatch(/after Auto chooses a model/i);
  });

  it('marks managed compute and privacy modes as enforced', async () => {
    const h = harness();
    const posture = await readWorkspacePosture(h.db, ORG);

    expect(signal(posture.groups, 'managed-compute').enforcement).toBe('enforced');
    expect(signal(posture.groups, 'privacy-modes').enforcement).toBe('enforced');
  });

  it('distinguishes a configured connection from an active one', async () => {
    const dormant = harness({
      sso: [
        {
          domain: 'acme.test',
          provider_type: 'saml',
          is_active: false,
          domain_verified_at: null,
          clerk_connection_id: null,
        },
      ],
    });
    const posture = await readWorkspacePosture(dormant.db, ORG);
    const sso = signal(posture.groups, 'sso');

    expect(sso.state).toBe('attention');
    expect(sso.enforcement).toBe('unconfigured');
    expect(sso.value).toContain('none active');
  });

  it('treats an active connection as enforced and names its domain', async () => {
    const active = harness({
      sso: [
        {
          domain: 'acme.test',
          provider_type: 'oidc',
          is_active: true,
          domain_verified_at: '2026-08-01T00:00:00.000Z',
          clerk_connection_id: 'conn_1',
        },
      ],
    });
    const posture = await readWorkspacePosture(active.db, ORG);

    expect(signal(posture.groups, 'sso').enforcement).toBe('enforced');
    expect(signal(posture.groups, 'sso').detail).toContain('acme.test');
    expect(signal(posture.groups, 'domains').value).toBe('acme.test');
  });

  it('flags directory sync errors and recommends resolving them', async () => {
    const h = harness({
      syncErrors: 3,
      directory: [{ provider: 'okta', is_active: true, last_sync_at: '2026-08-20T00:00:00.000Z' }],
    });
    const posture = await readWorkspacePosture(h.db, ORG);

    expect(signal(posture.groups, 'scim-errors').state).toBe('attention');
    expect(posture.recommendations.map((r) => r.id)).toContain('sync-errors');
  });

  it('says a workspace with no policy row is on the shipped default', async () => {
    const h = harness({ policyRow: null });
    const posture = await readWorkspacePosture(h.db, ORG);
    const configured = signal(posture.groups, 'policy-configured');

    expect(configured.value).toBe('Using shipped default');
    expect(configured.enforcement).toBe('unconfigured');
    expect(posture.recommendations.map((r) => r.id)).toContain('save-policy');
  });

  it('flags a workspace that has consumed every licensed seat', async () => {
    const h = harness({ org: { name: 'Acme', licensed_seats: 4, seats_consumed: 4 } });
    const posture = await readWorkspacePosture(h.db, ORG);

    expect(signal(posture.groups, 'seats').state).toBe('attention');
    expect(signal(posture.groups, 'seats').value).toBe('4 of 4 used');
  });

  it('reports unprovisioned seats as unknown rather than as zero', async () => {
    const h = harness({ org: { name: 'Acme', licensed_seats: null, seats_consumed: null } });
    const posture = await readWorkspacePosture(h.db, ORG);
    const seats = signal(posture.groups, 'seats');

    expect(seats.value).toBe('Not provisioned');
    expect(seats.enforcement).toBe('unconfigured');
  });

  it('recommends only actions this workspace can actually take today', async () => {
    const h = harness({
      policyRow: null,
      sso: [],
      directory: [],
    });
    const posture = await readWorkspacePosture(h.db, ORG);

    // Every recommendation must point at a console route that exists.
    for (const rec of posture.recommendations) {
      expect(rec.href).toMatch(/^\/workspace(\/[a-z]+)?$/);
    }
  });

  it('drops recommendations once the workspace has satisfied them', async () => {
    const h = harness({
      roles: [
        { role: 'owner', count: 2 },
        { role: 'member', count: 3 },
      ],
      policyRow: {
        organization_id: ORG,
        default_privacy_mode: 'managed',
        allowed_privacy_modes: ['local', 'byok', 'managed'],
        allow_managed_compute: true,
        require_local_to_byok_preview: true,
        chat_sync_surfaces: ['web', 'desktop', 'mobile'],
        allow_cli_cloud_sync: true,
        allow_vscode_cloud_sync: true,
        allow_chrome_cloud_sync: true,
        audit_export_enabled: true,
        retention_days: 90,
        retention_enforced: true,
        metadata: {},
        updated_at: '2026-08-23T00:00:00.000Z',
      },
      sso: [
        {
          domain: 'acme.test',
          provider_type: 'saml',
          is_active: true,
          domain_verified_at: '2026-08-01T00:00:00.000Z',
          clerk_connection_id: 'conn_1',
        },
      ],
      directory: [{ provider: 'okta', is_active: true, last_sync_at: '2026-08-22T00:00:00.000Z' }],
    });
    const posture = await readWorkspacePosture(h.db, ORG);

    expect(posture.recommendations).toEqual([]);
  });

  it('carries a non-empty explanation on every signal', async () => {
    // A posture row with a bare value is unreadable to the security reviewer it
    // exists for; the detail is what makes the value auditable.
    const h = harness();
    const posture = await readWorkspacePosture(h.db, ORG);

    for (const s of allSignals(posture.groups)) {
      expect(s.detail.length).toBeGreaterThan(20);
      expect(s.label.length).toBeGreaterThan(0);
    }
  });
});

describe('readWorkspacePosture, who can administer the workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entitlement.plan = 'team';
  });

  it('flags a workspace that only one account can administer', async () => {
    const h = harness({
      roles: [
        { role: 'owner', count: 1 },
        { role: 'admin', count: 4 },
        { role: 'member', count: 20 },
      ],
    });
    const posture = await readWorkspacePosture(h.db, ORG);
    const owners = signal(posture.groups, 'owners');

    expect(owners.value).toBe('1 owner');
    expect(owners.state).toBe('attention');
    expect(owners.enforcement).toBe('enforced');
    expect(posture.recommendations.map((r) => r.id)).toContain('second-owner');
  });

  it('does not let admins stand in for the missing owner', async () => {
    // The row this replaced added owners and admins together, so four admins
    // made a single-owner workspace read as five accounts deep.
    const h = harness({
      roles: [
        { role: 'owner', count: 1 },
        { role: 'admin', count: 4 },
      ],
    });
    const posture = await readWorkspacePosture(h.db, ORG);

    expect(signal(posture.groups, 'members').detail).toContain('1 owner and 4 admins');
    expect(signal(posture.groups, 'owners').state).toBe('attention');
  });

  it('is satisfied once a second owner exists', async () => {
    const h = harness({
      roles: [
        { role: 'owner', count: MIN_RECOMMENDED_OWNERS },
        { role: 'member', count: 1 },
      ],
    });
    const posture = await readWorkspacePosture(h.db, ORG);

    expect(signal(posture.groups, 'owners').state).toBe('ok');
    expect(posture.recommendations.map((r) => r.id)).not.toContain('second-owner');
  });

  it('says plainly when no account holds the role at all', async () => {
    const h = harness({ roles: [{ role: 'member', count: 3 }] });
    const owners = signal((await readWorkspacePosture(h.db, ORG)).groups, 'owners');

    expect(owners.value).toBe('None');
    expect(owners.state).toBe('attention');
  });
});

describe('readWorkspacePosture, identity provider certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entitlement.plan = 'team';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function certificateSignalAt(offsetMs: number, metadataXml: string | null) {
    vi.useFakeTimers();
    vi.setSystemTime(CERTIFICATE_EXPIRES_AT + offsetMs);
    const h = harness({ sso: [samlConnection(metadataXml)] });
    return signal((await readWorkspacePosture(h.db, ORG)).groups, 'sso-certificate');
  }

  it('reads the expiry out of the metadata the workspace uploaded', async () => {
    const certificate = await certificateSignalAt(-400 * DAY_MS, samlMetadata(IDP_CERTIFICATE_DER));

    expect(certificate.value).toMatch(/^Valid until /);
    expect(certificate.state).toBe('ok');
    expect(certificate.enforcement).toBe('enforced');
  });

  it('asks for attention before the expiry stops sign-in, not after', async () => {
    const certificate = await certificateSignalAt(
      -(CERTIFICATE_ATTENTION_DAYS - 1) * DAY_MS,
      samlMetadata(IDP_CERTIFICATE_DER),
    );

    expect(certificate.value).toMatch(/^Expires /);
    expect(certificate.state).toBe('attention');
    expect(certificate.detail).toMatch(/every member at once/);
  });

  it('reports an expired certificate as the sign-in outage it is', async () => {
    const certificate = await certificateSignalAt(DAY_MS, samlMetadata(IDP_CERTIFICATE_DER));

    expect(certificate.value).toMatch(/^Expired /);
    expect(certificate.state).toBe('attention');
    expect(certificate.detail).toMatch(/fails for every member/);
  });

  it('takes the earliest expiry when the metadata carries more than one certificate', async () => {
    const twoCertificates = samlMetadata(IDP_CERTIFICATE_DER).replace(
      '</ds:X509Data>',
      `<ds:X509Certificate>${IDP_CERTIFICATE_DER}</ds:X509Certificate></ds:X509Data>`,
    );
    const certificate = await certificateSignalAt(DAY_MS, twoCertificates);

    expect(certificate.value).toMatch(/^Expired /);
  });

  it('does not claim to have checked a connection configured from a metadata URL', async () => {
    const certificate = await certificateSignalAt(-400 * DAY_MS, null);

    expect(certificate.value).toBe('Not verified');
    expect(certificate.state).toBe('attention');
    expect(certificate.enforcement).toBe('unconfigured');
  });

  it('does not invent a certificate requirement for an OIDC connection', async () => {
    const h = harness({
      sso: [
        {
          domain: 'acme.test',
          provider_type: 'oidc',
          is_active: true,
          domain_verified_at: '2026-08-01T00:00:00.000Z',
          clerk_connection_id: 'conn_1',
        },
      ],
    });
    const certificate = signal((await readWorkspacePosture(h.db, ORG)).groups, 'sso-certificate');

    expect(certificate.value).toBe('Not applicable');
    expect(certificate.state).toBe('ok');
  });

  it('does not read a certificate out of a connection that is switched off', async () => {
    const h = harness({
      sso: [{ ...samlConnection(samlMetadata(IDP_CERTIFICATE_DER)), is_active: false }],
    });
    const certificate = signal((await readWorkspacePosture(h.db, ORG)).groups, 'sso-certificate');

    expect(certificate.value).toBe('Not applicable');
  });
});

describe('readWorkspacePosture, residency and keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('says a workspace without its own key is on a per-workspace platform key, not its own', async () => {
    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY', 'ab'.repeat(32));
    const h = harness();
    const posture = await readWorkspacePosture(h.db, ORG);
    const key = signal(posture.groups, 'encryption-key');

    expect(key.value).toMatch(/platform key/i);
    expect(key.detail).toMatch(/not offered yet/i);
    expect(key.detail).not.toMatch(/customer-managed \(/i);
  });

  it('says so when the deployment has no platform key ring at all', async () => {
    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY', '');
    const h = harness();
    const posture = await readWorkspacePosture(h.db, ORG);
    const key = signal(posture.groups, 'encryption-key');

    expect(key.value).toBe('Not configured');
    expect(key.enforcement).toBe('unconfigured');
  });

  it('reports an unreachable customer key as a refusal rather than smoothing it over', async () => {
    const h = harness({
      encryptionKey: {
        organization_id: ORG,
        provider: 'aws_kms',
        key_uri: 'arn:aws:kms:us-east-1:1:key/abc',
        key_region: 'us-east-1',
        status: 'active',
        key_version: '1',
        wrapped_data_key: 'AAAABBBB',
        retired_keys: [],
        last_rotated_at: null,
        revoked_at: null,
      },
    });
    const posture = await readWorkspacePosture(h.db, ORG);
    const key = signal(posture.groups, 'encryption-key');

    expect(key.value).toMatch(/unreachable/i);
    expect(key.state).toBe('attention');
    expect(key.detail).toMatch(/refused rather than served with a platform key/i);
  });

  it('reports a revoked key as sealed rather than as a fallback to the platform key', async () => {
    const h = harness({
      encryptionKey: {
        organization_id: ORG,
        provider: 'aws_kms',
        key_uri: 'arn:aws:kms:us-east-1:1:key/abc',
        key_region: 'us-east-1',
        status: 'revoked',
        key_version: '2',
        wrapped_data_key: 'AAAABBBB',
        retired_keys: [{ version: '1', wrapped: 'CCCCDDDD' }],
        last_rotated_at: null,
        revoked_at: '2026-09-16T00:00:00.000Z',
      },
    });
    const posture = await readWorkspacePosture(h.db, ORG);
    const key = signal(posture.groups, 'encryption-key');

    expect(key.value).toMatch(/revoked/i);
    expect(key.detail).toMatch(/nothing falls back to a platform key/i);
  });

  it('never dresses the home region up as a residency commitment', async () => {
    const h = harness();
    const posture = await readWorkspacePosture(h.db, ORG);
    const region = signal(posture.groups, 'data-region');

    expect(region.value).toBe('United States');
    expect(region.enforcement).toBe('stated');
    expect(region.detail).toMatch(/not as a residency commitment/i);
  });

  it('says a pinned workspace this deployment cannot serve is refused, not relocated', async () => {
    const h = harness({ region: { data_region: 'eu', data_region_requested: null } });
    const posture = await readWorkspacePosture(h.db, ORG);
    const region = signal(posture.groups, 'data-region');

    expect(region.value).toMatch(/not provisioned/i);
    expect(region.state).toBe('attention');
    expect(region.detail).toMatch(/refused rather than served from another region/i);
  });

  it('shows a requested move as outstanding, not as where the data already is', async () => {
    const h = harness({ region: { data_region: null, data_region_requested: 'eu' } });
    const posture = await readWorkspacePosture(h.db, ORG);
    const region = signal(posture.groups, 'data-region');

    expect(region.value).toBe('United States');
    expect(region.detail).toMatch(/requested and not complete/i);
  });
});
