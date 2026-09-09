import { describe, expect, it } from 'vitest';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import { modelRegistry } from '@agiworkforce/model-registry';
import { resolveAutoRoute, type AutoRoutingRequest } from '../auto';

/**
 * Automatic routing must not choose a provider the caller has excluded, and
 * must still serve one the user named.
 *
 * The excluded set is caller-supplied rather than compiled into the catalog,
 * so this is the only place the rule is enforced and the only place it can be
 * proved.
 *
 * Every assertion reads the MODEL's owning provider, never the decision's
 * `provider`, which names the route host. A DeepSeek model selected through a
 * gateway reports the gateway there, so asserting on it would have passed
 * while the exclusion did nothing. That is what the first draft of this file
 * did, and the control below is what caught it.
 */
const EXCLUDED_PROVIDER = 'qwen';
const EXCLUDED_MODEL_ID = requireProviderDefaultModel(EXCLUDED_PROVIDER);

const BASE: AutoRoutingRequest = {
  taskType: 'reasoning',
  subscriptionTier: 'pro',
  trustMode: 'managed_cloud',
};

function excluded(request: Partial<AutoRoutingRequest>): AutoRoutingRequest {
  return { ...BASE, ...request, excludedProviders: new Set([EXCLUDED_PROVIDER]) };
}

function owningProvider(modelKey: string): string | undefined {
  const models = (modelRegistry as { models: Record<string, { identity: { provider: string } }> })
    .models;
  return models[modelKey]?.identity.provider;
}

describe('providers excluded from automatic routing', () => {
  it('never selects an excluded provider for Auto, on any task', () => {
    // `reasoning` is the one that matters and the reason this file exists: on
    // every tier and every Auto alias, the reasoning slot resolves to a model
    // this provider owns. The other tasks are here so a catalog change that
    // moves the exposure elsewhere is still caught.
    const tasks: AutoRoutingRequest['taskType'][] = [
      'reasoning',
      'general',
      'simple_chat',
      'coding',
      'agentic',
      'creative_writing',
      'long_context',
      'research',
    ];
    for (const tier of ['free', 'basic', 'plus', 'pro', 'max', 'enterprise']) {
      for (const taskType of tasks) {
        const decision = resolveAutoRoute(
          excluded({ taskType, subscriptionTier: tier, selection: 'auto' }),
        );
        if (decision.status !== 'selected') continue;
        expect(owningProvider(decision.modelKey)).not.toBe(EXCLUDED_PROVIDER);
      }
    }
  });

  it('does not exclude the provider when nothing asked it to', () => {
    // The control. Without this, the assertion above would pass on a registry
    // that never ranks the provider highly enough to be selected anyway, and
    // would prove nothing about the exclusion.
    const decision = resolveAutoRoute({ ...BASE, selection: EXCLUDED_MODEL_ID });
    expect(decision.status).toBe('selected');
    if (decision.status === 'selected') {
      expect(owningProvider(decision.modelKey)).toBe(EXCLUDED_PROVIDER);
    }
  });

  it('still serves the model when the user names it, because that is their decision', () => {
    const decision = resolveAutoRoute(excluded({ selection: EXCLUDED_MODEL_ID }));
    expect(decision.status).toBe('selected');
    if (decision.status === 'selected') {
      expect(owningProvider(decision.modelKey)).toBe(EXCLUDED_PROVIDER);
      expect(decision.reason).toBe('explicit');
    }
  });

  it('keeps the exclusion when an explicit choice falls back to Auto', () => {
    // The capability fallback re-enters through the alias carrying the
    // unmodified request, so the exclusion applies to what Auto picks there
    // even though it did not apply to the model the user named.
    const decision = resolveAutoRoute(
      excluded({
        selection: EXCLUDED_MODEL_ID,
        requiredCapabilities: ['imageOutput'],
        fallbackToAutoForCapabilityMismatch: true,
      }),
    );
    if (decision.status === 'selected') {
      expect(owningProvider(decision.modelKey)).not.toBe(EXCLUDED_PROVIDER);
    }
  });
});

/**
 * The transport axis, which is a different question from the one above.
 *
 * Measured on 2026-09-08: of 240 tier x task x alias combinations, exactly one
 * Auto route dispatches through a model vendor's own endpoint rather than a
 * gateway, and every model it could reach that way is carried by other hosts
 * at an identical price. So excluding the vendor-run transports costs no
 * capability and no money, which is why this is separable from excluding the
 * models themselves.
 */
describe('transports excluded from routing', () => {
  const VENDOR_OWN_HOSTS = new Set(['qwen', 'deepseek', 'moonshot', 'zhipu', 'minimax']);

  function withoutVendorHosts(request: Partial<AutoRoutingRequest>): AutoRoutingRequest {
    return { ...BASE, ...request, excludedRouteHosts: VENDOR_OWN_HOSTS };
  }

  it('never dispatches Auto through an excluded transport, on any tier or task', () => {
    const tasks: AutoRoutingRequest['taskType'][] = [
      'reasoning',
      'general',
      'simple_chat',
      'coding',
      'agentic',
      'long_context',
    ];
    for (const tier of ['free', 'basic', 'plus', 'pro', 'max', 'enterprise']) {
      for (const taskType of tasks) {
        const decision = resolveAutoRoute(
          withoutVendorHosts({ taskType, subscriptionTier: tier, selection: 'auto' }),
        );
        if (decision.status !== 'selected') continue;
        expect(VENDOR_OWN_HOSTS.has(decision.provider)).toBe(false);
      }
    }
  });

  it('still serves the model, through another host', () => {
    // The point of separating the axes. Excluding the transport must not
    // remove the model, or this is just the owner exclusion wearing a
    // different name.
    const decision = resolveAutoRoute(
      withoutVendorHosts({ taskType: 'reasoning', subscriptionTier: 'free', selection: 'auto' }),
    );
    expect(decision.status).toBe('selected');
    if (decision.status === 'selected') {
      expect(owningProvider(decision.modelKey)).toBe('qwen');
      expect(decision.provider).not.toBe('qwen');
    }
  });

  it('applies to a model the user named, because they chose a model and not a datacentre', () => {
    const decision = resolveAutoRoute(
      withoutVendorHosts({ taskType: 'reasoning', selection: 'qwen-3.8-flash' }),
    );
    expect(decision.status).toBe('selected');
    if (decision.status === 'selected') {
      expect(decision.modelKey).toBe('qwen-3.8-flash');
      expect(VENDOR_OWN_HOSTS.has(decision.provider)).toBe(false);
    }
  });
});
