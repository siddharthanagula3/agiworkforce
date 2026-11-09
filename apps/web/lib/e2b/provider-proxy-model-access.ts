import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { canAccessModelForSubscriptionTier, getModelMetadataById } from '@agiworkforce/types';
import { evaluateModelAccessForOrganization } from '@/lib/services/model-policy-gate';

export const PROVIDER_PROXY_MODEL_NOT_IN_PLAN_CODE = 'provider_proxy_model_not_in_plan';

export type ProviderProxyModelAccess =
  { allowed: true } | { allowed: false; code: string; message: string };

export interface ProviderProxyModelAccessInput {
  db: DatabaseAdapter;
  organizationId: string | null;
  planTier: string;
  providerId: string;
  model: string;
  requestedModel: string;
}

/**
 * A coding agent picks its own model, so the proxy applies the same two checks a
 * chat turn gets before anything is reserved or forwarded: the person's plan
 * includes the model, and the model policy of the workspace that owns the
 * session allows it. The owner organization comes from the session, never from
 * the workspace the person has selected since.
 */
export async function evaluateProviderProxyModelAccess(
  input: ProviderProxyModelAccessInput,
): Promise<ProviderProxyModelAccess> {
  if (!canAccessModelForSubscriptionTier(input.model, input.planTier)) {
    return {
      allowed: false,
      code: PROVIDER_PROXY_MODEL_NOT_IN_PLAN_CODE,
      message: `${input.requestedModel} is not included in your plan. Choose a model your plan includes for this agent.`,
    };
  }
  const vendor = getModelMetadataById(input.model)?.provider ?? input.providerId;
  const policy = await evaluateModelAccessForOrganization(input.db, input.organizationId, {
    provider: vendor,
    modelId: input.model,
    ...(vendor !== input.providerId ? { transportProvider: input.providerId } : {}),
  });
  return policy.allowed
    ? { allowed: true }
    : { allowed: false, code: policy.code, message: policy.reason };
}
