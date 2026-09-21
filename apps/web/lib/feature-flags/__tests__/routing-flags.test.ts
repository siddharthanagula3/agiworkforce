import { describe, expect, it } from 'vitest';

import type { FlagEvaluation } from '../evaluate-flags';
import { canaryCohortFlagKey, clientVisibleFlags, routingFlagInputs } from '../routing-flags';

function evaluation(key: string, variant: string): FlagEvaluation {
  return { key, variant, enabled: variant !== 'off', reason: 'rule', ruleId: 'r', version: 1 };
}

describe('routing flag inputs', () => {
  it('changes no routing input when no routing flag exists', () => {
    expect(routingFlagInputs({})).toEqual({ flagVariants: {} });
  });

  it('turns a stage off through its flag and records the variant', () => {
    const inputs = routingFlagInputs({
      'routing.canary': evaluation('routing.canary', 'off'),
      'routing.observed_health': evaluation('routing.observed_health', 'on'),
    });
    expect(inputs).toMatchObject({
      enableCanary: false,
      enableObservedHealthRanking: true,
      flagVariants: { 'routing.canary': 'off', 'routing.observed_health': 'on' },
    });
    expect(inputs.enableShadow).toBeUndefined();
  });

  it('maps a per-slot canary flag onto that slot cohort', () => {
    const key = canaryCohortFlagKey('coding_balanced');
    expect(routingFlagInputs({ [key]: evaluation(key, 'on') }).canaryCohorts).toEqual({
      coding_balanced: true,
    });
  });

  it('separates response assessment observation from application', () => {
    const inputs = routingFlagInputs({
      'routing.response_assessment': evaluation('routing.response_assessment', 'on'),
      'routing.response_assessment_apply': evaluation('routing.response_assessment_apply', 'off'),
    });
    expect(inputs).toMatchObject({
      enableResponseAssessment: true,
      applyResponseAssessment: false,
    });
  });
});

describe('client-visible flags', () => {
  it('never exposes routing flags to clients', () => {
    const visible = clientVisibleFlags({
      'routing.shadow': evaluation('routing.shadow', 'on'),
      'composer.voice': evaluation('composer.voice', 'treatment'),
    });
    expect(visible).toEqual({
      enabled: { 'composer.voice': true },
      variants: { 'composer.voice': 'treatment' },
    });
  });

  it('never exposes another surface rollout ring; the ring gate answers for this one', () => {
    const visible = clientVisibleFlags({
      'rollout.mobile.beta.new_composer': evaluation('rollout.mobile.beta.new_composer', 'on'),
      'composer.voice': evaluation('composer.voice', 'on'),
    });

    expect(Object.keys(visible.enabled)).toEqual(['composer.voice']);
    expect(Object.keys(visible.variants)).toEqual(['composer.voice']);
  });
});
