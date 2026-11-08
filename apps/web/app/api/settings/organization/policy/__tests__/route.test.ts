import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/security-audit');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/request-context-cache', () => ({
  getCachedActiveOrganizationId: vi.fn(async () => undefined),
  setCachedActiveOrganizationId: vi.fn(async () => undefined),
}));

const {
  mockQuery,
  mockGetUserScopedDb,
  mockRecordAuditEvent,
  mockRequireTeamAdminAccess,
  mockResolveMfaEnrolled,
  mockGetIdentityUser,
  mockEnrollmentCacheGet,
  mockEnrollmentCacheSet,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetUserScopedDb: vi.fn(),
  mockRecordAuditEvent: vi.fn(async (_event: unknown) => undefined),
  mockRequireTeamAdminAccess: vi.fn(async () => ({ plan: 'team', canManageTeam: true })),
  mockResolveMfaEnrolled: vi.fn<ImportedModule0>(async () => true),
  mockGetIdentityUser: vi.fn(),
  mockEnrollmentCacheGet: vi.fn(),
  mockEnrollmentCacheSet: vi.fn(async () => undefined),
}));

const currentRole = vi.hoisted(() => ({ value: 'admin' as string }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/security-audit', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return { ...actual, recordAuditEvent: mockRecordAuditEvent };
});
vi.mock('@/lib/mfa-policy-gate', () => ({ resolveMfaEnrolled: mockResolveMfaEnrolled }));
vi.mock('@/lib/server/identity', async (importOriginal) => {
  const actual = await importOriginal<ImportedModule1>();
  return { ...actual, getIdentityUser: mockGetIdentityUser };
});
vi.mock('@/lib/server/key-value', async (importOriginal) => {
  const actual = await importOriginal<ImportedModule2>();
  return {
    ...actual,
    getKeyValueStore: vi.fn(() => ({
      get: mockEnrollmentCacheGet,
      set: mockEnrollmentCacheSet,
    })),
  };
});
vi.mock('@/lib/services/organization-permission-service', () => ({
  resolveOrganizationPermissions: vi.fn(async () => {
    const role = currentRole.value;
    if (role === 'owner' || role === 'admin') return new Set(['content.read', 'policy.manage']);
    return new Set(role === 'member' ? ['content.read', 'content.share'] : ['content.read']);
  }),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mockRequireTeamAdminAccess,
}));

import { GET, PATCH } from '../route';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveOrganizationPermissions } from '@/lib/services/organization-permission-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
import {
  clearIpAllowListCacheForTests,
  getCachedIpAllowList,
  setCachedIpAllowList,
} from '@/lib/services/organization-ip-allow-list-cache';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

const SAVED_POLICY = {
  organization_id: ORG_ID,
  default_privacy_mode: 'managed',
  allowed_privacy_modes: ['local', 'byok', 'managed'],
  allow_managed_compute: true,
  require_local_to_byok_preview: true,
  chat_sync_surfaces: ['web', 'desktop', 'mobile'],
  allow_cli_cloud_sync: false,
  allow_vscode_cloud_sync: false,
  allow_chrome_cloud_sync: false,
  audit_export_enabled: true,
  retention_days: 365,
  allow_memory: false,
  metadata: {},
  updated_at: '2026-08-22T00:00:00.000Z',
};

interface Fixture {
  role?: 'owner' | 'admin' | 'member' | 'viewer';
  policyRow?: Record<string, unknown> | null;
  upsertResult?: Record<string, unknown>;
  revision?: number;
}

function bindCaller({
  role = 'admin',
  policyRow = null,
  upsertResult,
  revision = 0,
}: Fixture = {}): void {
  currentRole.value = role;
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) return [{ organization_id: ORG_ID }];
    if (/from public\.organization_policy_revisions/i.test(text)) return [{ revision }];
    if (/from public\.organization_members/i.test(text)) {
      return [{ organization_id: ORG_ID, role }];
    }
    if (/insert into public\.organization_admin_policies/i.test(text)) {
      return [upsertResult ?? SAVED_POLICY];
    }
    if (/from public\.organization_admin_policies/i.test(text)) {
      return policyRow ? [policyRow] : [];
    }
    return [];
  });
}

function request(body?: unknown, extraHeaders: Record<string, string> = {}): Request {
  return new Request('https://app.test/api/settings/organization/policy', {
    method: body ? 'PATCH' : 'GET',
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json', ...extraHeaders },
        }
      : { headers: extraHeaders }),
  });
}

function upsertParams(): unknown[] {
  const call = mockQuery.mock.calls.find((entry) =>
    /insert into public\.organization_admin_policies/i.test(String(entry[0])),
  );
  return (call?.[1] ?? []) as unknown[];
}

describe('GET /api/settings/organization/policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: (...args: unknown[]) => mockQuery(...args) },
      userId: 'user-1',
      organizationId: ORG_ID,
    });
  });

  it('reports an unconfigured workspace as unconfigured rather than as governed defaults', async () => {
    bindCaller({ policyRow: null });

    const body = await (await GET(request() as never)).json();

    expect(body.configured).toBe(false);
    expect(body.organizationId).toBe(ORG_ID);
    expect(body.policy.allowManagedCompute).toBe(false);
  });

  it('returns the saved policy when one exists', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const body = await (await GET(request() as never)).json();

    expect(body.configured).toBe(true);
    expect(body.policy.allowManagedCompute).toBe(true);
    expect(body.policy.allowedPrivacyModes).toEqual(['local', 'byok', 'managed']);
  });

  it('defaults secretHandling to redact when the saved metadata has no explicit value', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const body = await (await GET(request() as never)).json();

    expect(body.policy.secretHandling).toBe('redact');
  });

  it('defaults zeroDataRetentionOnly to false when the saved metadata has no explicit value', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const body = await (await GET(request() as never)).json();

    expect(body.policy.zeroDataRetentionOnly).toBe(false);
  });

  it('defaults ipAllowList to an empty array when the saved metadata has no explicit value', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const body = await (await GET(request() as never)).json();

    expect(body.policy.ipAllowList).toEqual([]);
  });

  it('lets a member read the policy but not manage it', async () => {
    bindCaller({ role: 'member', policyRow: SAVED_POLICY });

    const body = await (await GET(request() as never)).json();

    expect(body.canManagePolicy).toBe(false);
    expect(body.currentUserRole).toBe('member');
  });

  it('passes the mfa gate owner exemption through to getUserScopedDb', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await GET(request() as never);

    expect(mockGetUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaGateExemptForOwner: true,
    });
  });
});

describe('PATCH /api/settings/organization/policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AGI_AUTHENTICATOR_ENROLLMENT', '1');
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: (...args: unknown[]) => mockQuery(...args) },
      userId: 'user-1',
      organizationId: ORG_ID,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses a member', async () => {
    bindCaller({ role: 'member', policyRow: SAVED_POLICY });

    const response = await PATCH(request({ retentionDays: 30 }) as never);

    expect(response.status).toBe(403);
    expect(upsertParams()).toEqual([]);
  });

  it('lets only the Owner turn on fast mode', async () => {
    bindCaller({ role: 'admin', policyRow: SAVED_POLICY });
    const refused = await PATCH(
      request({ controls: { featureAccess: { fast_mode: true } } }) as never,
    );
    expect(refused.status).toBe(403);
    expect(upsertParams()).toEqual([]);

    bindCaller({ role: 'owner', policyRow: SAVED_POLICY });
    const allowed = await PATCH(
      request({ controls: { featureAccess: { fast_mode: true } } }) as never,
    );
    expect(allowed.status).toBe(200);
    expect(upsertParams()).not.toEqual([]);
  });

  it('lets an admin turn fast mode off', async () => {
    bindCaller({
      role: 'admin',
      policyRow: {
        ...SAVED_POLICY,
        metadata: { controls: { featureAccess: { fast_mode: true } } },
      },
    });

    const response = await PATCH(
      request({ controls: { featureAccess: { fast_mode: false } } }) as never,
    );

    expect(response.status).toBe(200);
  });

  it('merges a partial patch onto the SAVED policy, never onto the table defaults', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(request({ retentionDays: 30 }) as never);

    const params = upsertParams();
    // allow_managed_compute is parameter 4 (1-indexed $4) and must survive a
    // patch that never mentioned it. Inheriting the column default here would
    // silently switch managed compute off for the whole workspace.
    expect(params[3]).toBe(true);
    expect(params[2]).toEqual(['local', 'byok', 'managed']);
    expect(params[10]).toBe(30);
  });

  it('rejects a default privacy mode that is not in the allowed set', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(
      request({ defaultPrivacyMode: 'managed', allowedPrivacyModes: ['local'] }) as never,
    );

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('rejects turning on managed compute while the managed privacy mode stays disallowed', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(
      request({
        allowManagedCompute: true,
        allowedPrivacyModes: ['local', 'byok'],
        defaultPrivacyMode: 'byok',
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('rejects a body with no policy fields', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    expect((await PATCH(request({}) as never)).status).toBe(400);
  });

  it('rejects a retention window outside the schema bounds', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    expect((await PATCH(request({ retentionDays: 0 }) as never)).status).toBe(400);
    expect((await PATCH(request({ retentionDays: 4000 }) as never)).status).toBe(400);
  });

  it('writes an audit event naming the fields that changed', async () => {
    bindCaller({
      policyRow: SAVED_POLICY,
      upsertResult: { ...SAVED_POLICY, retention_days: 30 },
    });

    await PATCH(request({ retentionDays: 30 }) as never);

    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    const event = mockRecordAuditEvent.mock.calls[0]?.[0] as {
      eventType: string;
      organizationId: string;
      detail: { changedKeys: string[]; status: string };
    };
    expect(event.eventType).toBe('admin_policy_changed');
    expect(event.organizationId).toBe(ORG_ID);
    expect(event.detail.changedKeys).toEqual(['retentionDays']);
    expect(event.detail.status).toBe('updated');
  });

  it('marks the first save as a creation', async () => {
    bindCaller({ policyRow: null });

    await PATCH(request({ allowManagedCompute: false }) as never);

    const event = mockRecordAuditEvent.mock.calls[0]?.[0] as { detail: { status: string } };
    expect(event.detail.status).toBe('created');
  });

  it('stores an allowMemory patch as its own column, not metadata', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(request({ allowMemory: true }) as never);

    const params = upsertParams();
    expect(params[13]).toBe(true);
    expect(JSON.parse(params[14] as string)['allowMemory']).toBeUndefined();
  });

  it('stores a secretHandling patch inside the metadata column', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(request({ secretHandling: 'block' }) as never);

    const params = upsertParams();
    expect(JSON.parse(params[14] as string)).toMatchObject({ secretHandling: 'block' });
  });

  it('rejects a secretHandling value outside warn, redact, block', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(request({ secretHandling: 'ignore' }) as never);

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('stores a requireMfa and monthlySpendCapCents patch inside the metadata column', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(request({ requireMfa: true, monthlySpendCapCents: 75_000 }) as never);

    const params = upsertParams();
    expect(JSON.parse(params[14] as string)).toMatchObject({
      requireMfa: true,
      monthlySpendCapCents: 75_000,
    });
  });

  it('clears a saved spend cap when the administrator patches it to null', async () => {
    bindCaller({
      policyRow: { ...SAVED_POLICY, metadata: { monthlySpendCapCents: 50_000 } },
    });

    await PATCH(request({ monthlySpendCapCents: null }) as never);

    const params = upsertParams();
    expect(JSON.parse(params[14] as string)).toMatchObject({ monthlySpendCapCents: null });
  });

  it('rejects a zero or negative spend cap', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(request({ monthlySpendCapCents: 0 }) as never);

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('stores a zeroDataRetentionOnly patch inside the metadata column', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(request({ zeroDataRetentionOnly: true }) as never);

    const params = upsertParams();
    expect(JSON.parse(params[14] as string)).toMatchObject({ zeroDataRetentionOnly: true });
  });

  it('stores an ipAllowList patch inside the metadata column', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(
      request(
        { ipAllowList: ['203.0.113.0/24', '2001:db8::/32'] },
        { 'x-forwarded-for': '203.0.113.5' },
      ) as never,
    );

    const params = upsertParams();
    expect(JSON.parse(params[14] as string)).toMatchObject({
      ipAllowList: ['203.0.113.0/24', '2001:db8::/32'],
    });
  });

  it("rejects an ipAllowList that would exclude the requester's own connection", async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(
      request({ ipAllowList: ['203.0.113.0/24'] }, { 'x-forwarded-for': '198.51.100.9' }) as never,
    );

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it("rejects an ipAllowList when the requester's ip cannot be determined", async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(request({ ipAllowList: ['203.0.113.0/24'] }) as never);

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('rejects requireMfa=true when the requesting admin has no mfa enrolled', async () => {
    bindCaller({ policyRow: SAVED_POLICY });
    mockResolveMfaEnrolled.mockResolvedValueOnce(false);

    const response = await PATCH(request({ requireMfa: true }) as never);

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('refuses to start requiring mfa while members cannot enrol an authenticator', async () => {
    vi.stubEnv('AGI_AUTHENTICATOR_ENROLLMENT', '');
    bindCaller({ policyRow: SAVED_POLICY });
    mockResolveMfaEnrolled.mockResolvedValueOnce(true);

    const response = await PATCH(request({ requireMfa: true }) as never);

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toMatch(
      /requiring multi-factor authentication is temporarily unavailable/i,
    );
    expect(upsertParams()).toEqual([]);
  });

  it('allows requireMfa=true when the requesting admin is mfa enrolled', async () => {
    bindCaller({ policyRow: SAVED_POLICY });
    mockResolveMfaEnrolled.mockResolvedValueOnce(true);

    const response = await PATCH(request({ requireMfa: true }) as never);

    expect(response.status).toBe(200);
  });

  it('passes the mfa gate owner exemption through to getUserScopedDb', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(request({ retentionDays: 45 }) as never);

    expect(mockGetUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaGateExemptForOwner: true,
    });
  });

  it('rejects an ipAllowList entry that is not a valid address or CIDR', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(request({ ipAllowList: ['not-an-address'] }) as never);

    expect(response.status).toBe(400);
    expect(upsertParams()).toEqual([]);
  });

  it('clears a saved ip allow list when the administrator patches it to empty', async () => {
    bindCaller({
      policyRow: { ...SAVED_POLICY, metadata: { ipAllowList: ['203.0.113.0/24'] } },
    });

    await PATCH(request({ ipAllowList: [] }) as never);

    const params = upsertParams();
    expect(JSON.parse(params[14] as string)).toMatchObject({ ipAllowList: [] });
  });

  it('records the before and after ip allow list ranges on the audit event', async () => {
    bindCaller({
      policyRow: { ...SAVED_POLICY, metadata: { ipAllowList: ['203.0.113.0/24'] } },
      upsertResult: {
        ...SAVED_POLICY,
        metadata: { ipAllowList: ['203.0.113.0/24', '2001:db8::/32'] },
      },
    });

    await PATCH(
      request(
        { ipAllowList: ['203.0.113.0/24', '2001:db8::/32'] },
        { 'x-forwarded-for': '203.0.113.5' },
      ) as never,
    );

    const event = mockRecordAuditEvent.mock.calls[0]?.[0] as {
      detail: { ipAllowListBefore?: string[]; ipAllowListAfter?: string[] };
    };
    expect(event.detail.ipAllowListBefore).toEqual(['203.0.113.0/24']);
    expect(event.detail.ipAllowListAfter).toEqual(['203.0.113.0/24', '2001:db8::/32']);
  });

  it('deduplicates repeated modes and surfaces before writing', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(
      request({
        allowedPrivacyModes: ['local', 'local', 'byok'],
        defaultPrivacyMode: 'byok',
        allowManagedCompute: false,
        chatSyncSurfaces: ['web', 'web'],
      }) as never,
    );

    const params = upsertParams();
    expect(params[2]).toEqual(['local', 'byok']);
    expect(params[5]).toEqual(['web']);
  });

  it('stores feature controls inside the metadata column, merged onto the saved switches', async () => {
    bindCaller({
      policyRow: {
        ...SAVED_POLICY,
        metadata: { controls: { featureAccess: { research: false } } },
      },
    });

    const response = await PATCH(
      request({
        controls: { featureAccess: { code: false }, maxReasoningEffort: 'medium' },
      }) as never,
    );

    expect(response.status).toBe(200);
    const controls = JSON.parse(upsertParams()[14] as string)['controls'];
    expect(controls.featureAccess).toMatchObject({ code: false, research: false, work: true });
    expect(controls.maxReasoningEffort).toBe('medium');
  });

  it('rejects a default model that is not in the model catalog', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(
      request({ controls: { defaultModelId: 'not-a-real-model-anywhere' } }) as never,
    );

    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringMatching(/insert into public\.organization_admin_policies/i),
      expect.anything(),
    );
  });

  it('rejects a feature the control plane does not model', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    const response = await PATCH(
      request({ controls: { featureAccess: { teleport: false } } }) as never,
    );

    expect(response.status).toBe(400);
  });

  it('upper-cases and sorts allowed countries before writing', async () => {
    bindCaller({ policyRow: SAVED_POLICY });

    await PATCH(request({ controls: { allowedCountries: ['us', 'DE', 'us'] } }) as never);

    expect(JSON.parse(upsertParams()[14] as string)['controls'].allowedCountries).toEqual([
      'DE',
      'US',
    ]);
  });

  it('preserves active-empty state on unrelated edits but honors an explicit empty-list reset', async () => {
    bindCaller({
      policyRow: {
        ...SAVED_POLICY,
        metadata: { controls: { allowedCountries: [], countryRestrictionActive: true } },
      },
    });
    const response = await PATCH(request({ controls: { maxReasoningEffort: 'low' } }) as never);
    expect(response.status).toBe(200);
    expect(JSON.parse(upsertParams()[14] as string).controls).toMatchObject({
      allowedCountries: [],
      countryRestrictionActive: true,
    });
    mockQuery.mockClear();
    const cleared = await PATCH(request({ controls: { allowedCountries: [] } }) as never);
    expect(cleared.status).toBe(200);
    expect(JSON.parse(upsertParams()[14] as string).controls).toMatchObject({
      allowedCountries: [],
      countryRestrictionActive: false,
    });
  });

  it('does not expose derived restriction state as an administrator write field', async () => {
    bindCaller({ policyRow: SAVED_POLICY });
    const response = await PATCH(
      request({ controls: { countryRestrictionActive: true } }) as never,
    );
    expect(response.status).toBe(400);
  });

  it('refuses a viewer', async () => {
    bindCaller({ role: 'viewer', policyRow: SAVED_POLICY });

    const response = await PATCH(request({ controls: { featureAccess: { code: true } } }) as never);

    expect(response.status).toBe(403);
  });
});

describe('optimistic concurrency on policy writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: (...args: unknown[]) => mockQuery(...args) },
      userId: 'user-1',
      organizationId: ORG_ID,
    });
  });

  it('hands the reader the revision it must send back', async () => {
    bindCaller({ policyRow: SAVED_POLICY, revision: 7 });

    const response = await GET(request() as never);

    expect((await response.json()).revision).toBe(7);
    expect(response.headers.get('ETag')).toBe('W/"wsrev-7"');
  });

  it('refuses a write against a revision another administrator has moved past', async () => {
    bindCaller({ policyRow: SAVED_POLICY, revision: 8 });

    const response = await PATCH(
      request({ allowMemory: false }, { 'If-Match': 'W/"wsrev-7"' }) as never,
    );

    expect(response.status).toBe(409);
    expect(
      mockQuery.mock.calls.some(([sql]) =>
        /insert into public\.organization_admin_policies/i.test(String(sql)),
      ),
    ).toBe(false);
  });

  it('accepts a write whose revision is still current and reports the new one', async () => {
    bindCaller({ policyRow: SAVED_POLICY, revision: 8 });

    const response = await PATCH(
      request({ allowMemory: false }, { 'If-Match': 'W/"wsrev-8"' }) as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('ETag')).toBe('W/"wsrev-8"');
  });

  it('still accepts a client that states no revision, so nothing existing breaks', async () => {
    bindCaller({ policyRow: SAVED_POLICY, revision: 8 });

    const response = await PATCH(request({ allowMemory: false }) as never);

    expect(response.status).toBe(200);
  });

  it('refuses an If-Match this endpoint never issued instead of ignoring it', async () => {
    bindCaller({ policyRow: SAVED_POLICY, revision: 8 });

    const response = await PATCH(
      request({ allowMemory: false }, { 'If-Match': '"deadbeef"' }) as never,
    );

    expect(response.status).toBe(400);
  });
});

// UNRUN: auth and database effects are fixtures; this does not prove auth/RLS binding.
// Membership, policy mapping/merge, validation, and cache eviction use production code.
const CAPTURED_ORG = '22222222-2222-4222-8222-222222222222';
const CAPTURED_USER = 'captured-user';
const SAVED_ORG = ORG_ID;

type ScopedRow = Record<string, unknown>;

function bindCapturedScope(
  options: {
    organizationId?: string | null;
    membership?: 'active' | 'absent' | 'mismatched';
    role?: 'owner' | 'admin' | 'member';
    entitled?: boolean;
    canManage?: boolean;
    sessionIdentity?: { subject: string; sessionId: string | null };
  } = {},
) {
  const rows = new Map<string, ScopedRow>([
    [
      SAVED_ORG,
      {
        organization_id: SAVED_ORG,
        default_privacy_mode: 'local',
        allowed_privacy_modes: ['local'],
        allow_managed_compute: false,
        require_local_to_byok_preview: true,
        chat_sync_surfaces: ['web'],
        allow_cli_cloud_sync: false,
        allow_vscode_cloud_sync: false,
        allow_chrome_cloud_sync: false,
        audit_export_enabled: true,
        retention_days: 11,
        retention_enforced: false,
        external_sharing_enabled: false,
        allow_memory: false,
        metadata: { marker: 'A', codeControls: { allowGithubConnection: false } },
        updated_at: '2026-11-01T00:00:00.000Z',
      },
    ],
    [
      CAPTURED_ORG,
      {
        organization_id: CAPTURED_ORG,
        default_privacy_mode: 'managed',
        allowed_privacy_modes: ['local', 'byok', 'managed'],
        allow_managed_compute: true,
        require_local_to_byok_preview: true,
        chat_sync_surfaces: ['web', 'desktop'],
        allow_cli_cloud_sync: true,
        allow_vscode_cloud_sync: true,
        allow_chrome_cloud_sync: true,
        audit_export_enabled: true,
        retention_days: 222,
        retention_enforced: false,
        external_sharing_enabled: true,
        allow_memory: true,
        metadata: { marker: 'B', codeControls: { allowGithubConnection: true } },
        updated_at: '2026-11-02T00:00:00.000Z',
      },
    ],
  ]);
  const revisions = new Map([
    [SAVED_ORG, 3],
    [CAPTURED_ORG, 9],
  ]);
  const originalA = JSON.stringify(rows.get(SAVED_ORG));
  const query = mockQuery;
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/from public\.user_settings/i.test(sql)) return [{ organization_id: SAVED_ORG }];
    if (/from public\.organization_members/i.test(sql)) {
      expect(sql).toMatch(/organization_id = \$1 and user_id = \$2/);
      expect(sql).toMatch(/status = 'active'/);
      if (params[1] !== CAPTURED_USER) return [];
      if (params[0] === SAVED_ORG) return [{ organization_id: SAVED_ORG, role: 'owner' }];
      if (params[0] !== CAPTURED_ORG || options.membership === 'absent') return [];
      return [
        {
          organization_id: options.membership === 'mismatched' ? SAVED_ORG : CAPTURED_ORG,
          role: options.role ?? 'admin',
        },
      ];
    }
    const organizationId = String(params[0]);
    if (/insert into public\.organization_admin_policies/i.test(sql)) {
      const columns = [
        'organization_id',
        'default_privacy_mode',
        'allowed_privacy_modes',
        'allow_managed_compute',
        'require_local_to_byok_preview',
        'chat_sync_surfaces',
        'allow_cli_cloud_sync',
        'allow_vscode_cloud_sync',
        'allow_chrome_cloud_sync',
        'audit_export_enabled',
        'retention_days',
        'retention_enforced',
        'external_sharing_enabled',
        'allow_memory',
      ];
      const row = {
        ...rows.get(organizationId),
        ...Object.fromEntries(columns.map((column, index) => [column, params[index]])),
        metadata: JSON.parse(params[14] as string),
      };
      rows.set(organizationId, row);
      // Simulate the database revision trigger, not a production trigger test.
      revisions.set(organizationId, (revisions.get(organizationId) ?? 0) + 1);
      return [row];
    }
    if (/from public\.organization_admin_policies/i.test(sql)) {
      const row = rows.get(organizationId);
      return row ? [{ ...row, revision: revisions.get(organizationId), override_count: 1 }] : [];
    }
    if (/from public\.organization_policy_revisions/i.test(sql)) {
      return [{ revision: revisions.get(organizationId) }];
    }
    throw new Error(`Unexpected scoped fixture SQL: ${sql}`);
  });
  const db = { query };
  vi.mocked(getUserScopedDb).mockResolvedValue({
    db,
    userId: CAPTURED_USER,
    organizationId: options.organizationId === undefined ? CAPTURED_ORG : options.organizationId,
    ...(options.sessionIdentity ? { sessionIdentity: options.sessionIdentity } : {}),
  } as never);
  vi.mocked(requireTeamAdminAccess).mockImplementation(async (scopedDb, userId, orgId) => {
    expect(scopedDb).toBe(db);
    expect(userId).toBe(CAPTURED_USER);
    if (orgId === CAPTURED_ORG && options.entitled === false) {
      throw createError.forbidden('Captured workspace has no eligible subscription');
    }
    return {
      plan: 'team',
      canManageTeam: true,
      maxMembers: null,
      seatsConsumed: null,
      seatsAvailable: null,
      seatSource: 'unknown',
    };
  });
  vi.mocked(resolveOrganizationPermissions).mockImplementation(async (orgId, userId) => {
    expect(userId).toBe(CAPTURED_USER);
    return new Set(
      orgId === CAPTURED_ORG && options.canManage === false
        ? ['content.read']
        : ['content.read', 'policy.manage'],
    );
  });

  setCachedIpAllowList(SAVED_ORG, ['192.0.2.1']);
  setCachedIpAllowList(CAPTURED_ORG, ['198.51.100.1']);
  return {
    db,
    rows,
    revisions,
    assertAUnchanged() {
      expect(JSON.stringify(rows.get(SAVED_ORG))).toBe(originalA);
      expect(revisions.get(SAVED_ORG)).toBe(3);
      expect(getCachedIpAllowList(SAVED_ORG)).toEqual(['192.0.2.1']);
      expect(
        query.mock.calls.some(([sql]) => /from public\.user_settings/i.test(String(sql))),
      ).toBe(false);
      for (const [sql, params] of query.mock.calls) {
        if (/public\.organization_(members|admin_policies|policy_revisions)/i.test(String(sql))) {
          expect(params?.[0]).toBe(CAPTURED_ORG);
        }
      }
    },
    assertNoWrite() {
      expect(query.mock.calls.some(([sql]) => /insert into/i.test(String(sql)))).toBe(false);
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
      expect(getCachedIpAllowList(CAPTURED_ORG)).toEqual(['198.51.100.1']);
    },
  };
}

function scopedRequest(
  method: 'GET' | 'PATCH',
  explicit: boolean,
  body: Record<string, unknown> = { retentionDays: 30 },
  extraHeaders: Record<string, string> = {},
) {
  return new NextRequest('https://app.test/api/settings/organization/policy', {
    method,
    headers: {
      ...(explicit ? { [MANAGED_CLOUD_ORGANIZATION_HEADER]: CAPTURED_ORG } : {}),
      ...(method === 'PATCH' ? { 'content-type': 'application/json' } : {}),
      ...extraHeaders,
    },
    ...(method === 'PATCH' ? { body: JSON.stringify(body) } : {}),
  });
}

describe('native policy preflight (real MFA resolver; admitted auth/provider/DB mocked; UNRUN)', () => {
  const nativeSubject = 'native-captured-subject';
  const forgedSubject = 'forged-enrolled-subject';

  function forgedMfaRequest(body: Record<string, unknown> = { requireMfa: true }) {
    return scopedRequest(
      'PATCH',
      true,
      {
        ...body,
        userId: forgedSubject,
        subject: forgedSubject,
        sessionIdentity: { subject: forgedSubject, sessionId: 'forged-session' },
      },
      {
        'x-user-id': forgedSubject,
        'x-session-id': 'forged-session',
        'x-identity-subject': forgedSubject,
      },
    );
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    clearIpAllowListCacheForTests();
    vi.stubEnv('AGI_AUTHENTICATOR_ENROLLMENT', '1');
    vi.mocked(requireCsrfToken).mockResolvedValue(null);
    vi.mocked(withRateLimit).mockResolvedValue(null);
    const actual = await vi.importActual<ImportedModule3>('@/lib/mfa-policy-gate');
    mockResolveMfaEnrolled.mockReset().mockImplementation(actual.resolveMfaEnrolled);
    mockGetIdentityUser.mockReset();
    mockEnrollmentCacheGet.mockReset().mockResolvedValue('enrolled');
    mockEnrollmentCacheSet.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    mockResolveMfaEnrolled.mockReset().mockResolvedValue(true);
    vi.unstubAllEnvs();
    clearIpAllowListCacheForTests();
  });

  for (const subject of [nativeSubject, CAPTURED_USER]) {
    it(`allows exact enrolled ${subject === CAPTURED_USER ? 'equal-ID' : 'mapped-ID'} native identity despite forged request evidence`, async () => {
      const sessionIdentity = { subject, sessionId: 'captured-session' };
      const state = bindCapturedScope({ role: 'owner', sessionIdentity });
      mockGetIdentityUser.mockImplementation(async (requestedSubject: string) =>
        requestedSubject === subject ? { id: subject, twoFactorEnabled: true } : null,
      );
      mockEnrollmentCacheGet.mockResolvedValue('unenrolled');

      const response = await PATCH(forgedMfaRequest());

      expect(response.status).toBe(200);
      expect(mockResolveMfaEnrolled).toHaveBeenCalledWith(CAPTURED_USER, sessionIdentity);
      expect(mockGetIdentityUser).toHaveBeenCalledExactlyOnceWith(subject);
      expect(mockEnrollmentCacheGet).not.toHaveBeenCalled();
      expect(mockEnrollmentCacheSet).not.toHaveBeenCalled();
      expect(state.rows.get(CAPTURED_ORG)?.['metadata']).toMatchObject({ requireMfa: true });
      expect(state.revisions.get(CAPTURED_ORG)).toBe(10);
      expect(getCachedIpAllowList(CAPTURED_ORG)).toBeUndefined();
      expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
      state.assertAUnchanged();
    });
  }

  for (const failure of [
    'unenrolled',
    'absent',
    'foreign',
    'malformed',
    'provider-error',
    'blank-subject',
  ] as const) {
    for (const alreadyRequired of [false, true]) {
      it(`refuses ${failure} native evidence ${alreadyRequired ? 'when MFA remains required' : 'when enabling MFA'} before effects`, async () => {
        const subject = failure === 'blank-subject' ? '   ' : nativeSubject;
        const sessionIdentity = { subject, sessionId: 'captured-session' };
        const state = bindCapturedScope({ role: 'owner', sessionIdentity });
        const row = state.rows.get(CAPTURED_ORG)!;
        row['metadata'] = {
          ...(row['metadata'] as Record<string, unknown>),
          requireMfa: alreadyRequired,
        };
        const original = JSON.stringify(row);
        mockGetIdentityUser.mockImplementation(async (requestedSubject: string) => {
          if (requestedSubject === CAPTURED_USER || requestedSubject === forgedSubject) {
            return { id: requestedSubject, twoFactorEnabled: true };
          }
          if (failure === 'provider-error') throw new Error('Provider unavailable');
          if (failure === 'absent') return null;
          if (failure === 'foreign') return { id: forgedSubject, twoFactorEnabled: true };
          if (failure === 'malformed') return { id: nativeSubject, twoFactorEnabled: 'true' };
          return { id: nativeSubject, twoFactorEnabled: false };
        });

        const response = await PATCH(
          forgedMfaRequest(alreadyRequired ? { retentionDays: 30 } : { requireMfa: true }),
        );

        expect(response.status).toBe(400);
        expect(JSON.stringify(await response.json())).toMatch(
          /Enrol in two-factor authentication first/i,
        );
        expect(mockResolveMfaEnrolled).toHaveBeenCalledWith(CAPTURED_USER, sessionIdentity);
        if (failure === 'blank-subject') {
          expect(mockGetIdentityUser).not.toHaveBeenCalled();
        } else {
          expect(mockGetIdentityUser).toHaveBeenCalledExactlyOnceWith(nativeSubject);
        }
        expect(mockEnrollmentCacheGet).not.toHaveBeenCalled();
        expect(mockEnrollmentCacheSet).not.toHaveBeenCalled();
        expect(JSON.stringify(state.rows.get(CAPTURED_ORG))).toBe(original);
        expect(state.revisions.get(CAPTURED_ORG)).toBe(9);
        state.assertNoWrite();
        state.assertAUnchanged();
      });
    }
  }

  for (const alreadyRequired of [false, true]) {
    it(`skips enrollment when the resulting policy does not require MFA (previously ${alreadyRequired})`, async () => {
      const state = bindCapturedScope({
        role: 'owner',
        sessionIdentity: { subject: nativeSubject, sessionId: 'captured-session' },
      });
      const row = state.rows.get(CAPTURED_ORG)!;
      row['metadata'] = {
        ...(row['metadata'] as Record<string, unknown>),
        requireMfa: alreadyRequired,
      };

      const response = await PATCH(
        forgedMfaRequest(alreadyRequired ? { requireMfa: false } : { retentionDays: 30 }),
      );

      expect(response.status).toBe(200);
      expect(mockResolveMfaEnrolled).not.toHaveBeenCalled();
      expect(mockGetIdentityUser).not.toHaveBeenCalled();
      expect(mockEnrollmentCacheGet).not.toHaveBeenCalled();
      expect(mockEnrollmentCacheSet).not.toHaveBeenCalled();
      expect(state.rows.get(CAPTURED_ORG)?.['metadata']).toMatchObject({ requireMfa: false });
      state.assertAUnchanged();
    });
  }

  for (const cached of ['enrolled', 'unenrolled', null] as const) {
    it(`preserves product enrollment for device/no-evidence callers (${cached ?? 'cache miss'})`, async () => {
      const state = bindCapturedScope({ role: 'owner' });
      mockEnrollmentCacheGet.mockResolvedValue(cached);
      mockGetIdentityUser.mockResolvedValue({ id: CAPTURED_USER, twoFactorEnabled: true });

      const response = await PATCH(forgedMfaRequest());

      expect(response.status).toBe(cached === 'unenrolled' ? 400 : 200);
      expect(mockResolveMfaEnrolled).toHaveBeenCalledExactlyOnceWith(CAPTURED_USER, undefined);
      expect(mockEnrollmentCacheGet).toHaveBeenCalledExactlyOnceWith(
        `mfa-enrolled:${CAPTURED_USER}`,
      );
      if (cached === null) {
        expect(mockGetIdentityUser).toHaveBeenCalledExactlyOnceWith(CAPTURED_USER);
        expect(mockEnrollmentCacheSet).toHaveBeenCalledWith(
          `mfa-enrolled:${CAPTURED_USER}`,
          'enrolled',
          { ttlSeconds: 300 },
        );
      } else {
        expect(mockGetIdentityUser).not.toHaveBeenCalled();
        expect(mockEnrollmentCacheSet).not.toHaveBeenCalled();
      }
      if (cached === 'unenrolled') state.assertNoWrite();
      state.assertAUnchanged();
    });
  }
});

describe('captured policy scope (auth mocked; UNRUN)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIpAllowListCacheForTests();
    vi.mocked(requireCsrfToken).mockResolvedValue(null);
    vi.mocked(withRateLimit).mockResolvedValue(null);
  });

  afterEach(() => {
    clearIpAllowListCacheForTests();
  });

  for (const explicit of [true, false]) {
    it(`reads captured B, never saved A (${explicit ? 'explicit selector' : 'headerless'})`, async () => {
      const state = bindCapturedScope({ role: 'member', canManage: false });
      const req = scopedRequest('GET', explicit);
      const response = await GET(req);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.organizationId).toBe(CAPTURED_ORG);
      expect(body.configured).toBe(true);
      expect(body.canManagePolicy).toBe(false);
      expect(body.currentUserRole).toBe('member');
      expect(body.policy.retentionDays).toBe(222);
      expect(body.policy.metadata.marker).toBe('B');
      expect(body.revision).toBe(9);
      expect(response.headers.get('ETag')).toBe('W/"wsrev-9"');
      expect(getUserScopedDb).toHaveBeenCalledWith(req, { mfaGateExemptForOwner: true });
      expect(requireTeamAdminAccess).toHaveBeenCalledWith(state.db, CAPTURED_USER, CAPTURED_ORG);
      expect(resolveOrganizationPermissions).toHaveBeenCalledWith(CAPTURED_ORG, CAPTURED_USER);
      state.assertNoWrite();
      state.assertAUnchanged();
    });

    it(`writes only captured B (${explicit ? 'explicit selector' : 'headerless'})`, async () => {
      const state = bindCapturedScope();
      const req = scopedRequest(
        'PATCH',
        explicit,
        { retentionDays: 30 },
        { 'If-Match': 'W/"wsrev-9"' },
      );
      const response = await PATCH(req);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.organizationId).toBe(CAPTURED_ORG);
      expect(body.canManagePolicy).toBe(true);
      expect(getUserScopedDb).toHaveBeenCalledWith(req, { mfaGateExemptForOwner: true });
      expect(requireTeamAdminAccess).toHaveBeenCalledWith(state.db, CAPTURED_USER, CAPTURED_ORG);
      expect(resolveOrganizationPermissions).toHaveBeenCalledWith(CAPTURED_ORG, CAPTURED_USER);
      expect(state.rows.get(CAPTURED_ORG)).toMatchObject({
        organization_id: CAPTURED_ORG,
        allow_managed_compute: true,
        metadata: { marker: 'B' },
      });
      expect(state.rows.get(CAPTURED_ORG)?.['retention_days']).toBe(30);
      expect(body.policy.organizationId).toBe(CAPTURED_ORG);
      expect(body.policy.retentionDays).toBe(30);
      expect(body.revision).toBe(10);
      expect(response.headers.get('ETag')).toBe('W/"wsrev-10"');
      expect(response.headers.get('x-workspace-revision')).toBe('10');
      expect(getCachedIpAllowList(CAPTURED_ORG)).toBeUndefined();
      expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: CAPTURED_USER,
          organizationId: CAPTURED_ORG,
          eventType: 'admin_policy_changed',
          detail: expect.objectContaining({
            resourceId: CAPTURED_ORG,
            changedKeys: ['retentionDays'],
          }),
        }),
      );
      state.assertAUnchanged();
    });
  }

  for (const method of ['GET', 'PATCH'] as const) {
    for (const membership of ['absent', 'mismatched'] as const) {
      it(`refuses ${method} with ${membership} exact B membership`, async () => {
        const state = bindCapturedScope({ membership });
        expect((await (method === 'GET' ? GET : PATCH)(scopedRequest(method, true))).status).toBe(
          403,
        );
        expect(requireTeamAdminAccess).not.toHaveBeenCalled();
        expect(resolveOrganizationPermissions).not.toHaveBeenCalled();
        state.assertNoWrite();
        state.assertAUnchanged();
      });
    }

    it(`refuses ${method} for captured Personal without falling back to saved A`, async () => {
      const state = bindCapturedScope({ organizationId: null });
      const response = await (method === 'GET' ? GET : PATCH)(scopedRequest(method, false));
      expect(response.status).toBe(403);
      expect(mockQuery).not.toHaveBeenCalled();
      expect(requireTeamAdminAccess).not.toHaveBeenCalled();
      state.assertNoWrite();
      state.assertAUnchanged();
    });

    it(`refuses ${method} for ineligible B even when A is eligible`, async () => {
      const state = bindCapturedScope({ entitled: false });
      expect((await (method === 'GET' ? GET : PATCH)(scopedRequest(method, true))).status).toBe(
        403,
      );
      expect(requireTeamAdminAccess).toHaveBeenCalledWith(state.db, CAPTURED_USER, CAPTURED_ORG);
      expect(resolveOrganizationPermissions).not.toHaveBeenCalled();
      state.assertNoWrite();
      state.assertAUnchanged();
    });

    it(`preserves the ${method} rate-limit short circuit before auth`, async () => {
      const state = bindCapturedScope();
      vi.mocked(withRateLimit).mockResolvedValueOnce(new NextResponse(null, { status: 429 }));
      expect((await (method === 'GET' ? GET : PATCH)(scopedRequest(method, true))).status).toBe(
        429,
      );
      expect(getUserScopedDb).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
      state.assertNoWrite();
    });
  }

  it('refuses a B write without policy.manage even when A permits management', async () => {
    const state = bindCapturedScope({ canManage: false });
    expect((await PATCH(scopedRequest('PATCH', true))).status).toBe(403);
    expect(resolveOrganizationPermissions).toHaveBeenCalledWith(CAPTURED_ORG, CAPTURED_USER);
    state.assertNoWrite();
    state.assertAUnchanged();
  });

  it('preserves the CSRF short circuit before rate limiting and auth', async () => {
    const state = bindCapturedScope();
    vi.mocked(requireCsrfToken).mockResolvedValueOnce(new NextResponse(null, { status: 403 }));
    expect((await PATCH(scopedRequest('PATCH', true))).status).toBe(403);
    expect(withRateLimit).not.toHaveBeenCalled();
    expect(getUserScopedDb).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
    state.assertNoWrite();
  });

  it('compares If-Match against B, not the saved A revision', async () => {
    const state = bindCapturedScope();
    const response = await PATCH(
      scopedRequest(
        'PATCH',
        true,
        { retentionDays: 30 },
        {
          'If-Match': 'W/"wsrev-3"',
        },
      ),
    );
    expect(response.status).toBe(409);
    state.assertNoWrite();
    state.assertAUnchanged();
  });

  it('rejects invalid policy input without changing either workspace', async () => {
    const state = bindCapturedScope();
    expect((await PATCH(scopedRequest('PATCH', true, { retentionDays: 0 }))).status).toBe(400);
    state.assertNoWrite();
    state.assertAUnchanged();
  });

  it('checks self-lockout against the captured user before any B write', async () => {
    vi.stubEnv('AGI_AUTHENTICATOR_ENROLLMENT', '1');
    const state = bindCapturedScope();
    mockResolveMfaEnrolled.mockResolvedValueOnce(false);
    try {
      const req = scopedRequest('PATCH', true);
      const response = await PATCH(
        new NextRequest(req.url, {
          method: 'PATCH',
          headers: req.headers,
          body: JSON.stringify({ requireMfa: true }),
        }),
      );
      expect(response.status).toBe(400);
      expect(mockResolveMfaEnrolled).toHaveBeenCalledWith(CAPTURED_USER, undefined);
      state.assertNoWrite();
      state.assertAUnchanged();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

type ImportedModule0 = typeof import('@/lib/mfa-policy-gate').resolveMfaEnrolled;
type ImportedModule1 = typeof import('@/lib/server/identity');
type ImportedModule2 = typeof import('@/lib/server/key-value');
type ImportedModule3 = typeof import('@/lib/mfa-policy-gate');
