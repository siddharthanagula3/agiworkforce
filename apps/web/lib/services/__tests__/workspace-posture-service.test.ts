import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { readWorkspacePosture, type PostureSignal } from '../workspace-posture-service';

const ORG = '11111111-1111-4111-8111-111111111111';

interface Fixture {
  roles?: { role: string; count: number }[];
  invitations?: number;
  sso?: {
    domain: string;
    provider_type: string;
    is_active: boolean;
    domain_verified_at: string | null;
    clerk_connection_id: string | null;
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
  policyRow?: Record<string, unknown> | null;
  org?: { name: string | null; licensed_seats: number | null; seats_consumed: number | null };
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
      return [fixture.org ?? { name: 'Acme', licensed_seats: 25, seats_consumed: 4 }];
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
    if (text.includes('from public.sso_connections')) return fixture.sso ?? [];
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
  beforeEach(() => vi.clearAllMocks());

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

    for (const id of ['sso-required', 'deprovision', 'siem']) {
      const s = signal(posture.groups, id);
      expect(s.value).toBe('Not available');
      expect(s.enforcement).toBe('unconfigured');
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
    expect(s.detail).toMatch(/after auto-routing resolves/i);
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
