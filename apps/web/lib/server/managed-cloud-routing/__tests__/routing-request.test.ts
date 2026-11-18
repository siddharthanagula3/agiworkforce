import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NON_US_VENDOR_TRANSPORTS } from '@agiworkforce/compliance';
import { modelsPastDeprecationDate } from '@agiworkforce/routing';

type ComplianceModule = typeof import('@agiworkforce/compliance');
type GatewayRoutingModule = typeof import('@/lib/services/gateway-routing');

const ADMITTED_HARNESS_IDS = ['harness-a', 'harness-b'] as const;
const JURISDICTIONS_BY_REGION: Record<string, ReadonlySet<string>> = {
  us: new Set(['US']),
  eu: new Set(['EU']),
};

const mocks = vi.hoisted(() => ({
  admittedHarnessIds: vi.fn(),
  allowedDeveloperJurisdictions: vi.fn(),
}));

vi.mock('@/lib/services/gateway-routing', async (importOriginal) => ({
  ...(await importOriginal<GatewayRoutingModule>()),
  admittedHarnessIds: mocks.admittedHarnessIds,
}));
vi.mock('@agiworkforce/compliance', async (importOriginal) => ({
  ...(await importOriginal<ComplianceModule>()),
  allowedDeveloperJurisdictions: mocks.allowedDeveloperJurisdictions,
}));

const { buildWebCloudAutoRoutingRequest, resolveResidencyRegion } =
  await import('../routing-request');

const SELECTION = 'auto';
const PLAN_TIER = 'max';
const TASK_TYPE = 'general' as const;
const POLICY = { allowedModels: ['no-model-matches-this'] } as never;

function chatTurnRequest(snapshot: {
  usOnly?: boolean | null;
  zeroDataRetentionOnly?: boolean;
  residencyRegion?: string | null;
  organizationPolicy?: unknown;
  requiredRouteId?: string | null;
  noTrainingOnly?: boolean;
  region?: string;
}) {
  return buildWebCloudAutoRoutingRequest(
    SELECTION,
    PLAN_TIER,
    TASK_TYPE,
    undefined,
    undefined,
    undefined,
    new Set(['provider-a', 'provider-b']),
    snapshot.zeroDataRetentionOnly,
    new Set(['provider-a']),
    snapshot.organizationPolicy as never,
    snapshot.usOnly === null || snapshot.usOnly === undefined
      ? snapshot.usOnly
      : { usOnly: snapshot.usOnly },
    snapshot.region
      ? {
          region: snapshot.region,
          requestId: 'conversation-1',
          capabilitiesInUse: [],
          shadowRequestsToday: {},
          flagVariants: {},
          promptVariants: {},
        }
      : undefined,
    snapshot.residencyRegion,
    snapshot.requiredRouteId,
    snapshot.noTrainingOnly,
  );
}

function previewRequest() {
  return buildWebCloudAutoRoutingRequest(
    SELECTION,
    PLAN_TIER,
    TASK_TYPE,
    undefined,
    undefined,
    {},
    new Set(['provider-a']),
    true,
    new Set(['provider-a']),
    POLICY,
  );
}

beforeEach(() => {
  mocks.admittedHarnessIds.mockReturnValue(ADMITTED_HARNESS_IDS);
  mocks.allowedDeveloperJurisdictions.mockImplementation(
    (region: string | null | undefined) =>
      (region ? JURISDICTIONS_BY_REGION[region] : null) ?? null,
  );
});

describe.each([
  ['a chat turn', () => chatTurnRequest({ region: 'us' })],
  ['a route preview', previewRequest],
])('the always-on rules on %s', (_kind, build) => {
  it('refuses every non-US vendor transport', () => {
    const request = build();
    for (const transport of NON_US_VENDOR_TRANSPORTS) {
      expect(request.excludedRouteHosts?.has(transport)).toBe(true);
    }
  });

  it('refuses models past their deprecation date', () => {
    expect([...(build().retiredModelKeys ?? [])].sort()).toEqual(
      [...modelsPastDeprecationDate()].sort(),
    );
  });

  it('admits only the harnesses this runtime can execute', () => {
    expect(build().allowedHarnessIds).toEqual(ADMITTED_HARNESS_IDS);
  });

  it('carries the developer jurisdictions of the home region', () => {
    expect(build().allowedDeveloperJurisdictions).toBe(JURISDICTIONS_BY_REGION['us']);
  });

  it('runs in the managed cloud trust boundary', () => {
    expect(build()).toMatchObject({
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
    });
  });
});

describe('a chat turn routes on the snapshot the turn read', () => {
  it('reproduces every per-account rule of a governed, US-only, zero-retention turn', () => {
    const request = chatTurnRequest({
      usOnly: true,
      zeroDataRetentionOnly: true,
      residencyRegion: 'eu',
      organizationPolicy: POLICY,
      requiredRouteId: 'route-1',
      noTrainingOnly: true,
      region: 'us',
    });

    expect(request).toMatchObject({
      selection: SELECTION,
      subscriptionTier: PLAN_TIER,
      taskType: TASK_TYPE,
      usOnly: true,
      zeroDataRetentionOnly: true,
      residencyRegion: 'eu',
      organizationPolicy: POLICY,
      requiredRouteId: 'route-1',
      noTrainingOnly: true,
      region: 'us',
      requestId: 'conversation-1',
    });
    expect([...(request.availableProviderIds ?? [])].sort()).toEqual(['provider-a', 'provider-b']);
    expect([...(request.zeroDataRetentionProviders ?? [])]).toEqual(['provider-a']);
    expect(request.allowedDeveloperJurisdictions).toBe(JURISDICTIONS_BY_REGION['eu']);
  });

  it('sets usOnly only when the user asked for it', () => {
    expect(chatTurnRequest({ usOnly: true })).toMatchObject({ usOnly: true });
    expect(chatTurnRequest({ usOnly: false })).not.toHaveProperty('usOnly');
    expect(chatTurnRequest({ usOnly: null })).not.toHaveProperty('usOnly');
    expect(chatTurnRequest({})).not.toHaveProperty('usOnly');
  });

  it('leaves the rest of the request identical when usOnly is set', () => {
    const withoutPreference = chatTurnRequest({ usOnly: false });
    const withPreference = chatTurnRequest({ usOnly: true });

    expect({ ...withPreference, usOnly: undefined }).toEqual({
      ...withoutPreference,
      usOnly: undefined,
    });
  });

  it('threads zero retention the same way as the US-only preference', () => {
    expect(chatTurnRequest({ zeroDataRetentionOnly: true })).toMatchObject({
      zeroDataRetentionOnly: true,
    });
    expect(chatTurnRequest({ zeroDataRetentionOnly: false })).not.toHaveProperty(
      'zeroDataRetentionOnly',
    );
  });
});

describe('residency', () => {
  it('carries a workspace pinned away from the deployment region into routing', () => {
    expect(resolveResidencyRegion('eu', 'us')).toBe('eu');
  });

  it('asks nothing of routing for a workspace in the deployment region', () => {
    expect(resolveResidencyRegion('us', 'us')).toBeNull();
  });

  it('asks nothing when the workspace region is unknown', () => {
    expect(resolveResidencyRegion(null, 'us')).toBeNull();
  });

  it('carries the workspace region when the deployment asserts none of its own', () => {
    expect(resolveResidencyRegion('eu', null)).toBe('eu');
  });
});
