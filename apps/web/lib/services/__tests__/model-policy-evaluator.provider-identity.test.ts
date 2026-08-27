import { describe, expect, it } from 'vitest';

import { evaluateModelAccess, type ModelAccessPolicy } from '@/lib/services/model-policy-evaluator';

/**
 * Provider-identifier dialects.
 *
 * A saved policy row holds the CATALOG spelling (`Provider` in
 * packages/contracts/types/src/provider.ts — `open_router`), while the ask
 * arrives from `resolveProviderFromModel`, which returns the ADAPTER spelling
 * (`openrouter`). A blunt lowercase comparison made every provider BLOCK inert
 * while leaving the allowlist direction looking healthy, so nothing surfaced it.
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

describe('provider blocks match across identifier dialects', () => {
  it('blocks an adapter-shaped ask against a catalog-shaped blocklist (the regression)', () => {
    const decision = evaluateModelAccess(policy({ blockedProviders: ['open_router'] }), {
      provider: 'openrouter',
      modelId: 'some-model',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
  });

  it('blocks a catalog-shaped ask against an adapter-shaped blocklist (symmetric)', () => {
    const decision = evaluateModelAccess(
      policy({
        blockedProviders: ['openrouter'] as unknown as ModelAccessPolicy['blockedProviders'],
      }),
      { provider: 'open_router', modelId: 'some-model' },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
  });

  it.each([
    ['open_router', 'openrouter'],
    ['open_router', 'open-router'],
    ['open_router', 'OpenRouter'],
    ['managed_cloud', 'managed-cloud'],
    ['managed_cloud', 'managedcloud'],
    ['nvidia_nim', 'nvidia-nim'],
    ['nvidia_nim', 'nvidia'],
    ['ollama_cloud', 'ollama-cloud'],
    ['lmstudio', 'lm-studio'],
    ['lmstudio', 'lm_studio'],
    ['xai', 'x_ai'],
    ['xai', 'grok'],
    ['zhipu', 'zhipu_ai'],
    ['zhipu', 'zhipuai'],
    ['google', 'gemini'],
    ['google', 'google-ai'],
    ['anthropic', 'claude'],
    ['openai', 'chatgpt'],
    ['bedrock', 'aws-bedrock'],
    ['bedrock', 'amazon_bedrock'],
  ])('blocklist entry %s denies an ask spelled %s', (stored, asked) => {
    const decision = evaluateModelAccess(
      policy({ blockedProviders: [stored] as unknown as ModelAccessPolicy['blockedProviders'] }),
      { provider: asked, modelId: 'some-model' },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
  });

  it('names the caller own spelling in the denial reason, not the canonical one', () => {
    const decision = evaluateModelAccess(policy({ blockedProviders: ['open_router'] }), {
      provider: 'openrouter',
      modelId: 'some-model',
    });

    expect(decision.reason).toContain('"openrouter"');
  });
});

describe('provider allowlists match across identifier dialects', () => {
  it('admits an adapter-shaped ask against a catalog-shaped allowlist', () => {
    const decision = evaluateModelAccess(policy({ allowedProviders: ['open_router'] }), {
      provider: 'openrouter',
      modelId: 'some-model',
    });

    expect(decision.allowed).toBe(true);
  });

  it('still denies a provider that is genuinely off the allowlist', () => {
    const decision = evaluateModelAccess(policy({ allowedProviders: ['anthropic'] }), {
      provider: 'openrouter',
      modelId: 'some-model',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_not_allowed');
  });
});

describe('normalization does not over-reach', () => {
  it('keeps distinct providers distinct once separators are squashed', () => {
    const decision = evaluateModelAccess(policy({ blockedProviders: ['open_router'] }), {
      provider: 'openai',
      modelId: 'some-model',
    });

    expect(decision.allowed).toBe(true);
  });

  it('does not squash separators inside MODEL ids, where they are load-bearing', () => {
    const decision = evaluateModelAccess(policy({ blockedModels: ['acme-5-1'] }), {
      provider: 'openai',
      modelId: 'acme-51',
    });

    expect(decision.allowed).toBe(true);
  });

  it('an empty provider ask cannot be captured by a blocklist entry', () => {
    const decision = evaluateModelAccess(policy({ blockedProviders: ['open_router'] }), {
      provider: null,
      modelId: 'some-model',
    });

    expect(decision.allowed).toBe(true);
  });
});
