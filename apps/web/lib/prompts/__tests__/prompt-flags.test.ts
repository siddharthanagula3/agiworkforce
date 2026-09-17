import { describe, expect, it } from 'vitest';

import type { FlagEvaluation } from '@/lib/feature-flags/evaluate-flags';

import {
  PROMPT_FLAG_KEYS,
  promptFlagKey,
  promptFlagVariant,
  promptIdFromFlagKey,
  promptVariantsFromFlags,
  promptVersionFromVariant,
} from '../prompt-flags';
import { PROMPT_IDS } from '../prompt-manifest';
import { resolvePrompt } from '../prompt-registry';

function evaluation(variant: string, enabled: boolean): FlagEvaluation {
  return {
    key: 'prompt.support.system',
    variant,
    enabled,
    reason: 'rule',
    ruleId: 'r',
    version: 1,
  };
}

describe('prompt flags', () => {
  it('names one flag per manifest prompt', () => {
    expect(PROMPT_FLAG_KEYS).toHaveLength(PROMPT_IDS.length);
    expect(promptFlagKey('support.system')).toBe('prompt.support.system');
    expect(promptIdFromFlagKey('prompt.support.system')).toBe('support.system');
  });

  it('ignores a flag that is not a prompt flag and a prompt id it does not hold', () => {
    expect(promptIdFromFlagKey('routing.canary')).toBeNull();
    expect(promptIdFromFlagKey('prompt.not_a_prompt.here')).toBeNull();
  });

  it('reads a version out of a variant only when the manifest still holds it', () => {
    expect(promptVersionFromVariant('support.system', promptFlagVariant(1))).toBe(1);
    expect(promptVersionFromVariant('support.system', 'v99')).toBeNull();
    expect(promptVersionFromVariant('support.system', 'off')).toBeNull();
    expect(promptVersionFromVariant('support.system', 'control')).toBeNull();
  });

  it('selects a version for an enabled arm and leaves every other prompt pinned', () => {
    const variants = promptVariantsFromFlags({
      'prompt.support.system': evaluation('v1', true),
      'prompt.research.system': evaluation('v1', false),
      'routing.canary': evaluation('on', true),
    });
    expect(variants).toEqual({ 'support.system': 1 });
    expect(resolvePrompt('support.system', { variants }).selectedBy).toBe('variant');
    expect(resolvePrompt('research.system', { variants }).selectedBy).toBe('pinned');
  });

  it('treats a stale arm as a rollback to the pin rather than an outage', () => {
    const variants = promptVariantsFromFlags({
      'prompt.support.system': evaluation('v42', true),
    });
    expect(variants).toEqual({});
    expect(resolvePrompt('support.system', { variants }).selectedBy).toBe('pinned');
  });
});
