import { describe, expect, it } from 'vitest';

import {
  REQUIRED_SEARCH_SYSTEM_NUDGE,
  classifyAttachedSearchTool,
  nativeSearchToolName,
  resolveRequiredSearchEnforcement,
  resolveWebSearchRequirement,
} from './required-search';
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
        userMessage: 'search the web for today news',
      }),
    ).toEqual({ required: false, source: null });
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
