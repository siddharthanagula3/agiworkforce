import { describe, expect, it } from 'vitest';

import {
  evaluateModelAccess,
  policyRestrictsAnything,
  type ModelAccessPolicy,
} from '../model-policy';
import { resolveAutoRoute } from '../auto';

const LIST_FIELDS = [
  'allowedProviders',
  'blockedProviders',
  'allowedModels',
  'blockedModels',
] as const;

function wholePolicy(): ModelAccessPolicy {
  return {
    allowedProviders: [],
    blockedProviders: ['minimax'],
    allowedModels: [],
    blockedModels: [],
  } as ModelAccessPolicy;
}

const ASK = { provider: 'anthropic', modelId: 'some-model' };

describe('a policy object that reaches the evaluator incomplete', () => {
  for (const field of LIST_FIELDS) {
    it(`still yields a decision when ${field} is absent`, () => {
      const policy = wholePolicy();
      delete (policy as Record<string, unknown>)[field];
      const decision = evaluateModelAccess(policy, ASK);
      expect(decision.code).toBeTruthy();
      expect(typeof decision.allowed).toBe('boolean');
    });

    it(`still yields a decision when ${field} is null`, () => {
      const policy = wholePolicy();
      (policy as Record<string, unknown>)[field] = null;
      const decision = evaluateModelAccess(policy, ASK);
      expect(decision.code).toBeTruthy();
    });
  }

  it('reads an absent list as governing nothing, never as denying everything', () => {
    const decision = evaluateModelAccess(
      { blockedProviders: ['minimax'] } as unknown as ModelAccessPolicy,
      ASK,
    );
    expect(decision.allowed).toBe(true);
  });

  it('still honours the lists that did arrive', () => {
    const decision = evaluateModelAccess(
      { blockedProviders: ['anthropic'] } as unknown as ModelAccessPolicy,
      ASK,
    );
    expect(decision).toMatchObject({ allowed: false, code: 'provider_blocked' });
  });

  it('reports restriction without reading a list that is not there', () => {
    expect(policyRestrictsAnything({ blockedModels: ['x'] } as unknown as ModelAccessPolicy)).toBe(
      true,
    );
    expect(policyRestrictsAnything({} as unknown as ModelAccessPolicy)).toBe(false);
  });

  it('lets the router refuse with a reason rather than fail the request', () => {
    const decision = resolveAutoRoute({
      selection: 'auto',
      taskType: 'general',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      organizationPolicy: {
        blockedProviders: ['anthropic', 'openai', 'google'],
      } as unknown as ModelAccessPolicy,
    });
    expect(decision.status === 'selected' || decision.reasons.length > 0).toBe(true);
  });
});
