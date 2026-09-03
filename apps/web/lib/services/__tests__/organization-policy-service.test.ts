import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  defaultAdminPolicyFor,
  formatAdminPolicy,
  upsertOrganizationPolicy,
} from '../organization-policy-service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

type AdminPolicyRow = Parameters<typeof formatAdminPolicy>[0];

function policyRow(overrides: Record<string, unknown> = {}): AdminPolicyRow {
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
    retention_enforced: false,
    external_sharing_enabled: true,
    metadata: {},
    updated_at: '2026-08-22T00:00:00.000Z',
    ...overrides,
  } as AdminPolicyRow;
}

describe('formatAdminPolicy — secretHandling', () => {
  it('defaults to redact when metadata carries no explicit value', () => {
    const policy = formatAdminPolicy(policyRow());
    expect(policy.secretHandling).toBe('redact');
  });

  it('reads a saved secretHandling value out of metadata', () => {
    const policy = formatAdminPolicy(policyRow({ metadata: { secretHandling: 'warn' } }));
    expect(policy.secretHandling).toBe('warn');
  });

  it('falls back to redact when metadata holds an unrecognized value', () => {
    const policy = formatAdminPolicy(policyRow({ metadata: { secretHandling: 'delete' } }));
    expect(policy.secretHandling).toBe('redact');
  });
});

describe('defaultAdminPolicyFor', () => {
  it('defaults an unconfigured organization to redact', () => {
    expect(defaultAdminPolicyFor(ORGANIZATION_ID).secretHandling).toBe('redact');
  });
});

describe('upsertOrganizationPolicy — secretHandling', () => {
  let query: ReturnType<typeof vi.fn>;
  let db: DatabaseAdapter;

  beforeEach(() => {
    query = vi.fn();
    db = { query } as unknown as DatabaseAdapter;
  });

  it('merges secretHandling into the metadata jsonb column without dropping other metadata', async () => {
    query.mockResolvedValueOnce([policyRow({ metadata: { secretHandling: 'block' } })]);

    const input = {
      ...defaultAdminPolicyFor(ORGANIZATION_ID),
      secretHandling: 'block' as const,
      metadata: { note: 'kept' },
    };
    delete (input as { organizationId?: string }).organizationId;
    delete (input as { updatedAt?: string }).updatedAt;

    await upsertOrganizationPolicy(db, ORGANIZATION_ID, input);

    const params = query.mock.calls[0]?.[1] as unknown[];
    const writtenMetadata = JSON.parse(params[13] as string);
    expect(writtenMetadata).toEqual({ note: 'kept', secretHandling: 'block' });
  });
});
