import { describe, expect, it } from 'vitest';
import { isCodeExecutionAvailable } from '../codeExecutionAvailability';

describe('isCodeExecutionAvailable', () => {
  it('lights for a native-tier provider with the codeExecution cap, regardless of E2B deployment', () => {
    expect(isCodeExecutionAvailable(true, true, 'anthropic', false)).toBe(true);
    expect(isCodeExecutionAvailable(true, true, 'openai', false)).toBe(true);
  });

  it('stays off for a native-tier provider that lacks the codeExecution cap', () => {
    expect(isCodeExecutionAvailable(false, true, 'anthropic', false)).toBe(false);
  });

  it('lights a tools-capable model without native execution when E2B is live', () => {
    expect(isCodeExecutionAvailable(false, true, 'moonshot', true)).toBe(true);
    expect(isCodeExecutionAvailable(false, true, 'deepseek', true)).toBe(true);
  });

  it('fails closed for an open-weight model when E2B is NOT deployed (never a dead control)', () => {
    expect(isCodeExecutionAvailable(false, true, 'deepseek', false)).toBe(false);
  });

  it('fails closed for a non-tools model even when E2B is deployed (it cannot emit tool calls)', () => {
    expect(isCodeExecutionAvailable(false, false, 'perplexity', true)).toBe(false);
  });

  it('treats an unknown provider as the E2B tier (tools + deployment)', () => {
    expect(isCodeExecutionAvailable(false, true, undefined, true)).toBe(true);
    expect(isCodeExecutionAvailable(false, true, 'some-new-provider', false)).toBe(false);
  });
});
