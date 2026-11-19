import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  canAccessModelForSubscriptionTier,
  getAllowedModelsForTier,
  getModelMetadataById,
} from '@agiworkforce/types';

const policy = vi.hoisted(() => ({
  evaluate: vi.fn(async (): Promise<{ allowed: boolean; code: string; reason: string }> => ({
    allowed: true,
    code: 'ungoverned',
    reason: 'No workspace model policy applies to this request.',
  })),
}));
vi.mock('@/lib/services/model-policy-gate', () => ({
  evaluateModelAccessForOrganization: policy.evaluate,
}));

const { evaluateProviderProxyModelAccess, PROVIDER_PROXY_MODEL_NOT_IN_PLAN_CODE } =
  await import('../provider-proxy-model-access');

const maxOnlyModel = getAllowedModelsForTier('flagship_additions').find(
  (model) => !canAccessModelForSubscriptionTier(model, 'pro'),
);
const proModel = getAllowedModelsForTier('pro_additions').find((model) =>
  canAccessModelForSubscriptionTier(model, 'pro'),
);

const db = { query: vi.fn() } as unknown as DatabaseAdapter;

function ask(
  model: string,
  overrides: Partial<{ planTier: string; providerId: string; organizationId: string | null }> = {},
) {
  return {
    db,
    organizationId: overrides.organizationId === undefined ? 'org-1' : overrides.organizationId,
    planTier: overrides.planTier ?? 'pro',
    providerId: overrides.providerId ?? getModelMetadataById(model)?.provider ?? 'anthropic',
    model,
    requestedModel: model,
  };
}

describe('a coding agent asking the proxy for a model', () => {
  beforeEach(() => {
    policy.evaluate.mockClear();
  });

  it('has models on both sides of the Pro line to test with', () => {
    expect(maxOnlyModel).toBeDefined();
    expect(proModel).toBeDefined();
  });

  it('refuses a model the plan does not include, before asking the workspace', async () => {
    const decision = await evaluateProviderProxyModelAccess(ask(maxOnlyModel!));

    expect(decision).toEqual({
      allowed: false,
      code: PROVIDER_PROXY_MODEL_NOT_IN_PLAN_CODE,
      message: expect.stringContaining('not included in your plan'),
    });
    expect(policy.evaluate).not.toHaveBeenCalled();
  });

  it('admits the same model on a plan that includes it', async () => {
    expect(await evaluateProviderProxyModelAccess(ask(maxOnlyModel!, { planTier: 'max' }))).toEqual(
      { allowed: true },
    );
  });

  it('asks the workspace policy about the model and its vendor, and follows a refusal', async () => {
    policy.evaluate.mockResolvedValueOnce({
      allowed: false,
      code: 'model_not_allowed',
      reason: 'Your workspace does not allow this model.',
    });

    const decision = await evaluateProviderProxyModelAccess(ask(proModel!));

    expect(decision).toEqual({
      allowed: false,
      code: 'model_not_allowed',
      message: 'Your workspace does not allow this model.',
    });
    expect(policy.evaluate).toHaveBeenCalledWith(db, 'org-1', {
      provider: getModelMetadataById(proModel!)?.provider,
      modelId: proModel,
    });
  });

  it('asks the policy of the organization that owns the session, not a selected workspace', async () => {
    await evaluateProviderProxyModelAccess(ask(proModel!, { organizationId: 'org-owner' }));

    expect(policy.evaluate).toHaveBeenCalledWith(db, 'org-owner', expect.any(Object));
  });

  it('asks as personal scope for a session no organization owns', async () => {
    await evaluateProviderProxyModelAccess(ask(proModel!, { organizationId: null }));

    expect(policy.evaluate).toHaveBeenCalledWith(db, null, expect.any(Object));
  });

  it('names the transport when the call travels through another provider', async () => {
    await evaluateProviderProxyModelAccess(ask(proModel!, { providerId: 'openrouter' }));

    expect(policy.evaluate).toHaveBeenCalledWith(
      db,
      'org-1',
      expect.objectContaining({ transportProvider: 'openrouter' }),
    );
  });
});
