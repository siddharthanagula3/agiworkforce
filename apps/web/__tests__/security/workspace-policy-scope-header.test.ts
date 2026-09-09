import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  resolveIpAllowListPolicy,
  resolveMfaPolicy,
  resolveSecretHandlingPolicy,
  resolveZeroDataRetentionPolicy,
} from '@/lib/services/organization-policy-gate';
import { clearIpAllowListCacheForTests } from '@/lib/services/organization-ip-allow-list-cache';

const GOVERNED_ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'user-under-policy';

function policyRow(metadata: Record<string, unknown>, organizationId: string) {
  return {
    organization_id: organizationId,
    default_privacy_mode: 'byok',
    allowed_privacy_modes: ['local', 'byok'],
    allow_managed_compute: true,
    require_local_to_byok_preview: true,
    chat_sync_surfaces: ['web', 'desktop', 'mobile'],
    allow_cli_cloud_sync: false,
    allow_vscode_cloud_sync: false,
    allow_chrome_cloud_sync: false,
    audit_export_enabled: true,
    retention_days: 365,
    metadata,
    updated_at: '2026-08-22T00:00:00.000Z',
  };
}

/**
 * Routes by SQL rather than by call order, so each case states a situation
 * rather than an implementation's query sequence.
 *
 * `activeWorkspace: null` is the bypass: the caller selected personal scope
 * with `x-agi-organization-id: personal`, so the active-workspace lookup finds
 * nothing, while the memberships that actually govern them are untouched.
 * Resolving a control's scope from that selection answers "ungoverned";
 * resolving it from membership does not.
 */
function harness(options: { activeWorkspace?: string | null; memberships?: string[] } = {}) {
  const memberships = options.memberships ?? [];
  const policies = new Map<string, ReturnType<typeof policyRow>>();

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('user_settings')) {
      return options.activeWorkspace ? [{ organization_id: options.activeWorkspace }] : [];
    }
    if (sql.includes('governing')) {
      return memberships.map((organization_id) => ({ organization_id }));
    }
    const policy = policies.get(String(params?.[0] ?? ''));
    return policy ? [policy] : [];
  });

  const api = {
    db: { query, execute: vi.fn() } as unknown as DatabaseAdapter,
    query,
    withPolicy(organizationId: string, metadata: Record<string, unknown>) {
      policies.set(organizationId, policyRow(metadata, organizationId));
      return api;
    },
  };
  return api;
}

describe('a workspace control still binds when the caller selects personal scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIpAllowListCacheForTests();
  });

  it('requires mfa', async () => {
    const h = harness({
      activeWorkspace: null,
      memberships: [GOVERNED_ORGANIZATION_ID],
    }).withPolicy(GOVERNED_ORGANIZATION_ID, { requireMfa: true });

    const result = await resolveMfaPolicy(h.db, USER_ID);

    expect(result.organizationId).toBe(GOVERNED_ORGANIZATION_ID);
    expect(result.policy?.requireMfa).toBe(true);
  });

  it('enforces the ip allow list', async () => {
    const h = harness({
      activeWorkspace: null,
      memberships: [GOVERNED_ORGANIZATION_ID],
    }).withPolicy(GOVERNED_ORGANIZATION_ID, { ipAllowList: ['203.0.113.0/24'] });

    const result = await resolveIpAllowListPolicy(h.db, USER_ID);

    expect(result.governed).toEqual([
      { organizationId: GOVERNED_ORGANIZATION_ID, cidrs: ['203.0.113.0/24'] },
    ]);
  });

  it('requires zero data retention', async () => {
    const h = harness({
      activeWorkspace: null,
      memberships: [GOVERNED_ORGANIZATION_ID],
    }).withPolicy(GOVERNED_ORGANIZATION_ID, { zeroDataRetentionOnly: true });

    const result = await resolveZeroDataRetentionPolicy(h.db, USER_ID);

    expect(result).toEqual({ required: true, organizationId: GOVERNED_ORGANIZATION_ID });
  });

  it('applies the workspace secret-handling mode', async () => {
    const h = harness({
      activeWorkspace: null,
      memberships: [GOVERNED_ORGANIZATION_ID],
    }).withPolicy(GOVERNED_ORGANIZATION_ID, { secretHandling: 'block' });

    const result = await resolveSecretHandlingPolicy(h.db, USER_ID);

    expect(result).toEqual({ mode: 'block', organizationId: GOVERNED_ORGANIZATION_ID });
  });

  it('never consults the caller-selected workspace at all', async () => {
    const h = harness({
      activeWorkspace: null,
      memberships: [GOVERNED_ORGANIZATION_ID],
    }).withPolicy(GOVERNED_ORGANIZATION_ID, { requireMfa: true });

    await resolveMfaPolicy(h.db, USER_ID);

    const selectionLookups = h.query.mock.calls.filter(([sql]) =>
      String(sql).includes('user_settings'),
    );
    expect(selectionLookups).toHaveLength(0);
  });
});

describe('a workspace control binds across every organization the caller belongs to', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIpAllowListCacheForTests();
  });

  it('requires mfa when any membership requires it, not only the selected workspace', async () => {
    const h = harness({
      activeWorkspace: SECOND_ORGANIZATION_ID,
      memberships: [SECOND_ORGANIZATION_ID, GOVERNED_ORGANIZATION_ID],
    })
      .withPolicy(SECOND_ORGANIZATION_ID, {})
      .withPolicy(GOVERNED_ORGANIZATION_ID, { requireMfa: true });

    const result = await resolveMfaPolicy(h.db, USER_ID);

    expect(result.organizationId).toBe(GOVERNED_ORGANIZATION_ID);
    expect(result.policy?.requireMfa).toBe(true);
  });

  it('reports every governing allow list so a second membership cannot dilute the first', async () => {
    const h = harness({
      activeWorkspace: SECOND_ORGANIZATION_ID,
      memberships: [SECOND_ORGANIZATION_ID, GOVERNED_ORGANIZATION_ID],
    })
      .withPolicy(SECOND_ORGANIZATION_ID, {})
      .withPolicy(GOVERNED_ORGANIZATION_ID, { ipAllowList: ['203.0.113.0/24'] });

    const result = await resolveIpAllowListPolicy(h.db, USER_ID);

    expect(result.governed).toEqual([
      { organizationId: SECOND_ORGANIZATION_ID, cidrs: [] },
      { organizationId: GOVERNED_ORGANIZATION_ID, cidrs: ['203.0.113.0/24'] },
    ]);
  });

  it('takes the strictest secret-handling mode across memberships', async () => {
    const h = harness({
      activeWorkspace: SECOND_ORGANIZATION_ID,
      memberships: [SECOND_ORGANIZATION_ID, GOVERNED_ORGANIZATION_ID],
    })
      .withPolicy(SECOND_ORGANIZATION_ID, { secretHandling: 'warn' })
      .withPolicy(GOVERNED_ORGANIZATION_ID, { secretHandling: 'block' });

    const result = await resolveSecretHandlingPolicy(h.db, USER_ID);

    expect(result).toEqual({ mode: 'block', organizationId: GOVERNED_ORGANIZATION_ID });
  });

  it('leaves a caller with no memberships ungoverned', async () => {
    const h = harness({ activeWorkspace: null, memberships: [] });

    await expect(resolveMfaPolicy(h.db, USER_ID)).resolves.toEqual({
      policy: null,
      organizationId: null,
    });
    await expect(resolveIpAllowListPolicy(h.db, USER_ID)).resolves.toEqual({ governed: [] });
    await expect(resolveZeroDataRetentionPolicy(h.db, USER_ID)).resolves.toEqual({
      required: false,
      organizationId: null,
    });
    await expect(resolveSecretHandlingPolicy(h.db, USER_ID)).resolves.toEqual({
      mode: 'warn',
      organizationId: null,
    });
  });
});
