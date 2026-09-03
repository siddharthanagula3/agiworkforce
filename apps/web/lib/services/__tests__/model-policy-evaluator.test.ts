import { describe, expect, it } from 'vitest';

import {
  evaluateModelAccess,
  policyRestrictsAnything,
  type ModelAccessPolicy,
} from '../model-policy-evaluator';

function policy(over: Partial<ModelAccessPolicy> = {}): ModelAccessPolicy {
  return {
    allowedProviders: [],
    blockedProviders: [],
    allowedModels: [],
    blockedModels: [],
    ...over,
  };
}

// Deliberately not catalog ids: this evaluator must be provably independent of
// which models happen to exist, and a real id here would rot with the catalog.
const MODEL = 'fixture-model-alpha';
const OTHER_MODEL = 'fixture-model-beta';

describe('evaluateModelAccess', () => {
  it('allows everything when there is no policy at all', () => {
    const decision = evaluateModelAccess(null, { provider: 'openai', modelId: MODEL });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('ungoverned');
  });

  it('AN EMPTY ALLOWLIST DOES NOT DENY EVERYTHING', () => {
    const decision = evaluateModelAccess(policy(), { provider: 'openai', modelId: MODEL });
    expect(decision.allowed).toBe(true);
  });

  it('blocks a model an administrator named', () => {
    const decision = evaluateModelAccess(policy({ blockedModels: [MODEL] }), {
      provider: 'openai',
      modelId: MODEL,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('model_blocked');
  });

  it('lets a model block override its own provider allowlist', () => {
    const decision = evaluateModelAccess(
      policy({ allowedProviders: ['openai'], blockedModels: [MODEL] }),
      { provider: 'openai', modelId: MODEL },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('model_blocked');
  });

  it('lets a named model escape a blocked provider', () => {
    // "No Provider X except this one model" is a policy enterprises actually
    // write, and it cannot be expressed if the provider block swallows it.
    const decision = evaluateModelAccess(
      policy({ blockedProviders: ['openai'], allowedModels: [MODEL] }),
      { provider: 'openai', modelId: MODEL },
    );
    expect(decision.allowed).toBe(true);
  });

  it('still blocks the provider’s other models when one is excepted', () => {
    const decision = evaluateModelAccess(
      policy({ blockedProviders: ['openai'], allowedModels: [MODEL] }),
      { provider: 'openai', modelId: OTHER_MODEL },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
  });

  it('blocks a provider an administrator named', () => {
    const decision = evaluateModelAccess(policy({ blockedProviders: ['anthropic'] }), {
      provider: 'anthropic',
      modelId: MODEL,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
  });

  it('denies a model outside a non-empty model allowlist', () => {
    const decision = evaluateModelAccess(policy({ allowedModels: [MODEL] }), {
      provider: 'openai',
      modelId: OTHER_MODEL,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('model_not_allowed');
  });

  it('denies a provider outside a non-empty provider allowlist', () => {
    const decision = evaluateModelAccess(policy({ allowedProviders: ['anthropic'] }), {
      provider: 'openai',
      modelId: MODEL,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_not_allowed');
  });

  it('admits a provider on a non-empty provider allowlist', () => {
    const decision = evaluateModelAccess(policy({ allowedProviders: ['anthropic'] }), {
      provider: 'anthropic',
      modelId: MODEL,
    });
    expect(decision.allowed).toBe(true);
  });

  it('matches without regard to case or surrounding whitespace', () => {
    const decision = evaluateModelAccess(policy({ blockedModels: ['  Fixture-Model-Alpha '] }), {
      provider: 'OpenAI',
      modelId: MODEL,
    });
    expect(decision.allowed).toBe(false);
  });

  it('does not treat a missing model or provider as a match for anything', () => {
    // An unlabelled request must not accidentally satisfy an allowlist by
    // matching the empty string.
    expect(
      evaluateModelAccess(policy({ allowedModels: [''] }), { provider: null, modelId: null })
        .allowed,
    ).toBe(false);
    expect(
      evaluateModelAccess(policy({ blockedModels: [''] }), { provider: null, modelId: null }).code,
    ).not.toBe('model_blocked');
  });

  it('is total: every combination yields a decision rather than throwing', () => {
    const asks = [
      { provider: null, modelId: null },
      { provider: '', modelId: '' },
      { provider: 'openai', modelId: MODEL },
    ];
    const policies = [
      null,
      policy(),
      policy({ allowedProviders: ['openai'] }),
      policy({ blockedProviders: ['openai'] }),
      policy({ allowedModels: [MODEL] }),
      policy({ blockedModels: [MODEL] }),
    ];

    for (const p of policies) {
      for (const ask of asks) {
        const decision = evaluateModelAccess(p, ask);
        expect(typeof decision.allowed).toBe('boolean');
        expect(decision.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('carries an actionable reason on every denial', () => {
    const denials = [
      evaluateModelAccess(policy({ blockedModels: [MODEL] }), {
        provider: 'openai',
        modelId: MODEL,
      }),
      evaluateModelAccess(policy({ blockedProviders: ['openai'] }), {
        provider: 'openai',
        modelId: MODEL,
      }),
      evaluateModelAccess(policy({ allowedModels: [OTHER_MODEL] }), {
        provider: 'openai',
        modelId: MODEL,
      }),
    ];
    for (const decision of denials) {
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toMatch(/administrator/i);
    }
  });
});

describe('policyRestrictsAnything', () => {
  it('reports a saved but empty policy as governing nothing', () => {
    expect(policyRestrictsAnything(policy())).toBe(false);
    expect(policyRestrictsAnything(null)).toBe(false);
  });

  it('reports any non-empty list as a restriction', () => {
    expect(policyRestrictsAnything(policy({ blockedModels: [MODEL] }))).toBe(true);
    expect(policyRestrictsAnything(policy({ allowedProviders: ['openai'] }))).toBe(true);
  });
});
