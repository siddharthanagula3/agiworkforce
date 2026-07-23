import { describe, expect, it } from 'vitest';

import type { BillingPlanTier, RoutingTaskType } from '@agiworkforce/types';

import * as requestProcessor from './request-processor';
import type { ChatCompletionRequest } from './request-processor';

type ApplyImplicitManagedToolIntent = (
  request: ChatCompletionRequest,
  context: {
    prompt: string;
    taskType: RoutingTaskType;
    planTier: BillingPlanTier;
  },
) => void;

function applyImplicitManagedToolIntent(): ApplyImplicitManagedToolIntent {
  const candidate = (
    requestProcessor as typeof requestProcessor & {
      applyImplicitManagedToolIntent?: ApplyImplicitManagedToolIntent;
    }
  ).applyImplicitManagedToolIntent;

  expect(candidate).toBeTypeOf('function');
  return candidate!;
}

function request(overrides: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest {
  return requestProcessor.ChatCompletionRequestSchema.parse({
    model: 'gemini-3.6-flash',
    messages: [{ role: 'user', content: 'Hello' }],
    stream: true,
    ...overrides,
  });
}

describe('implicit managed-tool intent', () => {
  it('offers code execution for an explicit Pro execution request', () => {
    const chatRequest = request();

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt: 'Run this Python script and tell me its exact output.',
      taskType: 'coding',
      planTier: 'pro',
    });

    expect(chatRequest.code_execution).toBe(true);
  });

  it('does not turn a coding discussion into a paid sandbox run', () => {
    const chatRequest = request();

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt: 'Explain what this Python function does.',
      taskType: 'coding',
      planTier: 'pro',
    });

    expect(chatRequest.code_execution).toBeUndefined();
  });

  it('offers metered code execution to Free normal chat without unlocking AGI Work', () => {
    const chatRequest = request({ model: 'gpt-5.4-mini' });

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt: 'Execute this code and give me the result.',
      taskType: 'coding',
      planTier: 'free',
    });

    expect(chatRequest.code_execution).toBe(true);
  });

  it('preserves an explicit code-execution opt-out', () => {
    const chatRequest = request({ code_execution: false });

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt: 'Run this Python script and tell me its exact output.',
      taskType: 'coding',
      planTier: 'pro',
    });

    expect(chatRequest.code_execution).toBe(false);
  });

  it.each([
    'Create an editable Word document with this project brief.',
    'Generate a PowerPoint presentation for the launch plan.',
    'Make a downloadable .docx report from these notes.',
    'Prepare a slide deck and attach the .pptx file.',
  ])('offers Office file creation for explicit deliverable intent: %s', (prompt) => {
    const chatRequest = request();

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt,
      taskType: 'general',
      planTier: 'free',
    });

    expect(chatRequest.office_creation).toBe(true);
  });

  it('does not offer an Office tool for ordinary prose drafting', () => {
    const chatRequest = request();

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt: 'Draft a concise launch announcement in the chat.',
      taskType: 'creative_writing',
      planTier: 'free',
    });

    expect(chatRequest.office_creation).toBeUndefined();
  });

  it('offers URL fetch when the user explicitly asks to inspect a supplied URL', () => {
    const chatRequest = request();

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt: 'Read https://example.com/report and summarize its findings.',
      taskType: 'general',
      planTier: 'free',
    });

    expect(chatRequest.web_fetch).toBe(true);
  });

  it('does not fetch a URL merely because it appears in conversational text', () => {
    const chatRequest = request();

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt: 'My website is https://example.com and I like its name.',
      taskType: 'general',
      planTier: 'free',
    });

    expect(chatRequest.web_fetch).toBeUndefined();
  });

  it('does not implicitly activate streaming-only tools on a non-streaming request', () => {
    const chatRequest = request({ stream: false });

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt: 'Run this code, then create an editable Word document.',
      taskType: 'coding',
      planTier: 'pro',
    });

    expect(chatRequest.code_execution).toBeUndefined();
    expect(chatRequest.office_creation).toBeUndefined();
  });
});

describe('managed code tool choice', () => {
  it('requires an initial E2B tool call when Run code is enabled', () => {
    expect(
      requestProcessor.resolveInitialManagedCodeToolChoice({
        requestedToolChoice: undefined,
        codeExecution: true,
        stream: true,
        provider: 'openai',
        e2bEnabled: true,
        toolsCapable: true,
      }),
    ).toBe('required');
  });

  it('preserves an explicit caller tool choice', () => {
    expect(
      requestProcessor.resolveInitialManagedCodeToolChoice({
        requestedToolChoice: 'auto',
        codeExecution: true,
        stream: true,
        provider: 'openai',
        e2bEnabled: true,
        toolsCapable: true,
      }),
    ).toBe('auto');
  });

  it('does not force unsupported Anthropic tool choice or disabled E2B execution', () => {
    const base = {
      requestedToolChoice: undefined,
      codeExecution: true,
      stream: true,
      toolsCapable: true,
    } as const;

    expect(
      requestProcessor.resolveInitialManagedCodeToolChoice({
        ...base,
        provider: 'anthropic',
        e2bEnabled: true,
      }),
    ).toBeUndefined();
    expect(
      requestProcessor.resolveInitialManagedCodeToolChoice({
        ...base,
        provider: 'openai',
        e2bEnabled: false,
      }),
    ).toBeUndefined();
  });
});
