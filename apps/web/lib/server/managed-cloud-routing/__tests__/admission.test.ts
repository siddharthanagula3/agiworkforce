import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NON_US_VENDOR_TRANSPORTS } from '@agiworkforce/compliance';
import { modelRegistry, providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import type { AutoRoutingRequest } from '@agiworkforce/routing';

import { inMemoryPolicySource, type InMemoryPolicy } from './in-memory-policy-source';

type RoutingModule = typeof import('@agiworkforce/routing');
type AggregatorRoutingModule = typeof import('@/lib/services/aggregator-routing');

let dispatchThrough: string | null = null;
vi.mock('@/lib/services/aggregator-routing', async (importOriginal) => {
  const actual = await importOriginal<AggregatorRoutingModule>();
  return {
    ...actual,
    dispatchProviderForSelectedRoute: (route: { routeId: string; provider: string }) =>
      dispatchThrough ?? actual.dispatchProviderForSelectedRoute(route),
  };
});

const resolvedRequests: AutoRoutingRequest[] = [];
vi.mock('@agiworkforce/routing', async (importOriginal) => {
  const actual = await importOriginal<RoutingModule>();
  return {
    ...actual,
    resolveAutoRoute: (request: AutoRoutingRequest) => {
      resolvedRequests.push(request);
      return actual.resolveAutoRoute(request);
    },
  };
});

const { admitManagedCloudRoute, managedCloudRoutingRequest } = await import('../admission');
type ManagedCloudCall = Parameters<typeof admitManagedCloudRoute>[0];

const ROUTE_PROVIDERS: ReadonlySet<string> = new Set(
  Object.values(modelRegistry.routes).map((route) => route.provider),
);
const US_ONLY_EXCLUDED = modelRegistry.policies.auto.providerPolicies.usOnly.excludedProviders;
const US_ONLY_TIER = modelRegistry.policies.auto.providerPolicies.usOnly.allowedTiers[0]!;

const ACCOUNT = { db: null, userId: 'user-1', organizationId: 'org-1', conversationId: 'c-1' };
const UNREADABLE = new Error('unreadable');

function source(policy: Partial<InMemoryPolicy> = {}) {
  return inMemoryPolicySource({
    availableProviderIds: ROUTE_PROVIDERS,
    deploymentRegion: 'us',
    ...policy,
  });
}

const CALLS: Record<string, ManagedCloudCall> = {
  utility: { kind: 'utility', account: ACCOUNT },
  background: {
    kind: 'background',
    account: ACCOUNT,
    planTier: US_ONLY_TIER,
    need: { taskType: 'coding' },
  },
  unattended: {
    kind: 'unattended',
    account: ACCOUNT,
    planTier: US_ONLY_TIER,
    need: { taskType: 'general' },
  },
  platform: {
    kind: 'platform',
    account: ACCOUNT,
    planTier: US_ONLY_TIER,
    need: { taskType: 'simple_chat' },
  },
};

function firstRequest(): AutoRoutingRequest {
  const request = resolvedRequests[0];
  if (!request) throw new Error('admission resolved no route');
  return request;
}

function lastRequest(): AutoRoutingRequest {
  const request = resolvedRequests[resolvedRequests.length - 1];
  if (!request) throw new Error('admission resolved no route');
  return request;
}

beforeEach(() => {
  resolvedRequests.length = 0;
  dispatchThrough = null;
});

describe.each(Object.entries(CALLS))('a %s call', (_kind, call) => {
  it('is admitted on the always-on rules and every per-account rule', async () => {
    const admission = await admitManagedCloudRoute(call, source());

    expect(admission.status).toBe('admitted');
    const request = lastRequest();
    for (const transport of NON_US_VENDOR_TRANSPORTS) {
      expect(request.excludedRouteHosts?.has(transport)).toBe(true);
    }
    expect(request.retiredModelKeys).toBeDefined();
    expect(request).toMatchObject({ trustMode: 'managed_cloud', region: 'us' });
  });

  it('is refused when the workspace model policy cannot be read', async () => {
    const admission = await admitManagedCloudRoute(
      call,
      source({ workspaceModelPolicy: UNREADABLE }),
    );

    expect(admission).toMatchObject({ status: 'refused', reason: 'policy_unreadable' });
    expect(resolvedRequests).toHaveLength(0);
  });

  it('is refused when the workspace region cannot be read', async () => {
    const admission = await admitManagedCloudRoute(call, source({ workspaceRegion: UNREADABLE }));

    expect(admission).toMatchObject({ status: 'refused', reason: 'policy_unreadable' });
  });

  it('is refused when the retention requirement cannot be read', async () => {
    const admission = await admitManagedCloudRoute(
      call,
      source({ zeroDataRetentionRequired: UNREADABLE }),
    );

    expect(admission).toMatchObject({ status: 'refused', reason: 'policy_unreadable' });
  });

  it('carries a workspace residency pin into admission', async () => {
    await admitManagedCloudRoute(call, source({ workspaceRegion: 'eu' }));

    expect(lastRequest()).toMatchObject({ residencyRegion: 'eu' });
  });

  it('never resolves to a model the workspace forbids', async () => {
    const admission = await admitManagedCloudRoute(
      call,
      source({ workspaceModelPolicy: { allowedModels: ['no-model-matches-this'] } as never }),
    );

    expect(admission).toMatchObject({ status: 'refused', reason: 'no_route' });
  });

  it('routes only to providers that offer zero retention when the workspace requires it', async () => {
    const admission = await admitManagedCloudRoute(
      call,
      source({ zeroDataRetentionRequired: true }),
    );

    expect(lastRequest()).toMatchObject({ zeroDataRetentionOnly: true });
    if (admission.status === 'admitted') {
      expect(admission.policy.zeroDataRetentionOnly).toBe(true);
    } else {
      expect(admission.reason).toBe('no_route');
    }
  });

  it('keeps an opted-out account on providers that keep inputs out of training', async () => {
    const admission = await admitManagedCloudRoute(call, source({ trainingOptOut: true }));

    expect(lastRequest()).toMatchObject({ noTrainingOnly: true });
    expect(
      [...(lastRequest().availableProviderIds ?? [])].every(providerKeepsInputsOutOfTraining),
    ).toBe(true);
    if (admission.status === 'admitted') {
      expect(providerKeepsInputsOutOfTraining(admission.route.provider)).toBe(true);
      expect(providerKeepsInputsOutOfTraining(admission.dispatchProvider)).toBe(true);
    } else {
      expect(admission.reason).toBe('no_training_route');
    }
  });

  it('refuses with the no-training reason when no provider keeps inputs out of training', async () => {
    const trainingProviders = new Set(
      [...ROUTE_PROVIDERS].filter((provider) => !providerKeepsInputsOutOfTraining(provider)),
    );
    const admission = await admitManagedCloudRoute(
      call,
      source({ trainingOptOut: true, availableProviderIds: trainingProviders }),
    );

    expect(admission).toMatchObject({ status: 'refused', reason: 'no_training_route' });
  });

  it('keeps a conversation that holds protected data out of training', async () => {
    await admitManagedCloudRoute(call, source({ conversationKeepsOutOfTraining: true }));

    expect(lastRequest()).toMatchObject({ noTrainingOnly: true });
  });

  it('honours the user’s US-only preference', async () => {
    const admission = await admitManagedCloudRoute(call, source({ usOnly: true }));

    expect(lastRequest()).toMatchObject({ usOnly: true });
    expect(admission.status).toBe('admitted');
    if (admission.status !== 'admitted') return;
    const vendor =
      modelRegistry.models[admission.route.modelKey as keyof typeof modelRegistry.models]?.identity
        .provider;
    expect(US_ONLY_EXCLUDED).not.toContain(vendor);
  });
});

describe('a utility call', () => {
  it('routes on the economy slot whatever the account’s plan', async () => {
    await admitManagedCloudRoute(CALLS['utility']!, source());

    expect(lastRequest()).toMatchObject({
      selection: 'auto',
      subscriptionTier: 'free',
      taskType: 'simple_chat',
    });
  });

  it('applies a saved US-only preference although the economy tier does not offer it', async () => {
    await admitManagedCloudRoute(CALLS['utility']!, source({ usOnly: true }));

    expect([...(lastRequest().excludedProviders ?? [])].sort()).toEqual(
      [...US_ONLY_EXCLUDED].sort(),
    );
  });

  it('routes on the rules the enclosing turn already read, without reading any', async () => {
    const unreadable = source({
      trainingOptOut: true,
      workspaceModelPolicy: UNREADABLE,
      workspaceRegion: UNREADABLE,
      zeroDataRetentionRequired: UNREADABLE,
    });

    const admission = await admitManagedCloudRoute(
      {
        kind: 'utility',
        account: ACCOUNT,
        need: {
          turnPolicy: {
            noTrainingOnly: false,
            zeroDataRetentionOnly: false,
            organizationPolicy: null,
            residencyRegion: null,
            usOnly: true,
          },
        },
      },
      unreadable,
    );

    expect(admission.status).toBe('admitted');
    expect(lastRequest()).toMatchObject({ usOnly: true });
    expect(lastRequest()).not.toHaveProperty('noTrainingOnly');
    expect(lastRequest()).not.toHaveProperty('zeroDataRetentionOnly');
  });
});

describe('a utility call inside a chat turn (compaction, memory extraction)', () => {
  const TURN_POLICY = {
    noTrainingOnly: true,
    zeroDataRetentionOnly: true,
    organizationPolicy: { allowedModels: ['no-model-matches-this'] } as never,
    residencyRegion: 'eu',
    usOnly: true,
  };
  const everythingUnreadable = () =>
    source({
      workspaceModelPolicy: UNREADABLE,
      workspaceRegion: UNREADABLE,
      zeroDataRetentionRequired: UNREADABLE,
    });

  it('carries every rule of the turn, residency and US-only included, with no read', async () => {
    await admitManagedCloudRoute(
      { kind: 'utility', account: ACCOUNT, need: { turnPolicy: TURN_POLICY } },
      everythingUnreadable(),
    );

    expect(firstRequest()).toMatchObject({
      subscriptionTier: 'free',
      noTrainingOnly: true,
      zeroDataRetentionOnly: true,
      organizationPolicy: TURN_POLICY.organizationPolicy,
      residencyRegion: 'eu',
      usOnly: true,
    });
    expect(
      [...(firstRequest().availableProviderIds ?? [])].every(providerKeepsInputsOutOfTraining),
    ).toBe(true);
  });

  it('refuses rather than leak the transcript when the turn’s rules leave nothing', async () => {
    const admission = await admitManagedCloudRoute(
      { kind: 'utility', account: ACCOUNT, need: { turnPolicy: TURN_POLICY } },
      everythingUnreadable(),
    );

    expect(admission.status).toBe('refused');
  });

  it('adds a protected-content requirement on top of the turn’s rules', async () => {
    await admitManagedCloudRoute(
      {
        kind: 'utility',
        account: ACCOUNT,
        need: { turnPolicy: { ...TURN_POLICY, noTrainingOnly: false }, keepOutOfTraining: true },
      },
      everythingUnreadable(),
    );

    expect(firstRequest()).toMatchObject({ noTrainingOnly: true });
  });
});

describe('the selected route’s dispatch provider', () => {
  it('is returned with the route', async () => {
    const admission = await admitManagedCloudRoute(CALLS['background']!, source());

    expect(admission).toMatchObject({ status: 'admitted', dispatchProvider: expect.any(String) });
  });

  it('refuses an opted-out account whose route would dispatch through a provider that may train', async () => {
    dispatchThrough = [...ROUTE_PROVIDERS].find(
      (provider) => !providerKeepsInputsOutOfTraining(provider),
    )!;

    const admission = await admitManagedCloudRoute(
      CALLS['background']!,
      source({ trainingOptOut: true }),
    );

    expect(admission).toMatchObject({ status: 'refused', reason: 'no_training_route' });
  });
});

describe('a route preview', () => {
  it('builds the request a chat turn on this account would route on, without resolving it', async () => {
    const preview = await managedCloudRoutingRequest(
      {
        kind: 'preview',
        account: ACCOUNT,
        planTier: US_ONLY_TIER,
        need: {
          taskType: 'general',
          continuity: { currentModelKey: 'model-1', previousTaskType: 'coding' },
        },
      },
      source({ usOnly: true, workspaceRegion: 'eu', trainingOptOut: true }),
    );

    expect(resolvedRequests).toHaveLength(0);
    expect(preview).toMatchObject({
      status: 'ready',
      request: {
        selection: 'auto',
        subscriptionTier: US_ONLY_TIER,
        usOnly: true,
        residencyRegion: 'eu',
        noTrainingOnly: true,
        region: 'us',
        currentModelKey: 'model-1',
        previousTaskType: 'coding',
      },
    });
  });

  it('is refused when an account rule cannot be read', async () => {
    const preview = await managedCloudRoutingRequest(
      { kind: 'preview', account: ACCOUNT, planTier: US_ONLY_TIER, need: { taskType: 'general' } },
      source({ zeroDataRetentionRequired: UNREADABLE }),
    );

    expect(preview).toMatchObject({ status: 'refused', reason: 'policy_unreadable' });
  });
});

function blocking(modelKey: string) {
  return {
    allowedProviders: [],
    blockedProviders: [],
    allowedModels: [],
    blockedModels: [modelKey],
  };
}

describe('an artifact run (background, with connectors)', () => {
  const ARTIFACT_RUN: ManagedCloudCall = {
    kind: 'background',
    account: ACCOUNT,
    planTier: US_ONLY_TIER,
    need: { taskType: 'general', requiredCapabilities: ['functionCalling'] },
  };

  it('never resolves to a model the workspace forbids', async () => {
    const open = await admitManagedCloudRoute(ARTIFACT_RUN, source());
    if (open.status !== 'admitted') throw new Error('artifact fixture has no route');

    const governed = await admitManagedCloudRoute(
      ARTIFACT_RUN,
      source({ workspaceModelPolicy: blocking(open.route.modelKey) }),
    );

    if (governed.status === 'admitted') {
      expect(governed.route.modelKey).not.toBe(open.route.modelKey);
    } else {
      expect(governed.reason).toBe('no_route');
    }
  });

  it('routes a zero-retention workspace to the providers that offer zero retention instead of refusing it outright', async () => {
    await admitManagedCloudRoute(
      ARTIFACT_RUN,
      source({
        zeroDataRetentionRequired: true,
        zeroDataRetentionProviders: ROUTE_PROVIDERS,
      }),
    );

    expect(firstRequest()).toMatchObject({ zeroDataRetentionOnly: true });
  });
});

describe('a support answer (platform, pinned family model)', async () => {
  const { resolveModelFamilySlot, SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER } =
    await import('@agiworkforce/types');
  const { SUPPORT_MODEL_FAMILY } = await import('@/lib/support/agent/answer/model-route');
  const SUPPORT_MODEL = resolveModelFamilySlot(SUPPORT_MODEL_FAMILY);
  const support = (account: typeof ACCOUNT | null): ManagedCloudCall => ({
    kind: 'platform',
    account,
    planTier: SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER[0],
    need: {
      selection: SUPPORT_MODEL,
      exactSelection: true,
      requiredCapabilities: ['structuredOutput'],
      taskType: 'simple_chat',
    },
  });

  it('admits an anonymous visitor on the pinned model under the always-on rules only', async () => {
    const admission = await admitManagedCloudRoute(
      support(null),
      source({ trainingOptOut: true, workspaceModelPolicy: UNREADABLE }),
    );

    expect(admission).toMatchObject({ status: 'admitted', route: { modelKey: SUPPORT_MODEL } });
    const request = lastRequest();
    expect(request).toMatchObject({ trustMode: 'managed_cloud', region: 'us' });
    expect(request.excludedRouteHosts?.size).toBeGreaterThan(0);
    expect(request).not.toHaveProperty('noTrainingOnly');
    expect(request).not.toHaveProperty('organizationPolicy');
  });

  it('refuses a signed-in visitor whose workspace forbids the pinned model, rather than answer on another', async () => {
    const admission = await admitManagedCloudRoute(
      support(ACCOUNT),
      source({ workspaceModelPolicy: blocking(SUPPORT_MODEL) }),
    );

    expect(admission).toMatchObject({ status: 'refused', reason: 'no_route' });
  });

  it('is refused for a signed-in visitor whose workspace policy cannot be read', async () => {
    const admission = await admitManagedCloudRoute(
      support(ACCOUNT),
      source({ workspaceModelPolicy: UNREADABLE }),
    );

    expect(admission).toMatchObject({ status: 'refused', reason: 'policy_unreadable' });
  });
});

describe('a platform call for a visitor with no account', () => {
  it('is admitted on the always-on rules alone and reads nothing', async () => {
    const admission = await admitManagedCloudRoute(
      {
        kind: 'platform',
        account: null,
        planTier: US_ONLY_TIER,
        need: { taskType: 'simple_chat' },
      },
      source({
        trainingOptOut: true,
        usOnly: true,
        workspaceModelPolicy: UNREADABLE,
        zeroDataRetentionRequired: UNREADABLE,
      }),
    );

    expect(admission.status).toBe('admitted');
    const request = lastRequest();
    expect(request).not.toHaveProperty('noTrainingOnly');
    expect(request).not.toHaveProperty('usOnly');
    expect(request.excludedRouteHosts?.size).toBeGreaterThan(0);
  });
});

describe('a pinned model', () => {
  it('is refused rather than replaced when it cannot serve the call', async () => {
    const admission = await admitManagedCloudRoute(
      {
        kind: 'platform',
        account: null,
        planTier: US_ONLY_TIER,
        need: { selection: 'no-such-model', taskType: 'simple_chat', exactSelection: true },
      },
      source(),
    );

    expect(admission).toMatchObject({ status: 'refused', reason: 'no_route' });
    expect(lastRequest()).toMatchObject({ fallbackToAutoForCapabilityMismatch: false });
  });
});
