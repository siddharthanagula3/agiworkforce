import { describe, expect, it } from 'vitest';

import { evaluateModelAccess, type ModelAccessPolicy } from '@/lib/services/model-policy-evaluator';

/**
 * Vendor versus transport.
 *
 * `resolveProviderFromModel` answers a DISPATCH question, and for the
 * aggregator-routed vendors (MiniMax, Qwen, Zhipu) it returns `"openrouter"`
 * once `OPENROUTER_API_KEY` is set, collapsing the vendor away. Handing that
 * one string to a policy written about vendors broke the gate in BOTH
 * directions: a MiniMax block matched nothing and a MiniMax allow matched
 * nothing either.
 *
 * The rule under test: a BLOCK matches either identity, an ALLOWLIST is
 * satisfied by the vendor alone.
 */

function policy(overrides: Partial<ModelAccessPolicy> = {}): ModelAccessPolicy {
  return {
    allowedProviders: [],
    blockedProviders: [],
    allowedModels: [],
    blockedModels: [],
    ...overrides,
  };
}

describe('a block matches either provider identity', () => {
  it('denies a vendor-blocked model that an aggregator is carrying (the walk-around)', () => {
    const decision = evaluateModelAccess(policy({ blockedProviders: ['minimax'] }), {
      provider: 'minimax',
      modelId: 'some-minimax-model',
      transportProvider: 'openrouter',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
    expect(decision.reason).toContain('minimax');
  });

  it('denies on the transport when the administrator blocked the aggregator itself', () => {
    const decision = evaluateModelAccess(policy({ blockedProviders: ['open_router'] }), {
      provider: 'minimax',
      modelId: 'some-minimax-model',
      transportProvider: 'openrouter',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
    // Names the rule the administrator actually wrote, not the vendor.
    expect(decision.reason).toContain('openrouter');
  });

  it('leaves an unrelated block alone', () => {
    const decision = evaluateModelAccess(policy({ blockedProviders: ['anthropic'] }), {
      provider: 'minimax',
      modelId: 'some-minimax-model',
      transportProvider: 'openrouter',
    });

    expect(decision.allowed).toBe(true);
  });
});

describe('an allowlist is satisfied by the vendor alone', () => {
  it('admits a vendor the administrator approved even though an aggregator carries it', () => {
    const decision = evaluateModelAccess(policy({ allowedProviders: ['minimax'] }), {
      provider: 'minimax',
      modelId: 'some-minimax-model',
      transportProvider: 'openrouter',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('allowed');
  });

  it('does not let the transport satisfy an allowlist the vendor is absent from', () => {
    const decision = evaluateModelAccess(policy({ allowedProviders: ['open_router'] }), {
      provider: 'minimax',
      modelId: 'some-minimax-model',
      transportProvider: 'openrouter',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_not_allowed');
  });

  it('still admits a genuine catalog OpenRouter model under an OpenRouter allowlist', () => {
    const decision = evaluateModelAccess(policy({ allowedProviders: ['open_router'] }), {
      provider: 'open_router',
      modelId: 'some-open-router-model',
      transportProvider: 'openrouter',
    });

    expect(decision.allowed).toBe(true);
  });

  it('keeps denying a vendor that is on neither list', () => {
    const decision = evaluateModelAccess(policy({ allowedProviders: ['anthropic'] }), {
      provider: 'minimax',
      modelId: 'some-minimax-model',
      transportProvider: 'openrouter',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_not_allowed');
  });
});

describe('an ask without a transport behaves exactly as before', () => {
  it('blocks on the single provider it was given', () => {
    const decision = evaluateModelAccess(
      policy({
        // The adapter spelling, which an older console wrote into some rows.
        blockedProviders: ['openrouter'] as unknown as ModelAccessPolicy['blockedProviders'],
      }),
      { provider: 'open_router', modelId: 'some-anthropic-model' },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
  });

  it('allows on the single provider it was given', () => {
    const decision = evaluateModelAccess(policy({ allowedProviders: ['anthropic'] }), {
      provider: 'anthropic',
      modelId: 'some-anthropic-model',
    });

    expect(decision.allowed).toBe(true);
  });
});
