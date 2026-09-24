import { beforeEach, describe, expect, it, vi } from 'vitest';

import { annotateActiveSpan } from '@/lib/observability/span';

import {
  REQUIRED_SEARCH_SYSTEM_NUDGE,
  classifyAttachedSearchTool,
  detectFreshnessIntent,
  nativeSearchToolName,
  resolveRequiredSearchEnforcement,
  resolveWebSearchRequirement,
  shouldOfferWebSearchForTurn,
  substituteGatedWebSearchTool,
} from './required-search';

vi.mock('@/lib/observability/span', () => ({ annotateActiveSpan: vi.fn() }));
import { WEB_SEARCH_TOOL, webSearchToolDef } from './web-search-tool';

const GENERIC_TOOL = webSearchToolDef();
const OPENAI_HOSTED_TOOL = { type: WEB_SEARCH_TOOL };
const ANTHROPIC_SERVER_TOOL = {
  type: 'web_search_20260209',
  name: WEB_SEARCH_TOOL,
  allowed_callers: ['direct'],
};
const GOOGLE_BUILTIN_TOOL = { google_search: {} };
const UNRELATED_TOOL = {
  type: 'function',
  function: { name: 'url_fetch', description: '', parameters: {} },
};

describe('resolveWebSearchRequirement', () => {
  const base = { webSearchEnabled: undefined, agiWorkRun: false, researchTask: false };

  beforeEach(() => {
    vi.mocked(annotateActiveSpan).mockClear();
  });

  it('offers but never forces a search when search is merely switched on', () => {
    expect(
      resolveWebSearchRequirement({ ...base, webSearchEnabled: true, userMessage: 'hi' }),
    ).toEqual({ required: false, source: null });
  });

  it('forces a search when search is on and the message asks for one', () => {
    expect(
      resolveWebSearchRequirement({
        ...base,
        webSearchEnabled: true,
        userMessage: 'search the web for the latest mac studio price',
      }),
    ).toEqual({ required: true, source: 'explicit_intent' });
  });

  it('requires a search for an AGI Work run with search enabled', () => {
    expect(resolveWebSearchRequirement({ ...base, agiWorkRun: true, userMessage: 'hi' })).toEqual({
      required: true,
      source: 'work_mode',
    });
  });

  it('requires a search when the user asked for one in the message text', () => {
    expect(
      resolveWebSearchRequirement({ ...base, userMessage: 'look up the current release' }),
    ).toEqual({ required: true, source: 'explicit_intent' });
  });

  it('requires a search when the classifier routed the turn to research', () => {
    expect(
      resolveWebSearchRequirement({ ...base, researchTask: true, userMessage: 'compare these' }),
    ).toEqual({ required: true, source: 'research_task' });
  });

  it('lets an explicit no-search instruction override inferred research and recency', () => {
    expect(
      resolveWebSearchRequirement({
        ...base,
        webSearchEnabled: true,
        researchTask: true,
        userMessage: 'Do not search the web; answer from what you know about the latest release.',
      }),
    ).toEqual({ required: false, source: null });
  });

  it('leaves an ordinary turn alone', () => {
    expect(resolveWebSearchRequirement({ ...base, userMessage: 'rewrite this paragraph' })).toEqual(
      { required: false, source: null },
    );
  });

  it('honours an explicit opt out over every other signal', () => {
    expect(
      resolveWebSearchRequirement({
        webSearchEnabled: false,
        agiWorkRun: true,
        researchTask: true,
        searchRequested: true,
        userMessage: 'search the web for today news',
      }),
    ).toEqual({ required: false, source: null });
  });

  it('requires a search when the turn asked for Search mode outright', () => {
    expect(
      resolveWebSearchRequirement({
        ...base,
        searchRequested: true,
        userMessage: 'summarise the EU AI Act',
      }),
    ).toEqual({ required: true, source: 'explicit_mode' });
  });

  it('requires a search for a date-sensitive question no keyword in the list matches', () => {
    expect(
      resolveWebSearchRequirement({ ...base, userMessage: 'what happened yesterday in Lagos' }),
    ).toEqual({ required: true, source: 'freshness' });
    expect(
      resolveWebSearchRequirement({ ...base, userMessage: 'who won the Bundesliga match' }),
    ).toEqual({ required: true, source: 'freshness' });
  });

  it('records the decision and its source on the active span', () => {
    resolveWebSearchRequirement({ ...base, userMessage: 'what happened yesterday in Lagos' });
    expect(annotateActiveSpan).toHaveBeenCalledWith({
      'web_search.required': true,
      'web_search.source': 'freshness',
    });

    resolveWebSearchRequirement({ ...base, userMessage: 'rewrite this paragraph' });
    expect(annotateActiveSpan).toHaveBeenLastCalledWith({
      'web_search.required': false,
      'web_search.source': 'none',
    });
  });
});

describe('shouldOfferWebSearchForTurn', () => {
  const optional = { required: false, source: null } as const;
  const required = { required: true, source: 'explicit_intent' } as const;

  it('keeps an optional search tool off the free router on website chat', () => {
    expect(
      shouldOfferWebSearchForTurn({
        webSearchEnabled: true,
        requirement: optional,
        modelPolicy: 'required_only',
        surface: 'web',
      }),
    ).toBe(false);
  });

  it('offers search when the same website turn requires it', () => {
    expect(
      shouldOfferWebSearchForTurn({
        webSearchEnabled: true,
        requirement: required,
        modelPolicy: 'required_only',
        surface: 'web',
      }),
    ).toBe(true);
  });

  it('withholds even optional website search when the user explicitly refuses it', () => {
    expect(
      shouldOfferWebSearchForTurn({
        webSearchEnabled: true,
        requirement: optional,
        modelPolicy: undefined,
        surface: 'web',
        userOptOut: true,
      }),
    ).toBe(false);
  });

  it('preserves optional search for other models and API clients', () => {
    for (const input of [
      { modelPolicy: undefined, surface: 'web' },
      { modelPolicy: 'required_only' as const, surface: 'api' },
    ]) {
      expect(
        shouldOfferWebSearchForTurn({
          webSearchEnabled: true,
          requirement: optional,
          ...input,
        }),
      ).toBe(true);
    }
  });

  it('respects an explicit search opt-out', () => {
    expect(
      shouldOfferWebSearchForTurn({
        webSearchEnabled: false,
        requirement: required,
        modelPolicy: 'required_only',
        surface: 'web',
      }),
    ).toBe(false);
  });
});

describe('detectFreshnessIntent', () => {
  const now = new Date('2026-09-18T00:00:00Z');

  it.each([
    'what happened today in Lagos',
    'what happened yesterday in Lagos',
    'who won the election results',
    'is the newest iPhone out yet',
    'give me the exchange rate for the yen',
    'what shipped last week',
    'what is the weather in Oslo',
  ])('treats %j as date sensitive', (message) => {
    expect(detectFreshnessIntent(message, now)).toBe(true);
  });

  it.each([
    'rewrite this paragraph',
    'explain how a red-black tree rebalances',
    'what happened in 1994',
    'compare these two drafts',
    '',
  ])('leaves %j alone', (message) => {
    expect(detectFreshnessIntent(message, now)).toBe(false);
  });

  it('treats the current and coming year as date sensitive, older years as settled', () => {
    expect(detectFreshnessIntent('best laptops 2026', now)).toBe(true);
    expect(detectFreshnessIntent('best laptops 2027', now)).toBe(true);
    expect(detectFreshnessIntent('best laptops 2021', now)).toBe(false);
  });
});

describe('classifyAttachedSearchTool', () => {
  it('tells the four attached search-tool shapes apart', () => {
    expect(classifyAttachedSearchTool([GENERIC_TOOL])).toBe('generic-function');
    expect(classifyAttachedSearchTool([OPENAI_HOSTED_TOOL])).toBe('openai-hosted');
    expect(classifyAttachedSearchTool([ANTHROPIC_SERVER_TOOL])).toBe('anthropic-server');
    expect(classifyAttachedSearchTool([GOOGLE_BUILTIN_TOOL])).toBe('google-builtin');
  });

  it('reports nothing when no search tool is attached', () => {
    expect(classifyAttachedSearchTool([UNRELATED_TOOL])).toBeNull();
    expect(classifyAttachedSearchTool([])).toBeNull();
    expect(classifyAttachedSearchTool(undefined)).toBeNull();
  });

  it('finds the search tool among other tools', () => {
    expect(classifyAttachedSearchTool([UNRELATED_TOOL, GENERIC_TOOL])).toBe('generic-function');
  });
});

describe('nativeSearchToolName', () => {
  it('names each provider-native shape', () => {
    expect(nativeSearchToolName(OPENAI_HOSTED_TOOL)).toBe('openai-hosted');
    expect(nativeSearchToolName(ANTHROPIC_SERVER_TOOL)).toBe('anthropic-server');
    expect(nativeSearchToolName(GOOGLE_BUILTIN_TOOL)).toBe('google-builtin');
  });

  it('is empty for our own function tool and for anything unrelated', () => {
    expect(nativeSearchToolName(GENERIC_TOOL)).toBe('');
    expect(nativeSearchToolName(UNRELATED_TOOL)).toBe('');
    expect(nativeSearchToolName(undefined)).toBe('');
  });
});

describe('resolveRequiredSearchEnforcement', () => {
  const base = {
    required: true,
    requestedToolChoice: undefined,
    stream: true as boolean | undefined,
    model: undefined,
  };

  it('forces the generic function tool by name', () => {
    expect(resolveRequiredSearchEnforcement({ ...base, tools: [GENERIC_TOOL] })).toEqual({
      mode: 'tool-choice',
      toolChoice: { type: 'function', function: { name: WEB_SEARCH_TOOL } },
      attachedTool: 'generic-function',
    });
  });

  it('forces the openai hosted search tool by name', () => {
    expect(resolveRequiredSearchEnforcement({ ...base, tools: [OPENAI_HOSTED_TOOL] })).toEqual({
      mode: 'tool-choice',
      toolChoice: { type: 'function', function: { name: WEB_SEARCH_TOOL } },
      attachedTool: 'openai-hosted',
    });
  });

  it('falls back to the prompt for the anthropic and google server tools', () => {
    expect(resolveRequiredSearchEnforcement({ ...base, tools: [ANTHROPIC_SERVER_TOOL] })).toEqual({
      mode: 'nudge',
      attachedTool: 'anthropic-server',
    });
    expect(resolveRequiredSearchEnforcement({ ...base, tools: [GOOGLE_BUILTIN_TOOL] })).toEqual({
      mode: 'nudge',
      attachedTool: 'google-builtin',
    });
  });

  it('does nothing when the turn does not require a search', () => {
    expect(
      resolveRequiredSearchEnforcement({ ...base, required: false, tools: [GENERIC_TOOL] }),
    ).toEqual({ mode: 'none', attachedTool: null });
  });

  it('never overrides a tool choice the caller supplied', () => {
    expect(
      resolveRequiredSearchEnforcement({
        ...base,
        requestedToolChoice: 'none',
        tools: [GENERIC_TOOL],
      }),
    ).toEqual({ mode: 'none', attachedTool: null });
  });

  it('does nothing on a non-streaming turn, which never enters the tool loop', () => {
    expect(
      resolveRequiredSearchEnforcement({ ...base, stream: false, tools: [GENERIC_TOOL] }),
    ).toEqual({ mode: 'none', attachedTool: null });
  });

  it('does nothing when no search tool reached the request', () => {
    expect(resolveRequiredSearchEnforcement({ ...base, tools: [UNRELATED_TOOL] })).toEqual({
      mode: 'none',
      attachedTool: null,
    });
  });

  it('publishes a nudge that names the tool and forbids answering from memory', () => {
    expect(REQUIRED_SEARCH_SYSTEM_NUDGE).toContain('web search tool');
    expect(REQUIRED_SEARCH_SYSTEM_NUDGE).toContain('memory');
  });
});

describe('substituteGatedWebSearchTool', () => {
  const GENERIC = webSearchToolDef();

  it('leaves the tools alone when no approval is required', () => {
    const tools = [GOOGLE_BUILTIN_TOOL];
    expect(
      substituteGatedWebSearchTool(tools, {
        approvalRequired: false,
        genericBackendConfigured: true,
      }),
    ).toBe(tools);
  });

  it.each([
    ['google', GOOGLE_BUILTIN_TOOL],
    ['anthropic', ANTHROPIC_SERVER_TOOL],
    ['openai', OPENAI_HOSTED_TOOL],
  ])('swaps the %s native search for our own gateable tool', (_provider, nativeTool) => {
    const result = substituteGatedWebSearchTool([nativeTool], {
      approvalRequired: true,
      genericBackendConfigured: true,
    });

    expect(result?.some((tool) => nativeSearchToolName(tool) !== '')).toBe(false);
    expect(result).toEqual([GENERIC]);
  });

  it('keeps every unrelated tool in place', () => {
    const other = { type: 'function', function: { name: 'url_fetch' } };
    const result = substituteGatedWebSearchTool([other, GOOGLE_BUILTIN_TOOL], {
      approvalRequired: true,
      genericBackendConfigured: true,
    });

    expect(result?.[0]).toBe(other);
    expect(result).toHaveLength(2);
  });

  it('does not add a second generic tool when one is already offered', () => {
    const result = substituteGatedWebSearchTool([GENERIC, GOOGLE_BUILTIN_TOOL], {
      approvalRequired: true,
      genericBackendConfigured: true,
    });

    expect(result).toEqual([GENERIC]);
  });

  it('withdraws search entirely rather than run it un-approved with no fallback', () => {
    // Fail-closed. Leaving the native tool attached would keep running searches
    // the account said had to be approved, which is the defect this replaces.
    const result = substituteGatedWebSearchTool([GOOGLE_BUILTIN_TOOL], {
      approvalRequired: true,
      genericBackendConfigured: false,
    });

    expect(result).toEqual([]);
  });

  it('passes undefined through untouched', () => {
    expect(
      substituteGatedWebSearchTool(undefined, {
        approvalRequired: true,
        genericBackendConfigured: true,
      }),
    ).toBeUndefined();
  });
});
