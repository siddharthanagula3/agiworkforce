import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';

type ApiAuthModule = typeof import('@/lib/api-auth');
type ManagedComputeGateModule = typeof import('@/lib/managed-compute-gate');
type EntitlementResolutionModule = typeof import('@/lib/services/entitlement-resolution');
type FlagStoreModule = typeof import('@/lib/feature-flags/flag-store');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type DenialsModule = typeof import('@/lib/observability/denials');
type DataRegionModule = typeof import('@/lib/server/data-region');

const mocks = vi.hoisted(() => ({
  accountActive: vi.fn(async (_userId: string, _request?: unknown) => undefined),
  workspaceGate: vi.fn(async (..._args: unknown[]): Promise<unknown> => null),
  planTier: vi.fn(async (): Promise<string> => 'pro'),
  definitions: [] as unknown[],
  deviceRows: [] as Array<Record<string, unknown>>,
  deviceQueries: [] as unknown[][],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ApiAuthModule>()),
  assertAccountActive: mocks.accountActive,
}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<ManagedComputeGateModule>()),
  buildWorkspaceFeatureGateResponse: mocks.workspaceGate,
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<EntitlementResolutionModule>()),
  resolveEntitledPlanTier: mocks.planTier,
}));
vi.mock('@/lib/feature-flags/flag-store', async (importOriginal) => ({
  ...(await importOriginal<FlagStoreModule>()),
  getActiveFlagDefinitions: async () => mocks.definitions,
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
  const tx = {
    execute: vi.fn(async () => 0),
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('from device_registrations r')) {
        mocks.deviceQueries.push(params);
        return mocks.deviceRows;
      }
      return [];
    }),
  };
  const db = {
    ...tx,
    transaction: vi.fn(async (work: (handle: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return {
    ...(await importOriginal<NeonDbModule>()),
    getNeonDb: () => db,
  };
});

import { createError } from '@/lib/errors';
import type { FlagDefinition, FlagDefinitionInput } from '@/lib/feature-flags/flag-definition';
import {
  SCREEN_SHARE_CAPABILITY,
  capabilityKillSwitchKey,
  killSwitchDefinition,
} from '@/lib/feature-flags/kill-switches';

import { POST } from '../route';

const SECRET = 'relay-secret';
const USER = 'user_standing';
const DESKTOP = '7f3c1b8e-2a4d-4c6e-9f10-1a2b3c4d5e6f';
const PHONE = '7f3c1b8e-2a4d-4c6e-9f10-1a2b3c4d5e70';

function pairing(overrides: Record<string, unknown> = {}) {
  return {
    code: 'ABCD1234WXYZ',
    userId: USER,
    deviceIds: [DESKTOP, PHONE],
    workspace: null,
    ...overrides,
  };
}

function ask(body: unknown, bearer: string | null = SECRET): NextRequest {
  return new NextRequest('http://localhost/api/pair/standing', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(bearer === null ? {} : { authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify(body),
  });
}

async function standingOf(body: unknown): Promise<string[]> {
  const response = await POST(ask(body));
  expect(response.status).toBe(200);
  const json = (await response.json()) as { results: Array<{ standing: string }> };
  return json.results.map((result) => result.standing);
}

function signedIn(...ids: string[]) {
  return ids.map((id) => ({
    device_id: id,
    credential_family_id: null,
    identity_session_id: `sess_${id}`,
    live_credential: null,
  }));
}

function stored(input: FlagDefinitionInput): FlagDefinition {
  return {
    ...input,
    version: 1,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accountActive.mockResolvedValue(undefined);
  mocks.workspaceGate.mockResolvedValue(null);
  mocks.planTier.mockResolvedValue('pro');
  mocks.definitions = [];
  mocks.deviceRows = signedIn(DESKTOP, PHONE);
  mocks.deviceQueries = [];
  vi.stubEnv('SIGNALING_INTERNAL_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the relay recheck of a live pairing', () => {
  it('answers only the relay', async () => {
    expect((await POST(ask({ pairings: [pairing()] }, null))).status).toBe(401);
    expect((await POST(ask({ pairings: [pairing()] }, 'guess'))).status).toBe(401);
    expect(mocks.accountActive).not.toHaveBeenCalled();
  });

  it('refuses a malformed batch', async () => {
    expect((await POST(ask({ pairings: [pairing({ code: 'short' })] }))).status).toBe(400);
  });

  it('keeps a pairing the account may still hold', async () => {
    expect(await standingOf({ pairings: [pairing()] })).toEqual(['active']);
    expect(mocks.deviceQueries[0]?.[0]).toBe(USER);
  });

  it('ends a pairing once the plan no longer includes Remote Control', async () => {
    mocks.planTier.mockResolvedValue('free');
    expect(await standingOf({ pairings: [pairing()] })).toEqual(['ended']);
  });

  it('ends a pairing once a workspace admin turns Remote Control off', async () => {
    mocks.workspaceGate.mockResolvedValue(
      NextResponse.json({ error: { code: 'feature_disabled' } }, { status: 403 }),
    );
    expect(await standingOf({ pairings: [pairing({ workspace: 'personal' })] })).toEqual(['ended']);
    const [, gateRequest, feature, surface] = mocks.workspaceGate.mock.calls[0] as [
      string,
      NextRequest,
      string,
      string,
    ];
    expect(feature).toBe('remote_control');
    expect(surface).toBe('unknown');
    expect(gateRequest.headers.get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe('personal');
  });

  it('ends a pairing while the Remote Control switch is closed', async () => {
    mocks.definitions = [
      stored({
        ...killSwitchDefinition(capabilityKillSwitchKey(SCREEN_SHARE_CAPABILITY), 'screen share'),
        killSwitch: true,
      }),
    ];
    expect(await standingOf({ pairings: [pairing()] })).toEqual(['ended']);
  });

  it('ends a pairing whose account is closed', async () => {
    mocks.accountActive.mockRejectedValue(createError.forbidden('Account deleted'));
    expect(await standingOf({ pairings: [pairing()] })).toEqual(['ended']);
  });

  it('ends a pairing once a device it names is unlinked or signed out everywhere', async () => {
    mocks.deviceRows = signedIn(DESKTOP);
    expect(await standingOf({ pairings: [pairing()] })).toEqual(['ended']);

    mocks.deviceRows = [
      ...signedIn(PHONE),
      {
        device_id: DESKTOP,
        credential_family_id: 'family-1',
        identity_session_id: null,
        live_credential: false,
      },
    ];
    expect(await standingOf({ pairings: [pairing()] })).toEqual(['ended']);
  });

  it('holds, rather than ends, a pairing whose standing cannot be read', async () => {
    mocks.workspaceGate.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'policy_unavailable' } }, { status: 503 }),
    );
    expect(await standingOf({ pairings: [pairing()] })).toEqual(['unknown']);

    mocks.planTier.mockRejectedValueOnce(new Error('billing unreachable'));
    expect(await standingOf({ pairings: [pairing()] })).toEqual(['unknown']);

    mocks.accountActive.mockRejectedValueOnce(new Error('status store down'));
    expect(await standingOf({ pairings: [pairing()] })).toEqual(['unknown']);
  });

  it('asks once per account in a batch and answers every pairing', async () => {
    const results = await standingOf({
      pairings: [pairing(), pairing({ code: 'ZYXW4321DCBA', deviceIds: [DESKTOP] })],
    });
    expect(results).toEqual(['active', 'active']);
    expect(mocks.accountActive).toHaveBeenCalledTimes(1);
  });
});
