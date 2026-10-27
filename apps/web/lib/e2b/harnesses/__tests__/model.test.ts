import { describe, expect, it } from 'vitest';
import { canAccessModelForSubscriptionTier, getSelectableModels } from '@agiworkforce/types';
import { harnessModelProvider, resolveHarnessModel } from '../model';

const anthropic = getSelectableModels().filter((model) => model.provider === 'anthropic');
const onPro = anthropic.find((model) => canAccessModelForSubscriptionTier(model.id, 'pro'));
const maxOnly = anthropic.find((model) => !canAccessModelForSubscriptionTier(model.id, 'pro'));
const otherVendor = getSelectableModels().find((model) => model.provider === 'openai');

function apiId(model: { id: string; apiModelId?: string }): string {
  return model.apiModelId ?? model.id;
}

describe('the model a coding agent runs', () => {
  it('has catalog models to test with', () => {
    expect(harnessModelProvider('claude')).toBe('anthropic');
    expect(onPro).toBeDefined();
    expect(maxOnly).toBeDefined();
    expect(otherVendor).toBeDefined();
  });

  it('keeps the picked model when it is the agent provider’s and the plan includes it', () => {
    expect(resolveHarnessModel('claude', onPro!.id, 'pro')).toBe(apiId(onPro!));
  });

  it('swaps a model the plan does not include for one it does, from the same provider', () => {
    const chosen = resolveHarnessModel('claude', maxOnly!.id, 'pro');
    const meta = anthropic.find((model) => apiId(model) === chosen);

    expect(meta).toBeDefined();
    expect(canAccessModelForSubscriptionTier(meta!.id, 'pro')).toBe(true);
  });

  it('gives the agent a model of its own provider when another vendor’s was picked', () => {
    const chosen = resolveHarnessModel('claude', otherVendor!.id, 'pro');

    expect(anthropic.some((model) => apiId(model) === chosen)).toBe(true);
  });

  it('leaves an agent with no catalog provider on its own default', () => {
    expect(resolveHarnessModel('not-a-harness', onPro!.id, 'pro')).toBeNull();
  });
});
