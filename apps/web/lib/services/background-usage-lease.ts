import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  beginFreeTrialRequest,
  isFreePlanTier,
  settleFreeTrialRequest,
} from '@/lib/services/free-trial-service';
import { LLMCostCalculator, type TokenUsage } from '@/lib/services/llm-cost-calculator';
import {
  finalizeManagedUsageRequest,
  ManagedUsageRequestError,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';

export interface BackgroundUsageLease {
  providerStarted(): Promise<void>;
  completed(input: {
    provider: string;
    model: string;
    routeId?: string | null;
    usage: TokenUsage;
    record: Record<string, unknown>;
  }): Promise<void>;
  failed(record: Record<string, unknown>): Promise<void>;
}

export async function reserveBackgroundUsage(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  planTier: string;
  idempotencyKey: string;
  requestHash: string;
  provider: string;
  model: string;
  routeId?: string | null;
  estimatedPromptTokens: number;
  maxOutputTokens: number;
  leaseSeconds: number;
  quotaFeature?: string;
}): Promise<BackgroundUsageLease> {
  if (isFreePlanTier(input.planTier)) {
    const begun = await beginFreeTrialRequest({
      userId: input.userId,
      requestId: input.idempotencyKey,
      estimatedMicrousd: LLMCostCalculator.calculateCostMicrousd(
        input.provider,
        input.model,
        {
          promptTokens: input.estimatedPromptTokens,
          completionTokens: input.maxOutputTokens,
          totalTokens: input.estimatedPromptTokens + input.maxOutputTokens,
        },
        undefined,
        input.routeId,
      ),
      leaseSeconds: input.leaseSeconds,
      provider: input.provider,
      model: input.model,
    });
    if (!begun.ok) {
      throw new ManagedUsageRequestError(
        'The Free usage windows cannot cover this call.',
        429,
        'free_trial_token_budget_reached',
      );
    }
    const reservation = begun.reservation;
    return {
      providerStarted: () => Promise.resolve(),
      completed: ({ provider, model, routeId, usage }) =>
        settleFreeTrialRequest({
          reservation,
          outcome: 'completed',
          provider,
          model,
          usage,
          cost: {
            tokenMicrousd: LLMCostCalculator.calculateCostMicrousd(
              provider,
              model,
              usage,
              undefined,
              routeId,
            ),
            toolMicrousd: 0,
          },
        }),
      failed: () => settleFreeTrialRequest({ reservation, outcome: 'failed' }),
    };
  }

  const reservation = await reserveManagedUsageRequest({
    db: input.db,
    userId: input.userId,
    organizationId: input.organizationId,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    provider: input.provider,
    model: input.model,
    estimatedCostCents: LLMCostCalculator.estimateCost(
      input.provider,
      input.model,
      input.estimatedPromptTokens,
      input.maxOutputTokens,
    ),
    leaseSeconds: input.leaseSeconds,
    planTier: input.planTier,
    isFlagship: false,
    ...(input.quotaFeature ? { quotaFeature: input.quotaFeature } : {}),
  });
  return {
    providerStarted: () => markManagedUsageProviderStarted(reservation),
    completed: async ({ provider, model, routeId, usage, record }) => {
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'completed',
        actualCostMicrousd: LLMCostCalculator.calculateCostMicrousd(
          provider,
          model,
          usage,
          undefined,
          routeId,
        ),
        usage: record,
      });
    },
    failed: async (record) => {
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'failed',
        actualCostCents: 0,
        usage: record,
      });
    },
  };
}
