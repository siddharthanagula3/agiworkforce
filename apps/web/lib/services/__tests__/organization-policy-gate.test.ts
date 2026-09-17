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
import { ErrorCode } from '@/lib/errors';
import { clearIpAllowListCacheForTests } from '../organization-ip-allow-list-cache';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

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

const CONNECTION_RESET = new Error('connection reset');

const ACCOUNT_CONTROL_UNAVAILABLE = {
  code: ErrorCode.SERVICE_UNAVAILABLE,
  statusCode: 503,
  message: expect.stringContaining('contact your workspace administrator'),
};

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

  it('leaves a personal-scope request ungoverned when the caller funds no enterprise organization', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([]) // no active workspace
      .mockResolvedValueOnce([]); // no owned or member organization

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('unscoped');
    expect(decision.organizationId).toBeNull();
    expect(h.query).toHaveBeenCalledTimes(2);
  });

  it('denies a personal-scope request when the caller owns a read-only enterprise organization', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([]) // no active workspace selected
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]) // owner_user_id match
      .mockResolvedValueOnce(overdueContractRow(95));

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'owner-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('billing_read_only');
    expect(decision.organizationId).toBe(ORGANIZATION_ID);
  });

  it('denies a personal-scope request when the caller is a seat member of a read-only enterprise organization', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([]) // no active workspace selected
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]) // seat membership match
      .mockResolvedValueOnce(overdueContractRow(95));

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'member-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('billing_read_only');
    expect(decision.organizationId).toBe(ORGANIZATION_ID);
  });

  it('leaves a personal-scope request ungoverned when the funding organization is not read-only', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([]) // no active workspace selected
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(NO_OPEN_INVOICE);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'member-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('unscoped');
    expect(decision.organizationId).toBeNull();
  });

  it('leaves a personal-scope request ungoverned when the funding organization lookup errors', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([]) // no active workspace selected
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'member-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('unscoped');
    expect(decision.organizationId).toBeNull();
  });

  it('leaves a personal-scope request ungoverned when the funding organization collection state read errors', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([]) // no active workspace selected
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'member-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('unscoped');
    expect(decision.organizationId).toBeNull();
  });

  it('does not apply the funding-organization billing hold to a resource it is not gated on', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([]) // no active workspace selected
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(overdueContractRow(95));

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'member-1', {
      resource: 'audit_export',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('unscoped');
    expect(decision.organizationId).toBeNull();
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

  it('denies managed compute when the policy cannot be read after one retry', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(NO_OPEN_INVOICE)
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('workspace_policy_unavailable');
    expect(decision.reason).toContain('contact your workspace administrator');
    expect(decision.reason).not.toContain('connection reset');
    expect(decision.organizationId).toBe(ORGANIZATION_ID);
    expect(h.query).toHaveBeenCalledTimes(4);
  });

  it('denies external sharing when the policy cannot be read after one retry', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(NO_OPEN_INVOICE)
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'external_sharing',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('workspace_policy_unavailable');
  });

  it('binds the policy when a transient policy read failure succeeds on retry', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(NO_OPEN_INVOICE)
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockResolvedValueOnce([policyRow({ allow_managed_compute: false })]);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('managed_compute_disabled');
  });

  it('denies when the active workspace cannot be resolved after one retry', async () => {
    const h = harness();
    h.query.mockRejectedValueOnce(CONNECTION_RESET).mockRejectedValueOnce(CONNECTION_RESET);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('workspace_policy_unavailable');
    expect(decision.organizationId).toBeNull();
  });

  it('denies a workspace selector the caller is not a member of instead of treating it as personal scope', async () => {
    const h = harness();
    const request = { headers: new Headers({ 'x-agi-organization-id': ORGANIZATION_ID }) };
    h.query.mockResolvedValue([]);

    const decision = await evaluateActiveWorkspacePolicy(
      h.db,
      'user-1',
      { resource: 'managed_compute', surface: 'web' },
      request,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('workspace_not_accessible');
  });

  it('denies an invalid workspace selector instead of treating it as personal scope', async () => {
    const h = harness();
    const request = { headers: new Headers({ 'x-agi-organization-id': 'not-a-workspace' }) };

    const decision = await evaluateActiveWorkspacePolicy(
      h.db,
      'user-1',
      { resource: 'managed_compute', surface: 'web' },
      request,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('workspace_not_accessible');
    expect(h.query).not.toHaveBeenCalled();
  });

  it('decides a credit top-up on the billing hold alone when the policy cannot be read', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(overdueContractRow(61))
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'credit_topup',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('billing_past_due');
  });

  it('allows a credit top-up with no billing hold when only the policy cannot be read', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce(NO_OPEN_INVOICE)
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'credit_topup',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('unscoped');
  });

  it('denies a seat purchase when the billing hold cannot be read after one retry', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'seat_purchase',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('workspace_policy_unavailable');
    expect(decision.reason).toContain('billing status');
    expect(decision.organizationId).toBe(ORGANIZATION_ID);
  });

  it('denies a personal-scope credit top-up when the funding organization cannot be resolved', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([]) // no active workspace selected
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET);

    const decision = await evaluateActiveWorkspacePolicy(h.db, 'user-1', {
      resource: 'credit_topup',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('workspace_policy_unavailable');
    expect(decision.organizationId).toBeNull();
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

  it('leaves managed compute to the policy when the collection state cannot be read after one retry', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET)
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

  it('defaults a caller with no organization to warn', async () => {
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

  it('applies the strictest mode when the policy cannot be read after one retry', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET);

    const result = await resolveSecretHandlingPolicy(h.db, 'user-1');

    expect(result).toEqual({ mode: 'block', organizationId: ORGANIZATION_ID });
    expect(h.query).toHaveBeenCalledTimes(3);
  });

  it('applies the strictest mode when the governing organizations cannot be resolved after one retry', async () => {
    const h = harness();
    h.query.mockRejectedValueOnce(CONNECTION_RESET).mockRejectedValueOnce(CONNECTION_RESET);

    const result = await resolveSecretHandlingPolicy(h.db, 'user-1');

    expect(result).toEqual({ mode: 'block', organizationId: null });
  });

  it('lets an unreadable membership outrank a readable warn policy', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([
        { organization_id: SECOND_ORGANIZATION_ID },
        { organization_id: ORGANIZATION_ID },
      ])
      .mockResolvedValueOnce([policyRow({ metadata: { secretHandling: 'warn' } })])
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET);

    const result = await resolveSecretHandlingPolicy(h.db, 'user-1');

    expect(result).toEqual({ mode: 'block', organizationId: ORGANIZATION_ID });
  });

  it('binds the saved mode when a transient read failure succeeds on retry', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockResolvedValueOnce([policyRow({ metadata: { secretHandling: 'warn' } })]);

    const result = await resolveSecretHandlingPolicy(h.db, 'user-1');

    expect(result).toEqual({ mode: 'warn', organizationId: ORGANIZATION_ID });
  });
});

describe('resolveMfaPolicy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns no policy for a caller who belongs to no organization', async () => {
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

  it('denies an organization member whose policy cannot be read after one retry', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'));

    await expect(resolveMfaPolicy(h.db, 'user-1')).rejects.toMatchObject(
      ACCOUNT_CONTROL_UNAVAILABLE,
    );
    expect(h.query).toHaveBeenCalledTimes(3);
  });

  it('binds the policy when a transient read failure succeeds on retry', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce([policyRow({ metadata: { requireMfa: true } })]);

    const result = await resolveMfaPolicy(h.db, 'user-1');

    expect(result.organizationId).toBe(ORGANIZATION_ID);
    expect(result.policy?.requireMfa).toBe(true);
  });

  it('denies when a member organization cannot be read even though another does not require mfa', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([
        { organization_id: SECOND_ORGANIZATION_ID },
        { organization_id: ORGANIZATION_ID },
      ])
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce([policyRow({ metadata: { requireMfa: false } })]);

    await expect(resolveMfaPolicy(h.db, 'user-1')).rejects.toMatchObject(
      ACCOUNT_CONTROL_UNAVAILABLE,
    );
  });

  it('denies when the governing organizations cannot be resolved', async () => {
    const h = harness();
    h.query
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'));

    await expect(resolveMfaPolicy(h.db, 'user-1')).rejects.toMatchObject(
      ACCOUNT_CONTROL_UNAVAILABLE,
    );
  });

  it('still binds a second membership that requires mfa when the first organization cannot be read', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([
        { organization_id: SECOND_ORGANIZATION_ID },
        { organization_id: ORGANIZATION_ID },
      ])
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce([policyRow({ metadata: { requireMfa: true } })]);

    const result = await resolveMfaPolicy(h.db, 'user-1');

    expect(result.organizationId).toBe(ORGANIZATION_ID);
    expect(result.policy?.requireMfa).toBe(true);
  });
});

describe('resolveZeroDataRetentionPolicy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults a caller with no organization to unrequired', async () => {
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

  it('denies when the policy cannot be read after one retry', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET);

    await expect(resolveZeroDataRetentionPolicy(h.db, 'user-1')).rejects.toMatchObject(
      ACCOUNT_CONTROL_UNAVAILABLE,
    );
    expect(h.query).toHaveBeenCalledTimes(3);
  });

  it('denies when the governing organizations cannot be resolved after one retry', async () => {
    const h = harness();
    h.query.mockRejectedValueOnce(CONNECTION_RESET).mockRejectedValueOnce(CONNECTION_RESET);

    await expect(resolveZeroDataRetentionPolicy(h.db, 'user-1')).rejects.toMatchObject(
      ACCOUNT_CONTROL_UNAVAILABLE,
    );
  });

  it('denies when a membership cannot be read even though another does not require it', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([
        { organization_id: SECOND_ORGANIZATION_ID },
        { organization_id: ORGANIZATION_ID },
      ])
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockResolvedValueOnce([policyRow({ metadata: { zeroDataRetentionOnly: false } })]);

    await expect(resolveZeroDataRetentionPolicy(h.db, 'user-1')).rejects.toMatchObject(
      ACCOUNT_CONTROL_UNAVAILABLE,
    );
  });

  it('still requires retention when a second membership requires it and the first cannot be read', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([
        { organization_id: SECOND_ORGANIZATION_ID },
        { organization_id: ORGANIZATION_ID },
      ])
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockResolvedValueOnce([policyRow({ metadata: { zeroDataRetentionOnly: true } })]);

    const result = await resolveZeroDataRetentionPolicy(h.db, 'user-1');

    expect(result).toEqual({ required: true, organizationId: ORGANIZATION_ID });
  });

  it('binds the requirement when a transient read failure succeeds on retry', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(CONNECTION_RESET)
      .mockResolvedValueOnce([policyRow({ metadata: { zeroDataRetentionOnly: true } })]);

    const result = await resolveZeroDataRetentionPolicy(h.db, 'user-1');

    expect(result).toEqual({ required: true, organizationId: ORGANIZATION_ID });
  });
});

describe('resolveIpAllowListPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    clearIpAllowListCacheForTests();
  });

  it('reports nothing governed for a caller who belongs to no organization', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    const result = await resolveIpAllowListPolicy(h.db, 'user-1');

    expect(result).toEqual({ governed: [] });
  });

  it('defaults an organization with no saved policy to an empty allow list', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]).mockResolvedValueOnce([]);

    const result = await resolveIpAllowListPolicy(h.db, 'user-1');

    expect(result).toEqual({ governed: [{ organizationId: ORGANIZATION_ID, cidrs: [] }] });
  });

  it('binds an organization saved allow list', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce([policyRow({ metadata: { ipAllowList: ['203.0.113.0/24'] } })]);

    const result = await resolveIpAllowListPolicy(h.db, 'user-1');

    expect(result).toEqual({
      governed: [{ organizationId: ORGANIZATION_ID, cidrs: ['203.0.113.0/24'] }],
    });
  });

  it('caches the resolved allow list so a second call for the same organization skips the policy read', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce([policyRow({ metadata: { ipAllowList: ['203.0.113.0/24'] } })])
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]);

    const first = await resolveIpAllowListPolicy(h.db, 'user-1');
    const second = await resolveIpAllowListPolicy(h.db, 'user-1');

    const expected = { governed: [{ organizationId: ORGANIZATION_ID, cidrs: ['203.0.113.0/24'] }] };
    expect(first).toEqual(expected);
    expect(second).toEqual(expected);
    expect(h.query).toHaveBeenCalledTimes(3);
  });

  it('denies an organization member when the policy read fails after one retry and no allow list is known', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'));

    await expect(resolveIpAllowListPolicy(h.db, 'user-1')).rejects.toMatchObject(
      ACCOUNT_CONTROL_UNAVAILABLE,
    );
    expect(h.query).toHaveBeenCalledTimes(3);
  });

  it('binds the allow list when a transient read failure succeeds on retry', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce([policyRow({ metadata: { ipAllowList: ['203.0.113.0/24'] } })]);

    const result = await resolveIpAllowListPolicy(h.db, 'user-1');

    expect(result).toEqual({
      governed: [{ organizationId: ORGANIZATION_ID, cidrs: ['203.0.113.0/24'] }],
    });
  });

  it('denies when the governing organizations cannot be resolved', async () => {
    const h = harness();
    h.query
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'));

    await expect(resolveIpAllowListPolicy(h.db, 'user-1')).rejects.toMatchObject(
      ACCOUNT_CONTROL_UNAVAILABLE,
    );
  });

  it('keeps enforcing the last known allow list when a refresh after expiry fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T00:00:00.000Z'));
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce([policyRow({ metadata: { ipAllowList: ['203.0.113.0/24'] } })])
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'));

    await resolveIpAllowListPolicy(h.db, 'user-1');
    vi.setSystemTime(new Date('2026-09-16T00:01:00.000Z'));
    const refreshed = await resolveIpAllowListPolicy(h.db, 'user-1');

    expect(refreshed).toEqual({
      governed: [{ organizationId: ORGANIZATION_ID, cidrs: ['203.0.113.0/24'] }],
    });
    expect(h.query).toHaveBeenCalledTimes(5);
  });

  it('denies once the last known allow list is too old to stand in for a failed refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T00:00:00.000Z'));
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce([policyRow({ metadata: { ipAllowList: ['203.0.113.0/24'] } })])
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'));

    await resolveIpAllowListPolicy(h.db, 'user-1');
    vi.setSystemTime(new Date('2026-09-16T01:00:00.000Z'));

    await expect(resolveIpAllowListPolicy(h.db, 'user-1')).rejects.toMatchObject(
      ACCOUNT_CONTROL_UNAVAILABLE,
    );
  });

  it('reports every membership so a second workspace cannot dilute the first', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([
        { organization_id: SECOND_ORGANIZATION_ID },
        { organization_id: ORGANIZATION_ID },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([policyRow({ metadata: { ipAllowList: ['203.0.113.0/24'] } })]);

    const result = await resolveIpAllowListPolicy(h.db, 'user-1');

    expect(result).toEqual({
      governed: [
        { organizationId: SECOND_ORGANIZATION_ID, cidrs: [] },
        { organizationId: ORGANIZATION_ID, cidrs: ['203.0.113.0/24'] },
      ],
    });
  });
});
