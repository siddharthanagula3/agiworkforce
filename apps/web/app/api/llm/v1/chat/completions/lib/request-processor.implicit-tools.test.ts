import { describe, expect, it } from 'vitest';

import {
  getModels,
  getRoutingSlotModel,
  type BillingPlanTier,
  type RoutingTaskType,
} from '@agiworkforce/types';

import {
  resolveRequiredSearchEnforcement,
  resolveWebSearchRequirement,
  shouldOfferWebSearchForTurn,
} from '@/lib/web-search/required-search';
import { resolveCodeExecutionRequirement } from '@/lib/code-execution/required-execution';
import { resolveRequiredExecutionEnforcement } from '@/lib/code-execution/required-execution';
import {
  EXECUTE_CODE_TOOL,
  e2bExecutionToolDefs,
  resolveCodeExecutionTools,
} from '@/lib/e2b/execution-tools';
import { webSearchToolDef } from '@/lib/web-search/web-search-tool';

const EXECUTION_PLAN_TIER = 'pro';

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

  it.each([
    'DOT: use Python to print the first 10 square numbers.',
    'With JavaScript, list the primes under 50.',
    'In a Python script, compute the first 12 Fibonacci numbers.',
  ])('offers but does not force code execution for %s', (prompt) => {
    const chatRequest = request({ model: getRoutingSlotModel('coding_fast') });

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt,
      taskType: 'general',
      planTier: 'free',
    });

    expect(chatRequest.code_execution).toBe(true);
    expect(
      resolveCodeExecutionRequirement({
        codeExecutionEnabled: chatRequest.code_execution,
        requestedByCaller: false,
        userMessage: prompt,
      }).required,
    ).toBe(false);
  });

  it.each([
    'what does print() do in Python?',
    'Is Python better than Java for beginners?',
    'How do I use Python to print a list?',
  ])('neither offers nor forces code execution for %s', (prompt) => {
    const chatRequest = request();

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt,
      taskType: 'general',
      planTier: 'free',
    });

    expect(chatRequest.code_execution).toBeUndefined();
    expect(
      resolveCodeExecutionRequirement({
        codeExecutionEnabled: chatRequest.code_execution,
        requestedByCaller: false,
        userMessage: prompt,
      }).required,
    ).toBe(false);
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
    'Create an Excel workbook with two sheets and a SUM formula.',
    'Build a spreadsheet of the regional totals and attach the .xlsx file.',
    'Generate a PDF of the quarterly summary.',
    'Make a CSV of these rows.',
  ])('offers file creation for explicit deliverable intent: %s', (prompt) => {
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

  it('respects an explicit request not to open a supplied URL', () => {
    const chatRequest = request();

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt: 'Do not open this URL: https://example.com/report. Summarize my note instead.',
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

  it('does not offer either ambient Free tool when the user says not to use them', () => {
    const prompt = 'Now reply with exactly FOLLOWUP_FREE_OK. Do not search the web or run code.';
    const chatRequest = request({ web_search: true, web_fetch: true });

    applyImplicitManagedToolIntent()(chatRequest, {
      prompt,
      taskType: 'research',
      planTier: 'free',
    });

    const requirement = resolveWebSearchRequirement({
      webSearchEnabled: chatRequest.web_search,
      agiWorkRun: false,
      researchTask: true,
      userMessage: prompt,
    });
    expect(requirement.required).toBe(false);
    expect(
      shouldOfferWebSearchForTurn({
        webSearchEnabled: chatRequest.web_search,
        requirement,
        modelPolicy: 'required_only',
        surface: 'web',
      }),
    ).toBe(false);
    expect(chatRequest.code_execution).toBeUndefined();
  });

  it.each([
    [
      'a refusal that never names the web, on a turn routed to research',
      'AUDIT ROUND4. Use an available presentation skill to create a three-slide editable deck for a fictional community repair workshop. Slide 1: Repair Together, 15 October 2026 at 3 pm. Slide 2: Bring one broken small household item; tools are provided. Slide 3: Three steps: check in, diagnose, repair. Use a restrained black-and-white design and one simple diagram. No invented venue, photos, search or publishing.',
      'research',
    ],
    [
      'a refused list of actions that ends in a search',
      'AUDIT 2026-10-12. Can you access my Gmail inbox or use an installed plugin in this chat right now? Do not connect anything, send anything, or search the web. State only what is actually available and the next step if it is unavailable, in two sentences.',
      'reasoning',
    ],
    [
      'a refusal to search and to open any link',
      'AUDIT-RENDER2 R06. No search and do not open any links. Show this URL once as a bare link and once as a Markdown link labelled Synthetic long URL: https://example.com/audit/very-long-path-segment-for-layout-checking/another-long-path-segment?label=abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789 . Then show this exact unbroken token in inline code: AUDIT_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 . No other prose.',
      'general',
    ],
  ] as const)('turns on neither search nor URL fetch for %s', (_shape, prompt, taskType) => {
    const chatRequest = request();

    applyImplicitManagedToolIntent()(chatRequest, { prompt, taskType, planTier: 'free' });

    expect(chatRequest.web_search).toBeUndefined();
    expect(chatRequest.web_fetch).toBeUndefined();
  });

  it.each(['research', 'simple_chat', 'general'] as const)(
    'offers no public search and no code for a restricted past-chat question on a %s turn',
    (taskType) => {
      const prompt =
        'AUDIT ROUND8 relevant-chat capability control. Can you find and continue our earlier Juniper Lantern picnic discussion outside projects and our Saffron Comet repair day discussion in AUDIT 2026-10-12 Workshop? Use the earlier conversations, not the runbook, saved memory, or web search. For each, identify or link the source chat and report its agreed code, item count and color, day, and coordinator or organizer role. If you cannot search or access those chats under the current controls, say so clearly and do not invent facts or citations. Do not change settings or save anything to memory.';
      const chatRequest = request();

      applyImplicitManagedToolIntent()(chatRequest, { prompt, taskType, planTier: 'free' });

      const requirement = resolveWebSearchRequirement({
        webSearchEnabled: chatRequest.web_search,
        agiWorkRun: false,
        researchTask: taskType === 'research',
        userMessage: prompt,
      });
      expect(chatRequest.web_search).not.toBe(true);
      expect(chatRequest.web_fetch).toBeUndefined();
      expect(chatRequest.code_execution).toBeUndefined();
      expect(requirement.required).toBe(false);
      expect(
        shouldOfferWebSearchForTurn({
          webSearchEnabled: chatRequest.web_search,
          requirement,
          modelPolicy: 'required_only',
          surface: 'web',
        }),
      ).toBe(false);
    },
  );

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
      resolveRequiredExecutionEnforcement({
        required: true,
        requestedToolChoice: undefined,
        stream: true,
        model: forcedChoiceIncompatibleModel,
        tools: e2bExecutionToolDefs(),
        planTier: EXECUTION_PLAN_TIER,
      }),
    ).toEqual({ mode: 'nudge', attachedTool: 'generic-function' });
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
  const enforcement = (over: Partial<Parameters<typeof resolveRequiredExecutionEnforcement>[0]>) =>
    resolveRequiredExecutionEnforcement({
      required: true,
      requestedToolChoice: undefined,
      stream: true,
      model: undefined,
      tools: e2bExecutionToolDefs(),
      planTier: EXECUTION_PLAN_TIER,
      ...over,
    });

  it('names the execution tool when Run code is enabled', () => {
    expect(enforcement({})).toEqual({
      mode: 'tool-choice',
      toolChoice: { type: 'function', function: { name: EXECUTE_CODE_TOOL } },
      attachedTool: 'generic-function',
    });
  });

  it('preserves an explicit caller tool choice', () => {
    expect(enforcement({ requestedToolChoice: 'auto' }).mode).toBe('none');
  });

  it('asks in the prompt where a server-side tool takes no tool choice', () => {
    expect(enforcement({ tools: resolveCodeExecutionTools('anthropic') })).toEqual({
      mode: 'nudge',
      attachedTool: 'anthropic-server',
    });
  });

  it('does nothing when no execution tool was attached', () => {
    expect(enforcement({ tools: [] }).mode).toBe('none');
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
