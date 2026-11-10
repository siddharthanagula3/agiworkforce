import { describe, expect, it } from 'vitest';
import { resolveToolLoopPolicy } from './tool-loop';
import { ChatCompletionRequestSchema, type ProcessedRequest } from './request-processor';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  DEFAULT_CALLER_TOOL_MAX_STEPS,
  MAX_CALLER_TOOL_STEPS,
} from '@agiworkforce/cloud-contracts';

function processed(workMode: 'chat' | 'agiwork' | undefined): ProcessedRequest {
  return {
    chatRequest: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'test' }],
      stream: true,
      ...(workMode ? { work_mode: workMode } : {}),
    },
  } as ProcessedRequest;
}

describe('resolveToolLoopPolicy', () => {
  it('retains the negotiated caller budget instead of reducing it to ordinary chat', () => {
    const request = processed('chat');
    request.chatRequest.caller_tool_handoff_version = AGENT_EVENT_SCHEMA_VERSION;
    expect(resolveToolLoopPolicy(request, {}).maxSteps).toBe(DEFAULT_CALLER_TOOL_MAX_STEPS);
    request.chatRequest.caller_tool_max_steps = MAX_CALLER_TOOL_STEPS;
    expect(resolveToolLoopPolicy(request, {}).maxSteps).toBe(MAX_CALLER_TOOL_STEPS);
    expect(resolveToolLoopPolicy(request, { maxSteps: 3 }).maxSteps).toBe(3);
  });

  it('requires streaming negotiation before accepting a caller step budget', () => {
    const request = processed('chat').chatRequest;
    expect(
      ChatCompletionRequestSchema.safeParse({
        ...request,
        caller_tool_handoff_version: AGENT_EVENT_SCHEMA_VERSION,
        caller_tool_max_steps: DEFAULT_CALLER_TOOL_MAX_STEPS,
      }).success,
    ).toBe(true);
    expect(
      ChatCompletionRequestSchema.safeParse({
        ...request,
        stream: false,
        caller_tool_handoff_version: AGENT_EVENT_SCHEMA_VERSION,
      }).success,
    ).toBe(false);
    expect(
      ChatCompletionRequestSchema.safeParse({
        ...request,
        caller_tool_max_steps: DEFAULT_CALLER_TOOL_MAX_STEPS,
      }).success,
    ).toBe(false);
    expect(
      ChatCompletionRequestSchema.safeParse({
        ...request,
        caller_tool_handoff_version: AGENT_EVENT_SCHEMA_VERSION,
        caller_tool_max_steps: MAX_CALLER_TOOL_STEPS + 1,
      }).success,
    ).toBe(false);
  });
  it('keeps ordinary chat on the conservative ten-step limit, inside the platform time limit', () => {
    expect(resolveToolLoopPolicy(processed('chat'), {})).toEqual({
      maxSteps: 10,
      maxDurationMs: 4 * 60_000,
    });
    expect(resolveToolLoopPolicy(processed(undefined), {})).toEqual({
      maxSteps: 10,
      maxDurationMs: 4 * 60_000,
    });
  });

  it('gives paid AGI Work a deeper loop with headroom under the five-minute function limit', () => {
    expect(resolveToolLoopPolicy(processed('agiwork'), {})).toEqual({
      maxSteps: 100,
      maxDurationMs: 4 * 60_000,
    });
  });

  it('honors explicit test and caller overrides', () => {
    expect(
      resolveToolLoopPolicy(processed('agiwork'), {
        maxSteps: 3,
        maxDurationMs: 12_345,
      }),
    ).toEqual({ maxSteps: 3, maxDurationMs: 12_345 });
  });
});
