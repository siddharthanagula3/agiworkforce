import { describe, expect, it } from 'vitest';

import {
  getModels,
  getRoutingSlotModel,
  type BillingPlanTier,
  type RoutingTaskType,
} from '@agiworkforce/types';

import { resolveRequiredSearchEnforcement } from '@/lib/web-search/required-search';
import { webSearchToolDef } from '@/lib/web-search/web-search-tool';

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

type ResolveToolAwareTaskType = (
  classifiedTaskType: RoutingTaskType,
  request: Pick<
    ChatCompletionRequest,
    'research' | 'work_mode' | 'office_creation' | 'code_execution'
  >,
) => RoutingTaskType;

function applyImplicitManagedToolIntent(): ApplyImplicitManagedToolIntent {
  const candidate = (
    requestProcessor as typeof requestProcessor & {
      applyImplicitManagedToolIntent?: ApplyImplicitManagedToolIntent;
    }
  ).applyImplicitManagedToolIntent;

  expect(candidate).toBeTypeOf('function');
  return candidate!;
}

function resolveToolAwareTaskType(): ResolveToolAwareTaskType {
  const candidate = (
    requestProcessor as typeof requestProcessor & {
      resolveToolAwareTaskType?: ResolveToolAwareTaskType;
    }
  ).resolveToolAwareTaskType;

  expect(candidate).toBeTypeOf('function');
  return candidate!;
}

function request(overrides: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest {
  return requestProcessor.ChatCompletionRequestSchema.parse({
    model: getRoutingSlotModel('coding_fast'),
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
    const chatRequest = request({ model: getRoutingSlotModel('coding_fast') });

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt: 'Execute this code and give me the result.',
      taskType: 'coding',
      planTier: 'free',
    });

    expect(chatRequest.code_execution).toBe(true);
  });

  it('offers code execution when the user names the capability instead of a verb', () => {
    const chatRequest = request();

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt:
        "Use code execution to compute the first 12 rows of Pascal's triangle, then create a JSON file named pascal.json containing them and tell me its size.",
      taskType: 'coding',
      planTier: 'pro',
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

  it('turns web search on when the user asks for a search in the message text', () => {
    const chatRequest = request();

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt: "Search the web for today's top headline and cite the link.",
      taskType: 'simple_chat',
      planTier: 'free',
    });

    expect(chatRequest.web_search).toBe(true);
  });

  it('leaves web search alone for a turn that asks for nothing current', () => {
    const chatRequest = request();

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt: 'Rewrite the paragraph above in a plainer voice.',
      taskType: 'simple_chat',
      planTier: 'free',
    });

    expect(chatRequest.web_search).toBeUndefined();
  });

  it('preserves an explicit web-search opt-out', () => {
    const chatRequest = request({ web_search: false });

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt: 'Search the web for the latest release notes.',
      taskType: 'research',
      planTier: 'free',
    });

    expect(chatRequest.web_search).toBe(false);
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

describe('tool-aware Auto routing', () => {
  it.each([
    ['research', request({ research: true }), 'research'],
    ['AGI Work', request({ work_mode: 'agiwork' }), 'agentic'],
    ['Office creation', request({ office_creation: true }), 'agentic'],
    ['code execution', request({ code_execution: true }), 'coding'],
    ['ordinary chat', request(), 'simple_chat'],
  ] satisfies Array<[string, ChatCompletionRequest, RoutingTaskType]>)(
    'routes %s to a capability-compatible task',
    (_label, chatRequest, expectedTaskType) => {
      expect(resolveToolAwareTaskType()('simple_chat', chatRequest)).toBe(expectedTaskType);
    },
  );
});

describe('forced tool choice compatibility', () => {
  const forcedChoiceIncompatibleModel = getModels()
    .filter((model) => model.providerCompatibility?.forcedToolChoice === false)
    .map((model) => model.id)[0];

  it('the catalog records at least one model that rejects a forced tool choice', () => {
    expect(forcedChoiceIncompatibleModel).toBeTruthy();
  });

  it('never forces a code tool call on a model whose provider rejects it', () => {
    expect(
      requestProcessor.resolveInitialManagedCodeToolChoice({
        requestedToolChoice: undefined,
        codeExecution: true,
        stream: true,
        provider: 'deepseek',
        model: forcedChoiceIncompatibleModel,
        e2bEnabled: true,
        toolsCapable: true,
      }),
    ).toBeUndefined();
  });

  it('never forces a web-search tool call on a model whose provider rejects it', () => {
    expect(
      resolveRequiredSearchEnforcement({
        required: true,
        requestedToolChoice: undefined,
        stream: true,
        model: forcedChoiceIncompatibleModel,
        tools: [webSearchToolDef()],
      }),
    ).toEqual({ mode: 'nudge', attachedTool: 'generic-function' });
  });

  it('still forces the call for a model that accepts a forced tool choice', () => {
    const compatible = getModels().find(
      (model) =>
        model.providerCompatibility?.forcedToolChoice !== false && model.capabilities?.tools,
    );
    expect(
      resolveRequiredSearchEnforcement({
        required: true,
        requestedToolChoice: undefined,
        stream: true,
        model: compatible?.id,
        tools: [webSearchToolDef()],
      }).mode,
    ).toBe('tool-choice');
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

describe('managed web-search tool choice', () => {
  it('forces the search tool when the turn requires a search and one is attached', () => {
    expect(
      resolveRequiredSearchEnforcement({
        required: true,
        requestedToolChoice: undefined,
        stream: true,
        model: undefined,
        tools: [webSearchToolDef()],
      }).toolChoice,
    ).toEqual({ type: 'function', function: { name: 'web_search' } });
  });

  it('preserves caller choice and does not force unavailable search', () => {
    const base = {
      required: true,
      requestedToolChoice: undefined,
      stream: true as boolean | undefined,
      model: undefined,
      tools: [webSearchToolDef()],
    };

    expect(resolveRequiredSearchEnforcement({ ...base, requestedToolChoice: 'none' }).mode).toBe(
      'none',
    );
    expect(resolveRequiredSearchEnforcement({ ...base, tools: [] }).mode).toBe('none');
    expect(resolveRequiredSearchEnforcement({ ...base, stream: false }).mode).toBe('none');
  });
});
