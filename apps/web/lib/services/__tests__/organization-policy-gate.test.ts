import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  evaluateActiveWorkspacePolicy,
  resolveIpAllowListPolicy,
  resolveMfaPolicy,
  resolveSecretHandlingPolicy,
  resolveZeroDataRetentionPolicy,
} from '../organization-policy-gate';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function harness() {
  const query = vi.fn();
  const execute = vi.fn();
  return { db: { query, execute } as unknown as DatabaseAdapter, query, execute };
}

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: ORGANIZATION_ID,
    default_privacy_mode: 'byok',
    allowed_privacy_modes: ['local', 'byok'],
    allow_managed_compute: false,
    require_local_to_byok_preview: true,
    chat_sync_surfaces: ['web', 'desktop', 'mobile'],
    allow_cli_cloud_sync: false,
    allow_vscode_cloud_sync: false,
    allow_chrome_cloud_sync: false,
    audit_export_enabled: true,
    retention_days: 365,
    metadata: {},
    updated_at: '2026-08-22T00:00:00.000Z',
    ...overrides,
  };
}

const NO_OPEN_INVOICE: [] = [];

function overdueContractRow(daysPastDue: number) {
  return [
    {
      oldest_open_invoice_due_at: new Date(
        Date.now() - daysPastDue * 24 * 60 * 60 * 1000,
      ).toISOString(),
    },
  ];
}

describe('evaluateActiveWorkspacePolicy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('leaves a personal-scope request ungoverned without reading a policy', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]); // no active workspace

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('unscoped');
    expect(decision.organizationId).toBeNull();
    expect(h.query).toHaveBeenCalledTimes(1);
  });

  it('leaves an organization with no saved policy ungoverned rather than inheriting column defaults', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(NO_OPEN_INVOICE)
      .mockResolvedValueOnce([]); // no policy row

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('unscoped');
    expect(decision.organizationId).toBe(ORGANIZATION_ID);
  });

  it('binds a saved policy: managed compute off denies the turn', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(NO_OPEN_INVOICE)
      .mockResolvedValueOnce([policyRow({ allow_managed_compute: false })]);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('managed_compute_disabled');
    expect(decision.organizationId).toBe(ORGANIZATION_ID);
  });

  it('binds a saved policy: an enabled workspace allows the turn', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(NO_OPEN_INVOICE)
      .mockResolvedValueOnce([
        policyRow({
          allow_managed_compute: true,
          allowed_privacy_modes: ['local', 'byok', 'managed'],
        }),
      ]);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('allowed');
  });

  it('denies a disabled surface even when managed compute is on', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(NO_OPEN_INVOICE)
      .mockResolvedValueOnce([
        policyRow({
          allow_managed_compute: true,
          allowed_privacy_modes: ['local', 'byok', 'managed'],
          allow_cli_cloud_sync: false,
        }),
      ]);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'managed_compute',
      surface: 'cli',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('surface_sync_disabled');
  });

  it('treats a policy read failure as ungoverned so a database fault is not shown as a policy denial', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(NO_OPEN_INVOICE)
      .mockRejectedValueOnce(new Error('connection reset'));

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('unscoped');
    expect(decision.organizationId).toBe(ORGANIZATION_ID);
  });

  it('forwards the request so an explicit workspace header selects the governing policy', async () => {
    const h = harness();
    const request = { headers: new Headers({ 'x-agi-organization-id': ORGANIZATION_ID }) };
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]) // membership proof
      .mockResolvedValueOnce(NO_OPEN_INVOICE)
      .mockResolvedValueOnce([policyRow({ allow_managed_compute: false })]);

    const decision = await evaluateActiveWorkspacePolicy(
      h.db,
      'user-1',
      { resource: 'managed_compute', surface: 'web' },
      request,
    );

    expect(decision.allowed).toBe(false);
    expect(String(h.query.mock.calls[0]?.[0])).toContain('organization_members');
  });

  it('denies managed compute once the workspace is read-only for non-payment, even without a saved policy', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(overdueContractRow(95))
      .mockResolvedValueOnce([]); // no policy row

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('billing_read_only');
    expect(decision.organizationId).toBe(ORGANIZATION_ID);
  });

  it('denies a credit top-up once new paid usage is blocked at day 61, even without a saved policy', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(overdueContractRow(61))
      .mockResolvedValueOnce([]); // no policy row

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'credit_topup',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('billing_past_due');
  });

  it('denies a seat purchase once new paid usage is blocked, binding through a saved policy too', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(overdueContractRow(75))
      .mockResolvedValueOnce([policyRow()]);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'seat_purchase',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('billing_past_due');
  });

  it('keeps a read-only-eligible resource that is not content-creating allowed, such as audit export', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(overdueContractRow(95))
      .mockResolvedValueOnce([policyRow({ audit_export_enabled: true })]);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'audit_export',
    });

    expect(decision.allowed).toBe(true);
  });

  it('fails open on a collection state read failure, treating the workspace as not on billing hold', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce([]); // no policy row

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('unscoped');
  });
});

describe('resolveSecretHandlingPolicy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults a personal-scope request to warn', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    const result = await resolveSecretHandlingPolicy(h.db, 'user-1');

    expect(result).toEqual({ mode: 'warn', organizationId: null });
  });

  it('defaults an organization with no saved policy to redact', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]).mockResolvedValueOnce([]);

    const result = await resolveSecretHandlingPolicy(h.db, 'user-1');

    expect(result).toEqual({ mode: 'redact', organizationId: ORGANIZATION_ID });
  });

  it('binds an organization saved policy value', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce([policyRow({ metadata: { secretHandling: 'block' } })]);

    const result = await resolveSecretHandlingPolicy(h.db, 'user-1');

    expect(result).toEqual({ mode: 'block', organizationId: ORGANIZATION_ID });
  });

  it('falls back to the organization default when the policy read fails', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(new Error('connection reset'));

    const result = await resolveSecretHandlingPolicy(h.db, 'user-1');

    expect(result).toEqual({ mode: 'redact', organizationId: ORGANIZATION_ID });
  });

  it('falls back to warn when the active workspace cannot be resolved', async () => {
    const h = harness();
    h.query.mockRejectedValueOnce(new Error('connection reset'));

    const result = await resolveSecretHandlingPolicy(h.db, 'user-1');

    expect(result).toEqual({ mode: 'warn', organizationId: null });
  });
});

describe('resolveMfaPolicy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns no policy for a personal-scope request', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    const result = await resolveMfaPolicy(h.db, 'user-1');

    expect(result).toEqual({ policy: null, organizationId: null });
  });

  it('returns no policy for an organization that has never saved one', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]).mockResolvedValueOnce([]);

    const result = await resolveMfaPolicy(h.db, 'user-1');

    expect(result).toEqual({ policy: null, organizationId: ORGANIZATION_ID });
  });

  it('returns the saved policy, including requireMfa, for a governed organization', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce([policyRow({ metadata: { requireMfa: true } })]);

    const result = await resolveMfaPolicy(h.db, 'user-1');

    expect(result.organizationId).toBe(ORGANIZATION_ID);
    expect(result.policy?.requireMfa).toBe(true);
  });

  it('treats a policy read failure as ungoverned', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(new Error('connection reset'));

    const result = await resolveMfaPolicy(h.db, 'user-1');

    expect(result).toEqual({ policy: null, organizationId: ORGANIZATION_ID });
  });
});

describe('resolveZeroDataRetentionPolicy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults a personal-scope request to unrequired', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    const result = await resolveZeroDataRetentionPolicy(h.db, 'user-1');

    expect(result).toEqual({ required: false, organizationId: null });
  });

  it('defaults an organization with no saved policy to unrequired', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]).mockResolvedValueOnce([]);

    const result = await resolveZeroDataRetentionPolicy(h.db, 'user-1');

    expect(result).toEqual({ required: false, organizationId: ORGANIZATION_ID });
  });

  it('binds an organization saved policy value', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce([policyRow({ metadata: { zeroDataRetentionOnly: true } })]);

    const result = await resolveZeroDataRetentionPolicy(h.db, 'user-1');

    expect(result).toEqual({ required: true, organizationId: ORGANIZATION_ID });
  });

  it('fails open (unrequired) when the policy read fails', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(new Error('connection reset'));

    const result = await resolveZeroDataRetentionPolicy(h.db, 'user-1');

    expect(result).toEqual({ required: false, organizationId: ORGANIZATION_ID });
  });
});

describe('resolveIpAllowListPolicy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults a personal-scope request to an empty allow list', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    const result = await resolveIpAllowListPolicy(h.db, 'user-1');

    expect(result).toEqual({ cidrs: [], organizationId: null });
  });

  it('defaults an organization with no saved policy to an empty allow list', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]).mockResolvedValueOnce([]);

    const result = await resolveIpAllowListPolicy(h.db, 'user-1');

    expect(result).toEqual({ cidrs: [], organizationId: ORGANIZATION_ID });
  });

  it('binds an organization saved allow list', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce([policyRow({ metadata: { ipAllowList: ['203.0.113.0/24'] } })]);

    const result = await resolveIpAllowListPolicy(h.db, 'user-1');

    expect(result).toEqual({ cidrs: ['203.0.113.0/24'], organizationId: ORGANIZATION_ID });
  });

  it('fails open (empty allow list) when the policy read fails', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(new Error('connection reset'));

    const result = await resolveIpAllowListPolicy(h.db, 'user-1');

    expect(result).toEqual({ cidrs: [], organizationId: ORGANIZATION_ID });
  });
});
