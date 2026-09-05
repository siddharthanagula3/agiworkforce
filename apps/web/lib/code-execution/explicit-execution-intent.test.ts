import { describe, expect, it } from 'vitest';

import {
  EXPLICIT_EXECUTION_INTENT_PHRASES,
  detectExplicitCodeExecutionIntent,
  hasExplicitCodeExecutionIntent,
} from './explicit-execution-intent';

const LIVE_DEFECT_PROMPT =
  'Use Python to compute the sum of the first 200 prime numbers, show the code you ran and the result';

describe('detectExplicitCodeExecutionIntent', () => {
  it('detects the prompt that answered with an invented result', () => {
    expect(detectExplicitCodeExecutionIntent(LIVE_DEFECT_PROMPT)).toBe('run_directive');
  });

  it('detects the same request without the "code you ran" clause', () => {
    expect(
      detectExplicitCodeExecutionIntent('Use Python to compute the sum of the first 200 primes'),
    ).toBe('computation');
  });

  it('detects run and execute directives', () => {
    expect(detectExplicitCodeExecutionIntent('run the code and tell me what it prints')).toBe(
      'run_directive',
    );
    expect(detectExplicitCodeExecutionIntent('Execute the script')).toBe('run_directive');
    expect(detectExplicitCodeExecutionIntent('please actually run it')).toBe('run_directive');
    expect(detectExplicitCodeExecutionIntent('write and run a benchmark')).toBe('run_directive');
    expect(detectExplicitCodeExecutionIntent('rerun that with a bigger input')).toBe(
      'run_directive',
    );
  });

  it('detects a computation verb paired with a runtime', () => {
    expect(detectExplicitCodeExecutionIntent('calculate the median in python')).toBe('computation');
    expect(detectExplicitCodeExecutionIntent('sort these with a script')).toBe('computation');
    expect(detectExplicitCodeExecutionIntent('plot this with matplotlib')).toBe('computation');
  });

  it('needs a runtime subject, so a computation verb alone never forces a run', () => {
    expect(detectExplicitCodeExecutionIntent('compute the total')).toBeNull();
    expect(detectExplicitCodeExecutionIntent('calculate the tip on 40')).toBeNull();
    expect(detectExplicitCodeExecutionIntent('what is the sum of 2 and 2')).toBeNull();
    expect(detectExplicitCodeExecutionIntent('sort these names for me')).toBeNull();
  });

  it('leaves explanation and review questions alone', () => {
    expect(detectExplicitCodeExecutionIntent('explain how to run')).toBeNull();
    expect(detectExplicitCodeExecutionIntent('explain how to run the code')).toBeNull();
    expect(detectExplicitCodeExecutionIntent('what does this code do')).toBeNull();
    expect(detectExplicitCodeExecutionIntent('how do I reverse a list in python')).toBeNull();
    expect(detectExplicitCodeExecutionIntent('how would you compute that in python')).toBeNull();
    expect(detectExplicitCodeExecutionIntent('explain what this script is for')).toBeNull();
    expect(detectExplicitCodeExecutionIntent('review this code for security bugs')).toBeNull();
    expect(detectExplicitCodeExecutionIntent('write a python function that reverses a list')).toBe(
      null,
    );
  });

  it('still hears an ask that happens to be followed by a question', () => {
    expect(detectExplicitCodeExecutionIntent('run the code and explain what it does')).toBe(
      'run_directive',
    );
  });

  it('treats a pasted snippet with no ask as context, not a request', () => {
    const pastedWithNoAsk = ['```python', 'def total(xs):', '    return sum(xs)', '```'].join('\n');
    expect(detectExplicitCodeExecutionIntent(pastedWithNoAsk)).toBeNull();
    expect(detectExplicitCodeExecutionIntent('`compute_in_python(xs)`')).toBeNull();
  });

  it('hears the ask that arrives with a pasted snippet', () => {
    const pastedWithAnAsk = [
      'run this code and give me the output',
      '```python',
      'print(sum(range(10)))',
      '```',
    ].join('\n');
    expect(detectExplicitCodeExecutionIntent(pastedWithAnAsk)).toBe('run_directive');
  });

  it('does not match a phrase inside a longer word', () => {
    expect(detectExplicitCodeExecutionIntent('the runtime of the codebase')).toBeNull();
    expect(detectExplicitCodeExecutionIntent('sumatra is a city')).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(detectExplicitCodeExecutionIntent('')).toBeNull();
    expect(hasExplicitCodeExecutionIntent('')).toBe(false);
  });

  it('exposes every phrase list as one frozen config', () => {
    expect(Object.isFrozen(EXPLICIT_EXECUTION_INTENT_PHRASES)).toBe(true);
    expect(EXPLICIT_EXECUTION_INTENT_PHRASES.run_directive.length).toBeGreaterThan(0);
    expect(EXPLICIT_EXECUTION_INTENT_PHRASES.computation_verb.length).toBeGreaterThan(0);
    expect(EXPLICIT_EXECUTION_INTENT_PHRASES.runtime_subject.length).toBeGreaterThan(0);
    expect(EXPLICIT_EXECUTION_INTENT_PHRASES.explanation_frame.length).toBeGreaterThan(0);
  });

  it('agrees with the boolean wrapper', () => {
    expect(hasExplicitCodeExecutionIntent(LIVE_DEFECT_PROMPT)).toBe(true);
    expect(hasExplicitCodeExecutionIntent('how do I reverse a list in python')).toBe(false);
  });
});
