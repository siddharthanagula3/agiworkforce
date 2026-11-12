import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
import {
  DEFAULT_ENTERPRISE_ADMIN_POLICY,
  DEFAULT_WORKSPACE_FEATURE_ACCESS,
  type AdminPolicy,
} from '@agiworkforce/types';

type ApiAuthModule = typeof import('@/lib/api-auth');
type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type WorkspaceAuditModule = typeof import('@/lib/workspace-audit');
type FlagStoreModule = typeof import('@/lib/feature-flags/flag-store');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type DenialsModule = typeof import('@/lib/observability/denials');
type DataRegionModule = typeof import('@/lib/server/data-region');
type ActiveWorkspaceModule = typeof import('@/lib/services/active-workspace-service');
type PolicyServiceModule = typeof import('@/lib/services/organization-policy-service');

const ORG_ID = '33333333-3333-4333-8333-333333333333';
const USER = 'user_country_member';
const DESKTOP = '7f3c1b8e-2a4d-4c6e-9f10-1a2b3c4d5e6f';
const PHONE = '7f3c1b8e-2a4d-4c6e-9f10-1a2b3c4d5e70';
const SECRET = 'relay-secret';

const mocks = vi.hoisted(() => ({
  activeOrganization: vi.fn(),
  policyRead: vi.fn(),
  ownPlan: 'pro' as string | null,
  seatLookupFails: false,
  member: true,
  signaling: vi.fn(),
}));

function fakeDb() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('from device_registrations r')) {
      return [DESKTOP, PHONE].map((id) => ({
        device_id: id,
        credential_family_id: null,
        identity_session_id: `sess_${id}`,
        live_credential: null,
      }));
    }
    if (sql.includes('FROM subscriptions')) {
      return mocks.ownPlan
        ? [
            {
              id: 'sub_own',
              user_id: USER,
              plan_tier: mocks.ownPlan,
              status: 'active',
              current_period_start: '2026-11-01T00:00:00.000Z',
              current_period_end: '2026-12-01T00:00:00.000Z',
              cancel_at_period_end: false,
              stripe_subscription_id: null,
              stripe_price_id: null,
              apple_original_transaction_id: null,
              google_purchase_token: null,
              plan_catalog_version: null,
            },
          ]
        : [];
    }
    if (sql.includes('organization.licensed_seats')) {
      if (mocks.seatLookupFails) throw new Error('pool timeout');
      return [];
    }
    if (sql.includes('from public.organization_members where user_id')) {
      return mocks.member ? [{ member: 1 }] : [];
    }
    return [];
  });
  const tx = { query, execute: vi.fn(async () => 0) };
  return {
    ...tx,
    transaction: vi.fn(async (work: (handle: typeof tx) => Promise<unknown>) => work(tx)),
  };
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ApiAuthModule>()),
  assertAccountActive: vi.fn(async () => undefined),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({ db: fakeDb(), userId: USER, surface: 'cli' })),
}));
vi.mock('@/lib/workspace-audit', async (importOriginal) => ({
  ...(await importOriginal<WorkspaceAuditModule>()),
  recordWorkspaceAuditEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/feature-flags/flag-store', async (importOriginal) => ({
  ...(await importOriginal<FlagStoreModule>()),
  getActiveFlagDefinitions: async () => [],
  getSubjectOverrides: async () => [],
}));
vi.mock('@/lib/observability/denials', async (importOriginal) => ({
  ...(await importOriginal<DenialsModule>()),
  recordCapabilityDenial: vi.fn(),
}));
vi.mock('@/lib/server/data-region', async (importOriginal) => ({
  ...(await importOriginal<DataRegionModule>()),
  managedCloudDataRegion: () => 'us-east-1',
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => {
  const db = fakeDb();
  return {
    ...(await importOriginal<NeonDbModule>()),
    getNeonDb: () => db,
  };
});
vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<ActiveWorkspaceModule>()),
  resolveActiveOrganizationId: mocks.activeOrganization,
}));
vi.mock('@/lib/services/organization-policy-service', async (importOriginal) => ({
  ...(await importOriginal<PolicyServiceModule>()),
  readLayeredOrganizationPolicy: mocks.policyRead,
}));

import { createError } from '@/lib/errors';

import { POST as standing } from '../standing/route';
import { POST as initiate } from '../initiate/route';

function workspacePolicy({
  remoteControl = true,
  allowedCountries = ['US'],
}: { remoteControl?: boolean; allowedCountries?: string[] } = {}): AdminPolicy {
  return {
    ...DEFAULT_ENTERPRISE_ADMIN_POLICY,
    organizationId: ORG_ID,
    updatedAt: '2026-11-01T00:00:00.000Z',
    controls: {
      ...DEFAULT_ENTERPRISE_ADMIN_POLICY.controls,
      featureAccess: { ...DEFAULT_WORKSPACE_FEATURE_ACCESS, remote_control: remoteControl },
      allowedCountries,
      countryRestrictionActive: allowedCountries.length > 0,
    },
  };
}

async function recheck(): Promise<string> {
  const response = await standing(
    new NextRequest('http://localhost/api/pair/standing', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({
        pairings: [
          { code: 'ABCD1234WXYZ', userId: USER, deviceIds: [DESKTOP, PHONE], workspace: ORG_ID },
        ],
      }),
    }),
  );
  expect(response.status).toBe(200);
  const json = (await response.json()) as { results: Array<{ standing: string }> };
  return json.results[0]?.standing ?? 'missing';
}

function startPairing(country: string | null): Promise<Response> {
  return initiate(
    new NextRequest('http://localhost/api/pair/initiate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [MANAGED_CLOUD_ORGANIZATION_HEADER]: ORG_ID,
        ...(country ? { 'x-vercel-ip-country': country } : {}),
      },
      body: JSON.stringify({ initiator: 'desktop' }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ownPlan = 'pro';
  mocks.seatLookupFails = false;
  mocks.member = true;
  mocks.activeOrganization.mockResolvedValue(ORG_ID);
  mocks.policyRead.mockResolvedValue({ policy: workspacePolicy(), hasOverrides: false });
  mocks.signaling.mockImplementation(
    async () => new Response(JSON.stringify({ error: 'unused' }), { status: 502 }),
  );
  vi.stubGlobal('fetch', mocks.signaling);
  vi.stubEnv('SIGNALING_HTTP_URL', 'https://signal.example.test');
  vi.stubEnv('SIGNALING_INTERNAL_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the relay recheck in a workspace that limits countries', () => {
  it('keeps a live pairing although the recheck carries no country', async () => {
    expect(await recheck()).toBe('active');
    const [, , selectorRequest] = mocks.activeOrganization.mock.calls[0] as [
      unknown,
      string,
      NextRequest,
    ];
    expect(selectorRequest.headers.get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(ORG_ID);
    expect(selectorRequest.headers.get('x-vercel-ip-country')).toBeNull();
  });

  it('still ends the pairing once the admin turns Remote Control off', async () => {
    mocks.policyRead.mockResolvedValue({
      policy: workspacePolicy({ remoteControl: false }),
      hasOverrides: false,
    });
    expect(await recheck()).toBe('ended');
  });

  it('still ends the pairing once the plan no longer includes Remote Control', async () => {
    mocks.ownPlan = null;
    expect(await recheck()).toBe('ended');
  });

  it('still ends the pairing once the member is removed from the workspace', async () => {
    mocks.activeOrganization.mockRejectedValue(
      createError.forbidden('You are not a member of that workspace'),
    );
    expect(await recheck()).toBe('ended');
  });

  it('holds the pairing while the workspace policy cannot be read', async () => {
    mocks.policyRead.mockRejectedValue(new Error('connection terminated'));
    expect(await recheck()).toBe('unknown');
  });

  it('still refuses to start a pairing from outside the allowed countries', async () => {
    const outside = await startPairing('FR');
    expect(outside.status).toBe(403);
    expect(await outside.json()).toMatchObject({ error: { code: 'region_not_allowed' } });

    const unknownOrigin = await startPairing(null);
    expect(unknownOrigin.status).toBe(403);

    await startPairing('US');
    expect(mocks.signaling).toHaveBeenCalledTimes(1);
  });
});

describe('a seat lookup that fails for a workspace member', () => {
  beforeEach(() => {
    mocks.ownPlan = null;
    mocks.seatLookupFails = true;
    mocks.policyRead.mockResolvedValue({
      policy: workspacePolicy({ allowedCountries: [] }),
      hasOverrides: false,
    });
  });

  it('holds a live pairing instead of ending it', async () => {
    expect(await recheck()).toBe('unknown');
  });

  it('answers a new pairing as retryable instead of asking for an upgrade', async () => {
    const response = await startPairing('US');
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('code', 'plan_upgrade_required');
    expect(mocks.signaling).not.toHaveBeenCalled();
  });
});
