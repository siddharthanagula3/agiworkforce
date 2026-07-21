import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import type { OpenAICompletionsCompatDefaults } from '@agiworkforce/provider-protocol';
import { translateChatRequest } from '../translate';
import { translateChatRequestToResponses } from '../translate-responses';

const compat: OpenAICompletionsCompatDefaults = {
  supportsStore: true,
  supportsDeveloperRole: true,
  supportsReasoningEffort: true,
  supportsUsageInStreaming: true,
  maxTokensField: 'max_completion_tokens',
  thinkingFormat: 'openai',
  visibleReasoningDetailTypes: [],
  supportsStrictMode: true,
};

const request: ChatRequest = {
  model: 'gpt-5.6-sol',
  messages: [{ role: 'user', content: 'Hello' }],
};

describe('translateChatRequestToResponses', () => {
  it('omits store by default so Local/BYOK requests stay stateless', () => {
    const params = translateChatRequestToResponses(request, { compat });

    expect(params).not.toHaveProperty('store');
  });

  it('keeps explicit store false when callers disable server-side state', () => {
    const params = translateChatRequestToResponses(request, { compat, store: false });

    expect(params.store).toBe(false);
  });

  it('only enables store when callers explicitly opt in', () => {
    const params = translateChatRequestToResponses(request, { compat, store: true });

    expect(params.store).toBe(true);
  });

  it('passes the native web_search tool to Responses and requests complete source metadata', () => {
    const params = translateChatRequestToResponses(
      {
        ...request,
        rawVendorTools: [{ type: 'web_search' }],
      },
      { compat },
    );

    expect(params.tools).toEqual([{ type: 'web_search' }]);
    expect(params.include).toEqual(['web_search_call.action.sources']);
  });

  it('maps high thinking budgets to OpenAI xhigh on supported Responses models', () => {
    const params = translateChatRequestToResponses(
      {
        ...request,
        model: 'gpt-5.6-sol',
        thinking: { type: 'enabled', budgetTokens: 32000 },
      },
      { compat },
    );

    expect(params.reasoning?.effort).toBe('xhigh');
  });

  it('downgrades xhigh budgets to high when the OpenAI model does not support xhigh', () => {
    const params = translateChatRequestToResponses(
      {
        ...request,
        model: 'gpt-5.1',
        thinking: { type: 'enabled', budgetTokens: 32000 },
      },
      { compat },
    );

    expect(params.reasoning?.effort).toBe('high');
  });

  it('uses an explicit req.effort directly, bypassing the budgetTokens-derived heuristic', () => {
    // thinkingBudgetToEffort would map a 32000-token budget to 'xhigh' (>= 30000) --
    // req.effort:'medium' must win when both are present.
    const params = translateChatRequestToResponses(
      {
        ...request,
        model: 'gpt-5.6-sol',
        effort: 'medium',
        thinking: { type: 'enabled', budgetTokens: 32000 },
      },
      { compat },
    );

    expect(params.reasoning?.effort).toBe('medium');
  });

  // INTENTIONAL SHARED-PACKAGE BEHAVIOR CHANGE (task #34's OpenAI slice,
  // team-lead-accepted): before this change, translateChatRequestToResponses
  // only ever emitted `reasoning` when `req.thinking?.type === 'enabled'` --
  // `req.effort` alone, with no `thinking` at all, produced no reasoning
  // config. Now an explicit effort alone is sufficient. This is deliberate
  // (honoring an explicit effort control is the field's whole purpose -- see
  // ChatRequest.effort's docstring in packages/contracts/types/src/provider-adapter.ts)
  // but it's a real behavior change for every OTHER caller of this shared
  // function (services/api-gateway, CLI, desktop on the Responses path), not
  // just the web v1 route -- pinned explicitly so a future change here can't
  // silently regress it either direction without a test failing.
  it('emits reasoning.effort from req.effort ALONE, with no req.thinking present at all', () => {
    const params = translateChatRequestToResponses(
      {
        ...request,
        model: 'gpt-5.6-sol',
        effort: 'high',
        // thinking deliberately omitted entirely.
      },
      { compat },
    );

    expect(params.reasoning?.effort).toBe('high');
  });
});

describe('translateChatRequest', () => {
  it('maps high thinking budgets to OpenAI xhigh for Chat Completions when supported', () => {
    const params = translateChatRequest(
      {
        ...request,
        model: 'gpt-5.6-sol',
        thinking: { type: 'enabled', budgetTokens: 32000 },
      },
      { compat, provider: 'openai' },
    );

    expect(params.reasoning_effort).toBe('xhigh');
  });

  it('never emits OpenAI max effort from thinking budgets', () => {
    const params = translateChatRequest(
      {
        ...request,
        model: 'gpt-5.6-sol',
        thinking: { type: 'enabled', budgetTokens: Number.MAX_SAFE_INTEGER },
      },
      { compat, provider: 'openai' },
    );

    expect(params.reasoning_effort).toBe('xhigh');
  });
});
