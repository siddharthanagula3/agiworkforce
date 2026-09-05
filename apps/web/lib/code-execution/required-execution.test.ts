import { describe, expect, it } from 'vitest';

import {
  EXECUTE_CODE_TOOL,
  e2bExecutionToolDefs,
  resolveCodeExecutionTools,
} from '@/lib/e2b/execution-tools';
import { WEB_SEARCH_TOOL } from '@/lib/web-search/web-search-tool';

import {
  classifyAttachedExecutionTool,
  isRequiredExecutionToolChoice,
  planAdmitsCodeExecution,
  resolveCodeExecutionRequirement,
  resolveRequiredExecutionEnforcement,
} from './required-execution';

const PAID_TIER = 'pro';
const SANDBOXLESS_TIER = 'free';

const executeCodeTool = e2bExecutionToolDefs().find(
  (tool) => tool.function.name === EXECUTE_CODE_TOOL,
);
const webSearchTool = {
  type: 'function',
  function: { name: WEB_SEARCH_TOOL, description: '', parameters: {} },
};
const [anthropicServerTool] = resolveCodeExecutionTools('anthropic');
const [googleBuiltinTool] = resolveCodeExecutionTools('google');
const [openAiHostedTool] = resolveCodeExecutionTools('openai');

const enforcement = (over: Partial<Parameters<typeof resolveRequiredExecutionEnforcement>[0]>) =>
  resolveRequiredExecutionEnforcement({
    required: true,
    requestedToolChoice: undefined,
    stream: true,
    model: undefined,
    tools: [executeCodeTool],
    planTier: PAID_TIER,
    ...over,
  });

describe('resolveCodeExecutionRequirement', () => {
  it('is not required when the caller switched execution off', () => {
    expect(
      resolveCodeExecutionRequirement({
        codeExecutionEnabled: false,
        userMessage: 'run the code',
      }),
    ).toEqual({ required: false, source: null });
  });

  it('names the toggle when the toggle asked', () => {
    expect(
      resolveCodeExecutionRequirement({ codeExecutionEnabled: true, userMessage: 'hello' }),
    ).toEqual({ required: true, source: 'toggle' });
  });

  it('names the text when only the text asked', () => {
    expect(
      resolveCodeExecutionRequirement({
        codeExecutionEnabled: undefined,
        userMessage: 'Use Python to compute the sum of the first 200 primes',
      }),
    ).toEqual({ required: true, source: 'explicit_intent' });
  });

  it('stays out of the way of an ordinary turn', () => {
    expect(
      resolveCodeExecutionRequirement({
        codeExecutionEnabled: undefined,
        userMessage: 'what is a prime number',
      }),
    ).toEqual({ required: false, source: null });
  });
});

describe('classifyAttachedExecutionTool', () => {
  it('tells the four shapes apart', () => {
    expect(classifyAttachedExecutionTool([executeCodeTool])).toBe('generic-function');
    expect(classifyAttachedExecutionTool([openAiHostedTool])).toBe('openai-hosted');
    expect(classifyAttachedExecutionTool([anthropicServerTool])).toBe('anthropic-server');
    expect(classifyAttachedExecutionTool([googleBuiltinTool])).toBe('google-builtin');
  });

  it('ignores tools that are not execution tools', () => {
    expect(classifyAttachedExecutionTool([webSearchTool])).toBeNull();
    expect(classifyAttachedExecutionTool(undefined)).toBeNull();
    expect(classifyAttachedExecutionTool([null, 'nope', 42])).toBeNull();
  });
});

describe('planAdmitsCodeExecution', () => {
  it('follows the sandbox allowance the plan catalog carries', () => {
    expect(planAdmitsCodeExecution(PAID_TIER)).toBe(true);
    expect(planAdmitsCodeExecution(SANDBOXLESS_TIER)).toBe(false);
  });
});

describe('resolveRequiredExecutionEnforcement', () => {
  it('names the execution tool rather than accepting any tool', () => {
    expect(enforcement({ tools: [executeCodeTool, webSearchTool] })).toEqual({
      mode: 'tool-choice',
      toolChoice: { type: 'function', function: { name: EXECUTE_CODE_TOOL } },
      attachedTool: 'generic-function',
    });
  });

  it('falls back to a system line for the provider-side shapes', () => {
    expect(enforcement({ tools: [anthropicServerTool] }).mode).toBe('nudge');
    expect(enforcement({ tools: [googleBuiltinTool] }).mode).toBe('nudge');
    expect(enforcement({ tools: [openAiHostedTool] }).mode).toBe('nudge');
  });

  it('reports the plan before it reports a tool', () => {
    expect(enforcement({ planTier: SANDBOXLESS_TIER })).toEqual({
      mode: 'plan-gated',
      attachedTool: null,
    });
  });

  it('does nothing when execution was not required', () => {
    expect(enforcement({ required: false })).toEqual({ mode: 'none', attachedTool: null });
  });

  it("never overrides the caller's own tool choice", () => {
    expect(enforcement({ requestedToolChoice: 'auto' }).mode).toBe('none');
  });

  it('applies only to a streamed turn', () => {
    expect(enforcement({ stream: false }).mode).toBe('none');
    expect(enforcement({ stream: undefined }).mode).toBe('none');
  });

  it('does nothing when no execution tool is attached', () => {
    expect(enforcement({ tools: [webSearchTool] }).mode).toBe('none');
  });
});

describe('isRequiredExecutionToolChoice', () => {
  it('recognises only the choice this module installs', () => {
    expect(
      isRequiredExecutionToolChoice({ type: 'function', function: { name: EXECUTE_CODE_TOOL } }),
    ).toBe(true);
    expect(isRequiredExecutionToolChoice('required')).toBe(false);
    expect(
      isRequiredExecutionToolChoice({ type: 'function', function: { name: 'web_search' } }),
    ).toBe(false);
  });
});
