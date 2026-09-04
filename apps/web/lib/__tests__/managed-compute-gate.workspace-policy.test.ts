import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));

import { buildOrganizationPolicyGateResponse } from '../managed-compute-gate';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

const DESCRIPTOR = {
  provider: 'managed',
  model: 'chat-completions',
  feature: 'llm_v1_chat_completions',
  surface: 'web',
} as const;

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: ORG_ID,
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
    ip_allow_list: [],
    metadata: {},
    updated_at: '2026-08-22T00:00:00.000Z',
    ...overrides,
  };
}

function request(): Request {
  return new Request('https://app.test/api/llm/v1/chat/completions', { method: 'POST' });
}

describe('buildOrganizationPolicyGateResponse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a 403 naming the policy when the workspace has turned managed compute off', async () => {
    mockQuery
      .mockResolvedValueOnce([{ organization_id: ORG_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([policyRow({ allow_managed_compute: false })]);

    const response = await buildOrganizationPolicyGateResponse(
      'user-1',
      request() as never,
      DESCRIPTOR,
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);

    const body = await response!.json();
    expect(body.error.type).toBe('organization_policy');
    expect(body.error.code).toBe('managed_compute_disabled');
    expect(body.managed_compute.allowed).toBe(false);
    expect(body.managed_compute.organization_id).toBe(ORG_ID);
    // The kill-switch type must not be reused: a member who reads this needs to
    // know their administrator decided it, not that AGI is having an incident.
    expect(body.error.type).not.toBe('managed_compute_private_beta');
  });

  it('denies a developer surface the workspace has not enabled', async () => {
    mockQuery
      .mockResolvedValueOnce([{ organization_id: ORG_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        policyRow({
          allow_managed_compute: true,
          allowed_privacy_modes: ['local', 'byok', 'managed'],
          allow_cli_cloud_sync: false,
        }),
      ]);

    const response = await buildOrganizationPolicyGateResponse('user-1', request() as never, {
      ...DESCRIPTOR,
      surface: 'cli',
    });

    expect(response!.status).toBe(403);
    expect((await response!.json()).error.code).toBe('surface_sync_disabled');
  });

  it('passes a permitted request straight through', async () => {
    mockQuery
      .mockResolvedValueOnce([{ organization_id: ORG_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        policyRow({
          allow_managed_compute: true,
          allowed_privacy_modes: ['local', 'byok', 'managed'],
        }),
      ]);

    await expect(
      buildOrganizationPolicyGateResponse('user-1', request() as never, DESCRIPTOR),
    ).resolves.toBeNull();
  });

  it('passes a personal-scope request through without reading a policy', async () => {
    mockQuery.mockResolvedValue([]);

    await expect(
      buildOrganizationPolicyGateResponse('user-1', request() as never, DESCRIPTOR),
    ).resolves.toBeNull();
    const statements = mockQuery.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => sql.includes('organization_admin_policies'))).toBe(false);
  });

  it('passes through when the database is unreachable, so a fault is never shown as a denial', async () => {
    mockQuery.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      buildOrganizationPolicyGateResponse('user-1', request() as never, DESCRIPTOR),
    ).resolves.toBeNull();
  });

  it('carries the caller-supplied response headers onto the denial', async () => {
    mockQuery
      .mockResolvedValueOnce([{ organization_id: ORG_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([policyRow()]);

    const response = await buildOrganizationPolicyGateResponse(
      'user-1',
      request() as never,
      DESCRIPTOR,
      { 'X-AGI-Test-Header': 'present' },
    );

    expect(response!.headers.get('X-AGI-Test-Header')).toBe('present');
  });
});
