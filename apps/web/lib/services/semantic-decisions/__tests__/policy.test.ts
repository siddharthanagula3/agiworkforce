import { describe, expect, it } from 'vitest';

import {
  DECISION_KILL_FLAG_KEY,
  decisionFlagKey,
  decisionFlagMode,
} from '@/lib/feature-flags/decision-flags';
import { stableBucket, type FlagEvaluation } from '@/lib/feature-flags/evaluate-flags';
import type { FlagDefinition } from '@/lib/feature-flags/flag-definition';

import { DECISION_BUDGET, decisionCohort, decisionPolicy, resolveDecisionMode } from '../policy';

const KIND = 'turn_signals';
const KEY = decisionFlagKey(KIND);
const MODEL = 'pinned-version';

function evaluation(overrides: Partial<FlagEvaluation> = {}): FlagEvaluation {
  return {
    key: KEY,
    variant: 'shadow',
    enabled: true,
    reason: 'rule',
    ruleId: 'ramp',
    version: 1,
    ...overrides,
  };
}

function definition(percentage: number): FlagDefinition {
  return {
    key: KEY,
    description: '',
    killSwitch: false,
    variants: ['off', 'shadow', 'enabled'],
    defaultVariant: 'off',
    rules: [
      {
        id: 'ramp',
        conditions: {},
        rollout: { percentage },
        bucketBy: 'user',
        variant: 'shadow',
      },
    ],
    expiresAt: null,
    version: 1,
    archivedAt: null,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
  };
}

function resolve(
  evaluations: Record<string, FlagEvaluation>,
  definitions: FlagDefinition[] = [definition(100)],
) {
  return resolveDecisionMode({
    kind: KIND,
    evaluations,
    definitions,
    bucketId: 'user-1',
    nowMs: Date.parse('2026-09-20T12:00:00.000Z'),
  });
}

describe('which mode a decision kind runs in', () => {
  it('is disabled when no flag exists, which is every deployment today', () => {
    expect(resolve({}).mode).toBe('disabled');
    expect(decisionPolicy(KIND, MODEL, resolve({})).mode).toBe('disabled');
  });

  it('is disabled when the flag serves off', () => {
    expect(resolve({ [KEY]: evaluation({ variant: 'off', enabled: false }) }).mode).toBe(
      'disabled',
    );
  });

  it('is shadow, then enabled, as the flag says', () => {
    expect(resolve({ [KEY]: evaluation({ variant: 'shadow' }) }).mode).toBe('shadow');
    expect(resolve({ [KEY]: evaluation({ variant: 'enabled' }) }).mode).toBe('enabled');
  });

  it('is disabled for a variant no reader recognises', () => {
    expect(resolve({ [KEY]: evaluation({ variant: 'on' }) }).mode).toBe('disabled');
  });

  it('is disabled for every kind once the kill switch is on', () => {
    const killed = {
      [KEY]: evaluation({ variant: 'enabled' }),
      [DECISION_KILL_FLAG_KEY]: evaluation({
        key: DECISION_KILL_FLAG_KEY,
        variant: 'on',
        enabled: true,
      }),
    };
    expect(decisionFlagMode(killed, KIND)).toBe('disabled');
    expect(resolve(killed).mode).toBe('disabled');
  });

  it('leaves the kill switch harmless when it serves off', () => {
    expect(
      resolve({
        [KEY]: evaluation({ variant: 'enabled' }),
        [DECISION_KILL_FLAG_KEY]: evaluation({
          key: DECISION_KILL_FLAG_KEY,
          variant: 'off',
          enabled: false,
        }),
      }).mode,
    ).toBe('enabled');
  });
});

describe('the population a decision kind is asked for', () => {
  it('takes the sample rate from the rule that served', () => {
    expect(resolve({ [KEY]: evaluation() }, [definition(25)]).sampleRate).toBe(0.25);
  });

  it('admits everyone when an override or the default served, since no bucket was drawn', () => {
    expect(
      resolve({ [KEY]: evaluation({ reason: 'user_override', ruleId: null }) }, [definition(5)])
        .sampleRate,
    ).toBe(1);
  });

  it('seeds the cohort exactly as the flag evaluator seeds its own bucket', () => {
    // Same seed and same threshold, so the evaluator's sample gate selects the
    // population the flag already selected rather than a smaller one.
    expect(decisionCohort(KIND, 'ramp', 'user-1')).toBe(stableBucket(`${KEY}:ramp:user-1`));
  });

  it('gives a subject the same place every time, so a ramp does not reshuffle it', () => {
    expect(decisionCohort(KIND, 'ramp', 'user-1')).toBe(decisionCohort(KIND, 'ramp', 'user-1'));
    expect(decisionCohort(KIND, 'ramp', 'user-1')).not.toBe(decisionCohort(KIND, 'ramp', 'user-2'));
  });

  it('admits a subject the flag admitted, and refuses one it did not', () => {
    const rate = resolve({ [KEY]: evaluation() }, [definition(100)]).sampleRate;
    expect(decisionCohort(KIND, 'ramp', 'user-1')).toBeLessThan(rate);
    expect(decisionCohort(KIND, 'ramp', 'user-1')).not.toBeLessThan(
      resolve({ [KEY]: evaluation() }, [definition(0)]).sampleRate,
    );
  });

  it('carries the host budget and the pinned model rather than inventing either', () => {
    expect(decisionPolicy(KIND, MODEL, resolve({ [KEY]: evaluation() }))).toMatchObject({
      ...DECISION_BUDGET,
      model: MODEL,
    });
  });
});
