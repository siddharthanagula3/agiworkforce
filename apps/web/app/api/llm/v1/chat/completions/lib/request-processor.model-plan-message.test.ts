import { BILLING_PLAN_PRICING, getAllowedModelsForTier } from '@agiworkforce/types';
import { getMinimumRequiredTier } from '@agiworkforce/types';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

type FreeTrialModule = typeof import('@/lib/services/free-trial-service');
type ContentSafetyModule = typeof import('@/lib/services/managed-content-safety-service');

vi.mock('@/lib/services/free-trial-service', async (importOriginal) => {
  const actual = await importOriginal<FreeTrialModule>();
  return {
    ...actual,
    beginFreeTrialRequest: vi.fn(async ({ userId, requestId }) => ({
      ok: true,
      reservation: { kind: 'free_trial', userId, requestId, reservedMicrousd: 25_000 },
    })),
    applyFreeTrialProviderBudget: vi.fn(() => ({ ok: true, maxOutputTokens: 1_024 })),
    settleFreeTrialRequest: vi.fn(async () => undefined),
  };
});

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => {
  const actual = await importOriginal<ContentSafetyModule>();
  return {
    ...actual,
    enforceManagedContentSafetyPreference: vi.fn(async () => ({ enabled: false, allowed: true })),
  };
});

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => {
    const { createDatabaseAdapterFake } = await import('@/test/database-adapter-fake');
    return { organizationId: null, db: createDatabaseAdapterFake(), userId: 'user-plan' };
  }),
}));

import { processRequest } from './request-processor';

interface DeniedBody {
  error: { code: string; requiredTier: string; message: string };
}

const CASES = [
  { callerPlan: 'basic', requiredTier: 'pro', additions: 'pro_additions' },
  { callerPlan: 'pro', requiredTier: 'max', additions: 'flagship_additions' },
] as const;

function subscriptionFor(planTier: string) {
  return {
    id: `sub-${planTier}`,
    user_id: 'user-plan',
    plan_tier: planTier,
    status: 'active' as const,
    current_period_start: new Date('2026-07-01T00:00:00Z'),
    current_period_end: new Date('2026-08-01T00:00:00Z'),
    stripe_subscription_id: `stripe-sub-${planTier}`,
    stripe_price_id: `stripe-price-${planTier}`,
  };
}

async function denialFor(
  model: string,
  planTier: string,
): Promise<{ status: number; body: DeniedBody } | null> {
  const result = await processRequest(
    new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `model-plan-message-${planTier}-${model}`,
        'x-agi-surface': 'web',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      }),
    }),
    {
      ok: true,
      userId: 'user-plan',
      token: 'session-token',
      subscription: subscriptionFor(planTier),
    },
  );
  if (result.ok) return null;
  return { status: result.response.status, body: (await result.response.json()) as DeniedBody };
}

describe('model_not_available plan message', () => {
  it.each(CASES)(
    'names the published label when $requiredTier is required and the caller is on $callerPlan',
    async ({ callerPlan, requiredTier, additions }) => {
      const label = BILLING_PLAN_PRICING[requiredTier].label;
      const candidates = getAllowedModelsForTier(additions).filter(
        (id) => getMinimumRequiredTier(id) === requiredTier,
      );
      let denial: Awaited<ReturnType<typeof denialFor>> = null;
      for (const model of candidates) {
        const attempt = await denialFor(model, callerPlan);
        if (attempt?.body.error.code === 'model_not_available') {
          denial = attempt;
          break;
        }
      }

      expect(denial).not.toBeNull();
      expect(denial?.status).toBe(403);
      expect(denial?.body.error.code).toBe('model_not_available');
      expect(denial?.body.error.requiredTier).toBe(requiredTier);
      expect(denial?.body.error.message).toContain(`${label} plan`);
      expect(denial?.body.error.message).not.toContain(`${requiredTier.toUpperCase()} plan`);
    },
  );
});
