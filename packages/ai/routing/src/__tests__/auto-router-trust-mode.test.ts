import { describe, expect, it } from 'vitest';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import { modelRegistry } from '@agiworkforce/model-registry';
import { resolveAutoRoute, type AutoRoutingRequest, type RoutingTrustMode } from '../auto';
import { evaluateModelAccess, type ModelAccessPolicy } from '../model-policy';

/**
 * Auto is the router that chooses for the user, so it is the one that must not
 * become the way around an administrator's decision. Every case here asserts on
 * the MODEL's owning provider, not the decision's route host: a model reached
 * through a gateway reports the gateway there.
 */
const BASE: AutoRoutingRequest = {
  taskType: 'reasoning',
  subscriptionTier: 'enterprise',
  trustMode: 'managed_cloud',
  selection: 'auto',
};

const TASKS: AutoRoutingRequest['taskType'][] = [
  'reasoning',
  'general',
  'simple_chat',
  'coding',
  'agentic',
  'long_context',
  'research',
];

function owningProvider(modelKey: string): string | undefined {
  const models = (modelRegistry as { models: Record<string, { identity: { provider: string } }> })
    .models;
  return models[modelKey]?.identity.provider;
}

function policy(overrides: Partial<ModelAccessPolicy>): ModelAccessPolicy {
  return {
    allowedModels: [],
    blockedModels: [],
    allowedProviders: [],
    blockedProviders: [],
    ...overrides,
  };
}

describe('trust mode the workspace does not permit', () => {
  it('refuses Auto rather than routing managed traffic', () => {
    const decision = resolveAutoRoute({
      ...BASE,
      trustMode: 'managed_cloud',
      allowedTrustModes: ['local', 'byok'],
    });
    expect(decision.status).toBe('unavailable');
    if (decision.status !== 'unavailable') return;
    expect(decision.code).toBe('trust_mode_not_permitted');
    expect(decision.reasons[0]).toContain('managed_cloud');
  });

  it('refuses a model the user named too, because naming a model is not choosing a trust mode', () => {
    const named = requireProviderDefaultModel('anthropic');
    const decision = resolveAutoRoute({
      ...BASE,
      selection: named,
      trustMode: 'managed_cloud',
      allowedTrustModes: ['byok'],
    });
    expect(decision.status).toBe('unavailable');
    if (decision.status !== 'unavailable') return;
    expect(decision.code).toBe('trust_mode_not_permitted');
  });

  it('serves a permitted trust mode unchanged', () => {
    const governed = resolveAutoRoute({
      ...BASE,
      allowedTrustModes: ['local', 'byok', 'managed_cloud'],
    });
    const ungoverned = resolveAutoRoute(BASE);
    expect(governed.status).toBe(ungoverned.status);
    if (governed.status !== 'selected' || ungoverned.status !== 'selected') return;
    expect(governed.modelKey).toBe(ungoverned.modelKey);
  });

  it('never refuses on trust mode when the workspace states no policy', () => {
    for (const taskType of TASKS) {
      const decision = resolveAutoRoute({ ...BASE, taskType });
      if (decision.status !== 'unavailable') continue;
      expect(decision.code).not.toBe('trust_mode_not_permitted');
    }
  });

  it('refuses every task type, not only the one that happened to be tested', () => {
    for (const taskType of TASKS) {
      const decision = resolveAutoRoute({
        ...BASE,
        taskType,
        allowedTrustModes: ['local'],
      });
      expect(decision.status).toBe('unavailable');
      if (decision.status !== 'unavailable') continue;
      expect(decision.code).toBe('trust_mode_not_permitted');
    }
  });

  it('refuses an empty permitted list, which is a policy that permits nothing', () => {
    const decision = resolveAutoRoute({ ...BASE, allowedTrustModes: [] });
    expect(decision.status).toBe('unavailable');
  });
});

describe('a provider the workspace disabled', () => {
  const DISABLED_PROVIDER = 'anthropic';

  it('is never chosen by Auto, on any task or tier', () => {
    const organizationPolicy = policy({ blockedProviders: [DISABLED_PROVIDER] });
    for (const subscriptionTier of ['plus', 'pro', 'max', 'enterprise']) {
      for (const taskType of TASKS) {
        const decision = resolveAutoRoute({
          ...BASE,
          taskType,
          subscriptionTier,
          organizationPolicy,
        });
        if (decision.status !== 'selected') continue;
        expect(owningProvider(decision.modelKey)).not.toBe(DISABLED_PROVIDER);
        for (const fallback of decision.fallbacks) {
          expect(owningProvider(fallback.modelKey)).not.toBe(DISABLED_PROVIDER);
        }
      }
    }
  });

  it('is refused when the user names one of its models explicitly', () => {
    const named = requireProviderDefaultModel(DISABLED_PROVIDER);
    const decision = resolveAutoRoute({
      ...BASE,
      selection: named,
      organizationPolicy: policy({ blockedProviders: [DISABLED_PROVIDER] }),
    });
    expect(decision.status).toBe('unavailable');
  });

  it('is still refused when a gateway carries it, so OpenRouter is not a way around the deny', () => {
    const decision = evaluateModelAccess(policy({ blockedProviders: [DISABLED_PROVIDER] }), {
      provider: DISABLED_PROVIDER,
      transportProvider: 'open_router',
      modelId: requireProviderDefaultModel(DISABLED_PROVIDER),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
  });

  it('refuses the gateway itself when the gateway is what the administrator blocked', () => {
    const decision = evaluateModelAccess(policy({ blockedProviders: ['open_router'] }), {
      provider: DISABLED_PROVIDER,
      transportProvider: 'open_router',
      modelId: requireProviderDefaultModel(DISABLED_PROVIDER),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
  });
});

describe('a default model is not an access grant', () => {
  it('leaves a blocked model blocked even when it is named as the default selection', () => {
    const blocked = requireProviderDefaultModel('anthropic');
    const decision = resolveAutoRoute({
      ...BASE,
      selection: blocked,
      organizationPolicy: policy({ blockedModels: [blocked] }),
    });
    expect(decision.status).toBe('unavailable');
  });

  it('does not admit a model just because an allow list names a different one', () => {
    const allowed = requireProviderDefaultModel('openai');
    const other = requireProviderDefaultModel('anthropic');
    const decision = evaluateModelAccess(policy({ allowedModels: [allowed] }), {
      provider: 'anthropic',
      transportProvider: 'anthropic',
      modelId: other,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('model_not_allowed');
  });
});

describe('trust mode and model policy are independent gates', () => {
  const MODES: RoutingTrustMode[] = ['local', 'on_device', 'byok', 'managed_cloud'];

  it('refuses on trust mode before a model policy could allow it', () => {
    for (const mode of MODES.filter((candidate) => candidate !== 'byok')) {
      const decision = resolveAutoRoute({
        ...BASE,
        trustMode: mode,
        allowedTrustModes: ['byok'],
        organizationPolicy: policy({ allowedProviders: ['anthropic', 'openai'] }),
      });
      expect(decision.status).toBe('unavailable');
      if (decision.status !== 'unavailable') continue;
      expect(decision.code).toBe('trust_mode_not_permitted');
    }
  });
});
