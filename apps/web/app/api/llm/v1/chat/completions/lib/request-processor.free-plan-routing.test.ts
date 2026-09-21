import { getDefaultModelFor, getModelMetadataById } from '@agiworkforce/types';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { resolveWebCloudModelRoute } from './request-processor';

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

  it.each(TASK_TYPES)('is never dispatched to a model that bills for %s', (taskType) => {
    const decision = resolveWebCloudModelRoute('auto', FREE_TIER, taskType);
    if (decision.status !== 'selected') return;
    const metadata = getModelMetadataById(decision.modelKey);
    expect(metadata?.inputCost, decision.modelKey).toBe(0);
    expect(metadata?.outputCost, decision.modelKey).toBe(0);
    expect(metadata?.tierPolicy?.minTier, decision.modelKey).toBe(FREE_TIER);
  });

  it('is not refused, which is what an unreachable fallback slot would produce', () => {
    for (const taskType of TASK_TYPES) {
      expect(resolveWebCloudModelRoute('auto', FREE_TIER, taskType).status).toBe('selected');
    }
  });

  it('still reaches the priced economy pool on the basic plan, which pays for it', () => {
    const decision = resolveWebCloudModelRoute('auto', 'basic', 'general');
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;
    expect(decision.modelKey).not.toBe(getDefaultModelFor(FREE_TIER, 'chat'));
  });
});
