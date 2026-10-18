import { describe, expect, it } from 'vitest';

import { evaluateModelAccess, type ModelAccessPolicy } from '../model-policy';

const ALLOWED_MODEL = 'fixture-allowed-model';

function policy(overrides: Partial<ModelAccessPolicy>): ModelAccessPolicy {
  return {
    allowedProviders: [],
    blockedProviders: [],
    allowedModels: [],
    blockedModels: [],
    ...overrides,
  };
}

describe('an allowlisted model and the two provider identities', () => {
  it('is still refused through a transport the administrator blocked', () => {
    const decision = evaluateModelAccess(
      policy({ blockedProviders: ['open_router'], allowedModels: [ALLOWED_MODEL] }),
      { provider: 'minimax', modelId: ALLOWED_MODEL, transportProvider: 'openrouter' },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
    expect(decision.reason).toContain('openrouter');
  });

  it('is excepted from a block on its own vendor', () => {
    const decision = evaluateModelAccess(
      policy({ blockedProviders: ['minimax'], allowedModels: [ALLOWED_MODEL] }),
      { provider: 'minimax', modelId: ALLOWED_MODEL, transportProvider: 'openrouter' },
    );

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('allowed');
  });

  it('is excepted from a vendor block on a direct route with no separate transport', () => {
    const decision = evaluateModelAccess(
      policy({ blockedProviders: ['minimax'], allowedModels: [ALLOWED_MODEL] }),
      { provider: 'minimax', modelId: ALLOWED_MODEL },
    );

    expect(decision.allowed).toBe(true);
  });
});
