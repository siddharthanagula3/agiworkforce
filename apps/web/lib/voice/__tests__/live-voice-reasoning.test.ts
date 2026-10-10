import { describe, expect, it, vi } from 'vitest';
import { getModelEffortOptions, getVoiceLiveBackendModel } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

import { resolveLiveVoiceReasoning } from '../live-voice-reasoning';

const DELEGATION_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
const PAID_BACKEND = getVoiceLiveBackendModel('pro');
const FREE_BACKEND = getVoiceLiveBackendModel('free');

function lowestOf(modelId: string): string {
  return getModelEffortOptions(modelId)
    .filter((effort) => DELEGATION_EFFORTS.includes(effort))
    .sort((a, b) => DELEGATION_EFFORTS.indexOf(a) - DELEGATION_EFFORTS.indexOf(b))[0]!;
}

describe('resolveLiveVoiceReasoning', () => {
  it('holds Free to Instant on the server even when Thinking is asked for', () => {
    const choice = resolveLiveVoiceReasoning({
      backendModelId: FREE_BACKEND,
      requested: 'thinking',
      planTier: 'free',
    });

    expect(choice).toEqual({ level: 'instant', effort: lowestOf(FREE_BACKEND) });
  });

  it('gives a paid plan the lowest effort for Instant and a deeper one for Thinking', () => {
    const instant = resolveLiveVoiceReasoning({
      backendModelId: PAID_BACKEND,
      requested: 'instant',
      planTier: 'pro',
    });
    const thinking = resolveLiveVoiceReasoning({
      backendModelId: PAID_BACKEND,
      requested: 'thinking',
      planTier: 'pro',
    });

    expect(instant).toEqual({ level: 'instant', effort: lowestOf(PAID_BACKEND) });
    expect(thinking.level).toBe('thinking');
    expect(DELEGATION_EFFORTS.indexOf(thinking.effort!)).toBeGreaterThan(
      DELEGATION_EFFORTS.indexOf(instant.effort!),
    );
  });

  it('defaults to Instant when nothing is asked for', () => {
    expect(
      resolveLiveVoiceReasoning({ backendModelId: PAID_BACKEND, requested: null, planTier: 'max' })
        .level,
    ).toBe('instant');
  });

  it('never sends an effort the Live delegation refuses, such as max', () => {
    for (const planTier of ['free', 'basic', 'pro', 'max', 'enterprise']) {
      for (const requested of ['instant', 'thinking'] as const) {
        const choice = resolveLiveVoiceReasoning({
          backendModelId: getVoiceLiveBackendModel(planTier),
          requested,
          planTier,
        });
        expect(DELEGATION_EFFORTS).toContain(choice.effort);
      }
    }
  });
});
