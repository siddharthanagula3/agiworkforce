import { describe, expect, it } from 'vitest';

import type { Provider } from '@agiworkforce/types';
import {
  evaluateModelAccess,
  policyRestrictsAnything,
  type ModelAccessPolicy,
} from '@agiworkforce/routing';

// A saved row holds whatever spelling the administrator typed, which is wider
// than the catalogue union the type names.
const asWritten = (value: string): Provider => value as Provider;

/**
 * The transport a request happens to take must never decide whether a workspace
 * policy applies. A vendor reached through an aggregator, a different spelling
 * of the same vendor, or a route with no policy row attached are all ways an
 * administrator's rule could be walked around, so each one is asserted rather
 * than assumed from the routing layer's own tests.
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

describe('a provider route cannot bypass workspace model policy', () => {
  it('an aggregator transport does not launder a blocked vendor', () => {
    const decision = evaluateModelAccess(policy({ blockedProviders: ['minimax'] }), {
      provider: 'minimax',
      modelId: 'minimax/some-model',
      transportProvider: 'openrouter',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
    expect(decision.reason).toContain('minimax');
  });

  it('a blocked transport is refused even when the vendor is not named', () => {
    const decision = evaluateModelAccess(policy({ blockedProviders: [asWritten('openrouter')] }), {
      provider: 'minimax',
      modelId: 'minimax/some-model',
      transportProvider: 'openrouter',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
    expect(decision.reason).toContain('openrouter');
  });

  it('a transport on the allowlist does not satisfy it for an unlisted vendor', () => {
    const decision = evaluateModelAccess(policy({ allowedProviders: [asWritten('openrouter')] }), {
      provider: 'minimax',
      modelId: 'minimax/some-model',
      transportProvider: 'openrouter',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_not_allowed');
  });

  it.each([
    ['x-ai', 'x_ai'],
    ['XAI', 'xai'],
    ['grok', 'xai'],
    ['claude', 'anthropic'],
    ['Amazon Bedrock', 'bedrock'],
  ])('a rule written as %s still catches %s', (written, asked) => {
    const decision = evaluateModelAccess(policy({ blockedProviders: [asWritten(written)] }), {
      provider: asked,
      modelId: 'a-model',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('provider_blocked');
  });

  it('a model block outranks a provider allowlist that would admit it', () => {
    const decision = evaluateModelAccess(
      policy({ allowedProviders: ['openai'], blockedModels: ['banned-model'] }),
      { provider: 'openai', modelId: 'banned-model' },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('model_blocked');
  });

  it('a model allowlist refuses anything not on it, whatever the route', () => {
    const restrictive = policy({ allowedModels: ['approved-model'] });

    expect(
      evaluateModelAccess(restrictive, { provider: 'openai', modelId: 'approved-model' }).allowed,
    ).toBe(true);
    for (const transport of [null, 'openrouter', 'bedrock']) {
      const decision = evaluateModelAccess(restrictive, {
        provider: 'openai',
        modelId: 'other-model',
        transportProvider: transport,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe('model_not_allowed');
    }
  });

  it('a missing model or provider on the ask does not read as permission', () => {
    const restrictive = policy({ allowedProviders: ['openai'] });

    expect(evaluateModelAccess(restrictive, { provider: null, modelId: null }).allowed).toBe(false);
    expect(evaluateModelAccess(restrictive, { provider: '', modelId: 'anything' }).allowed).toBe(
      false,
    );
  });

  it('a saved row that governs nothing is reported as no control, not as a policy', () => {
    expect(policyRestrictsAnything(policy())).toBe(false);
    expect(policyRestrictsAnything(null)).toBe(false);
    expect(policyRestrictsAnything(policy({ blockedModels: ['x'] }))).toBe(true);
  });

  it('an ungoverned workspace is named as such rather than as an allow decision', () => {
    const decision = evaluateModelAccess(null, { provider: 'openai', modelId: 'a-model' });
    expect(decision.code).toBe('ungoverned');
  });
});
