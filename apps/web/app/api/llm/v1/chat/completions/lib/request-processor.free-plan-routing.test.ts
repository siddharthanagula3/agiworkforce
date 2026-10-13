import { canAccessModelForSubscriptionTier, getDefaultModelFor } from '@agiworkforce/types';
import { describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/logger');

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { applyFreePlanDefaultModel, resolveWebCloudModelRoute } from './request-processor';

// The tier gate skips `auto`, so the resolver's own admission is what protects
// the free plan here; a second rewrite would be a second answer to one question.
const FREE_TIER = 'free';
const TASK_TYPES = [
  'simple_chat',
  'general',
  'coding',
  'reasoning',
  'research',
  'agentic',
  'multimodal',
] as const;

describe('a free plan request that names auto', () => {
  it.each(TASK_TYPES)('is served the free tier default for %s', (taskType) => {
    const decision = resolveWebCloudModelRoute('auto', FREE_TIER, taskType);
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;
    expect(decision.modelKey).toBe(getDefaultModelFor(FREE_TIER, 'chat'));
  });

  it.each(TASK_TYPES)('is never dispatched outside the free plan for %s', (taskType) => {
    const decision = resolveWebCloudModelRoute('auto', FREE_TIER, taskType);
    if (decision.status !== 'selected') return;
    expect(canAccessModelForSubscriptionTier(decision.modelKey, FREE_TIER), decision.modelKey).toBe(
      true,
    );
    for (const fallback of decision.fallbacks) {
      expect(
        canAccessModelForSubscriptionTier(fallback.modelKey, FREE_TIER),
        fallback.modelKey,
      ).toBe(true);
    }
  });

  it('is not refused, which is what an unreachable fallback slot would produce', () => {
    for (const taskType of TASK_TYPES) {
      expect(resolveWebCloudModelRoute('auto', FREE_TIER, taskType).status).toBe('selected');
    }
  });

  it('still reaches the economy pool on the basic plan, which the free plan may not', () => {
    const decision = resolveWebCloudModelRoute('auto', 'basic', 'reasoning');
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;
    expect(decision.modelKey).not.toBe(getDefaultModelFor(FREE_TIER, 'chat'));
    expect(canAccessModelForSubscriptionTier(decision.modelKey, FREE_TIER)).toBe(false);
  });
});

describe('a free plan request that arrives at the route still naming Auto', () => {
  const FREE_MODEL = getDefaultModelFor(FREE_TIER, 'chat');

  it.each(['auto', 'auto-economy'])('is served the plan model for %s, not refused', (alias) => {
    const chatRequest = { model: alias };
    applyFreePlanDefaultModel(chatRequest, FREE_TIER);
    expect(chatRequest.model).toBe(FREE_MODEL);
    expect(canAccessModelForSubscriptionTier(chatRequest.model, FREE_TIER)).toBe(true);
  });

  it('leaves a model the reader named alone, so the tier gate still answers for it', () => {
    const chatRequest = { model: 'some-pinned-model' };
    applyFreePlanDefaultModel(chatRequest, FREE_TIER);
    expect(chatRequest.model).toBe('some-pinned-model');
  });

  it.each(['basic', 'pro', 'max', null])('never touches Auto on the %s plan', (planTier) => {
    const chatRequest = { model: 'auto' };
    applyFreePlanDefaultModel(chatRequest, planTier);
    expect(chatRequest.model).toBe('auto');
  });
});
