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
    allow_memory: false,
    metadata: {},
    updated_at: '2026-08-22T00:00:00.000Z',
    ...overrides,
  } as AdminPolicyRow;
}

describe('formatAdminPolicy, secretHandling', () => {
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

describe('formatAdminPolicy, requireMfa and monthlySpendCapCents', () => {
  it('defaults requireMfa to false and the spend cap to unset', () => {
    const policy = formatAdminPolicy(policyRow());
    expect(policy.requireMfa).toBe(false);
    expect(policy.monthlySpendCapCents).toBeNull();
  });

  it('reads a saved requireMfa and monthlySpendCapCents out of metadata', () => {
    const policy = formatAdminPolicy(
      policyRow({ metadata: { requireMfa: true, monthlySpendCapCents: 50_000 } }),
    );
    expect(policy.requireMfa).toBe(true);
    expect(policy.monthlySpendCapCents).toBe(50_000);
  });

  it('treats a zero or negative spend cap in metadata as unset', () => {
    expect(
      formatAdminPolicy(policyRow({ metadata: { monthlySpendCapCents: 0 } })).monthlySpendCapCents,
    ).toBeNull();
    expect(
      formatAdminPolicy(policyRow({ metadata: { monthlySpendCapCents: -5 } })).monthlySpendCapCents,
    ).toBeNull();
  });
});

describe('formatAdminPolicy, zeroDataRetentionOnly', () => {
  it('defaults to false when metadata carries no explicit value', () => {
    expect(formatAdminPolicy(policyRow()).zeroDataRetentionOnly).toBe(false);
  });

  it('reads a saved zeroDataRetentionOnly value out of metadata', () => {
    expect(
      formatAdminPolicy(policyRow({ metadata: { zeroDataRetentionOnly: true } }))
        .zeroDataRetentionOnly,
    ).toBe(true);
  });
});

describe('formatAdminPolicy, ipAllowList', () => {
  it('defaults to an empty array when metadata carries no explicit value', () => {
    expect(formatAdminPolicy(policyRow()).ipAllowList).toEqual([]);
  });

  it('reads a saved ipAllowList out of metadata', () => {
    expect(
      formatAdminPolicy(policyRow({ metadata: { ipAllowList: ['203.0.113.0/24'] } })).ipAllowList,
    ).toEqual(['203.0.113.0/24']);
  });

  it('drops non-string entries rather than throwing', () => {
    expect(
      formatAdminPolicy(policyRow({ metadata: { ipAllowList: ['203.0.113.0/24', 5, null] } }))
        .ipAllowList,
    ).toEqual(['203.0.113.0/24']);
  });

  it('treats a non-array value as an empty list', () => {
    expect(
      formatAdminPolicy(policyRow({ metadata: { ipAllowList: 'not-an-array' } })).ipAllowList,
    ).toEqual([]);
  });
});

describe('formatAdminPolicy, allowMemory', () => {
  it('defaults to false, matching the column default', () => {
    expect(formatAdminPolicy(policyRow()).allowMemory).toBe(false);
  });

  it('reads a saved allowMemory value off the column, not metadata', () => {
    expect(formatAdminPolicy(policyRow({ allow_memory: true, metadata: {} })).allowMemory).toBe(
      true,
    );
  });
});

describe('defaultAdminPolicyFor', () => {
  it('defaults an unconfigured organization to redact', () => {
    expect(defaultAdminPolicyFor(ORGANIZATION_ID).secretHandling).toBe('redact');
  });

  it('defaults an unconfigured organization to no mfa requirement and no spend cap', () => {
    const policy = defaultAdminPolicyFor(ORGANIZATION_ID);
    expect(policy.requireMfa).toBe(false);
    expect(policy.monthlySpendCapCents).toBeNull();
  });

  it('defaults an unconfigured organization to zero data retention off', () => {
    expect(defaultAdminPolicyFor(ORGANIZATION_ID).zeroDataRetentionOnly).toBe(false);
  });

  it('defaults an unconfigured organization to no ip restriction', () => {
    expect(defaultAdminPolicyFor(ORGANIZATION_ID).ipAllowList).toEqual([]);
  });
});

describe('upsertOrganizationPolicy, secretHandling', () => {
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
    const writtenMetadata = JSON.parse(params[14] as string);
    expect(writtenMetadata).toMatchObject({ note: 'kept', secretHandling: 'block' });
  });
});

describe('upsertOrganizationPolicy, requireMfa and monthlySpendCapCents', () => {
  let query: ReturnType<typeof vi.fn>;
  let db: DatabaseAdapter;

  beforeEach(() => {
    query = vi.fn();
    db = { query } as unknown as DatabaseAdapter;
  });

  it('merges requireMfa and monthlySpendCapCents into the metadata jsonb column', async () => {
    query.mockResolvedValueOnce([
      policyRow({ metadata: { requireMfa: true, monthlySpendCapCents: 25_000 } }),
    ]);

    const input = {
      ...defaultAdminPolicyFor(ORGANIZATION_ID),
      requireMfa: true,
      monthlySpendCapCents: 25_000,
    };
    delete (input as { organizationId?: string }).organizationId;
    delete (input as { updatedAt?: string }).updatedAt;

    await upsertOrganizationPolicy(db, ORGANIZATION_ID, input);

    const params = query.mock.calls[0]?.[1] as unknown[];
    const writtenMetadata = JSON.parse(params[14] as string);
    expect(writtenMetadata).toMatchObject({ requireMfa: true, monthlySpendCapCents: 25_000 });
  });

  it('writes a null spend cap when the administrator clears it', async () => {
    query.mockResolvedValueOnce([policyRow({ metadata: { monthlySpendCapCents: null } })]);

    const input = { ...defaultAdminPolicyFor(ORGANIZATION_ID), monthlySpendCapCents: null };
    delete (input as { organizationId?: string }).organizationId;
    delete (input as { updatedAt?: string }).updatedAt;

    await upsertOrganizationPolicy(db, ORGANIZATION_ID, input);

    const params = query.mock.calls[0]?.[1] as unknown[];
    const writtenMetadata = JSON.parse(params[14] as string);
    expect(writtenMetadata['monthlySpendCapCents']).toBeNull();
  });
});

describe('upsertOrganizationPolicy, zeroDataRetentionOnly', () => {
  let query: ReturnType<typeof vi.fn>;
  let db: DatabaseAdapter;

  beforeEach(() => {
    query = vi.fn();
    db = { query } as unknown as DatabaseAdapter;
  });

  it('merges zeroDataRetentionOnly into the metadata jsonb column', async () => {
    query.mockResolvedValueOnce([policyRow({ metadata: { zeroDataRetentionOnly: true } })]);

    const input = { ...defaultAdminPolicyFor(ORGANIZATION_ID), zeroDataRetentionOnly: true };
    delete (input as { organizationId?: string }).organizationId;
    delete (input as { updatedAt?: string }).updatedAt;

    await upsertOrganizationPolicy(db, ORGANIZATION_ID, input);

    const params = query.mock.calls[0]?.[1] as unknown[];
    const writtenMetadata = JSON.parse(params[14] as string);
    expect(writtenMetadata).toMatchObject({ zeroDataRetentionOnly: true });
  });
});

describe('upsertOrganizationPolicy, ipAllowList', () => {
  let query: ReturnType<typeof vi.fn>;
  let db: DatabaseAdapter;

  beforeEach(() => {
    query = vi.fn();
    db = { query } as unknown as DatabaseAdapter;
  });

  it('merges ipAllowList into the metadata jsonb column', async () => {
    query.mockResolvedValueOnce([policyRow({ metadata: { ipAllowList: ['203.0.113.0/24'] } })]);

    const input = {
      ...defaultAdminPolicyFor(ORGANIZATION_ID),
      ipAllowList: ['203.0.113.0/24'],
    };
    delete (input as { organizationId?: string }).organizationId;
    delete (input as { updatedAt?: string }).updatedAt;

    await upsertOrganizationPolicy(db, ORGANIZATION_ID, input);

    const params = query.mock.calls[0]?.[1] as unknown[];
    const writtenMetadata = JSON.parse(params[14] as string);
    expect(writtenMetadata).toMatchObject({ ipAllowList: ['203.0.113.0/24'] });
  });
});

describe('upsertOrganizationPolicy, allowMemory', () => {
  let query: ReturnType<typeof vi.fn>;
  let db: DatabaseAdapter;

  beforeEach(() => {
    query = vi.fn();
    db = { query } as unknown as DatabaseAdapter;
  });

  it('writes allowMemory as its own column, not into metadata', async () => {
    query.mockResolvedValueOnce([policyRow({ allow_memory: true })]);

    const input = { ...defaultAdminPolicyFor(ORGANIZATION_ID), allowMemory: true };
    delete (input as { organizationId?: string }).organizationId;
    delete (input as { updatedAt?: string }).updatedAt;

    await upsertOrganizationPolicy(db, ORGANIZATION_ID, input);

    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(params[13]).toBe(true);
    const writtenMetadata = JSON.parse(params[14] as string);
    expect(writtenMetadata['allowMemory']).toBeUndefined();
  });
});
