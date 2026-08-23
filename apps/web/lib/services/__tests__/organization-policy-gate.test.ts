import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { evaluateActiveWorkspacePolicy } from '../organization-policy-gate';

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
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]).mockResolvedValueOnce([]); // no policy row

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
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]).mockResolvedValueOnce([
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
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]).mockResolvedValueOnce([
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
});
