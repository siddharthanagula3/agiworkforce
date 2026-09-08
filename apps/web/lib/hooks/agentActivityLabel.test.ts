import { describe, expect, it } from 'vitest';
import {
  deriveAgentActivityLabel,
  extractToolActivityArgument,
  type AgentActivityLabelSignal,
} from './agentActivityLabel';

describe('deriveAgentActivityLabel', () => {
  const cases: Array<[string, AgentActivityLabelSignal, string]> = [
    ['idle without a known model', { kind: 'idle' }, 'Connecting to the model'],
    [
      'idle with a known model',
      { kind: 'idle', modelName: 'Harness Test Model' },
      'Connecting to Harness Test Model',
    ],
    ['thinking', { kind: 'thinking' }, 'Thinking'],
    ['planning', { kind: 'planning' }, 'Planning'],
    [
      'web search with a query',
      {
        kind: 'tool',
        name: 'web_search',
        category: 'web-search',
        argument: 'August 2026 releases',
      },
      'Searching the web for August 2026 releases',
    ],
    [
      'web search without a query',
      { kind: 'tool', name: 'web_search', category: 'web-search' },
      'Searching the web',
    ],
    [
      'reading a file',
      { kind: 'tool', name: 'read_file', category: 'filesystem', argument: 'sales.csv' },
      'Reading sales.csv',
    ],
    [
      'reading a file with no name known',
      { kind: 'tool', name: 'read_file', category: 'filesystem' },
      'Reading a file',
    ],
    [
      'fetching a web page',
      { kind: 'tool', name: 'web_fetch', category: 'web-fetch', argument: 'example.com' },
      'Reading example.com',
    ],
    [
      'running code',
      { kind: 'tool', name: 'code_execution', category: 'code-execution' },
      'Running code',
    ],
    [
      'shell category also runs as code',
      { kind: 'tool', name: 'shell_exec', category: 'shell' },
      'Running code',
    ],
    [
      'looking up a place',
      { kind: 'tool', name: 'search_maps', category: 'other', argument: 'the nearest cafe' },
      'Looking up a place',
    ],
    [
      'an unrecognized tool falls back to its name',
      { kind: 'tool', name: 'custom_tool', category: 'other' },
      'Using custom_tool',
    ],
    [
      'an unrecognized tool with an argument',
      { kind: 'tool', name: 'custom_tool', category: 'other', argument: 'the report' },
      'Using custom_tool for the report',
    ],
    [
      'waiting for a first token before a second has passed',
      { kind: 'waiting', modelName: 'OpenRouter Free Auto', elapsedMs: 400 },
      'Waiting for the first token from OpenRouter Free Auto',
    ],
    [
      'waiting for a first token with the elapsed time',
      { kind: 'waiting', modelName: 'OpenRouter Free Auto', elapsedMs: 12_400 },
      'Waiting for the first token from OpenRouter Free Auto \u00b7 12s',
    ],
    [
      'waiting without a known model',
      { kind: 'waiting', elapsedMs: 9_000 },
      'Waiting for the first token \u00b7 9s',
    ],
    [
      'connecting reports how long it has been trying',
      { kind: 'idle', modelName: 'OpenRouter Free Auto', elapsedMs: 62_000 },
      'Connecting to OpenRouter Free Auto \u00b7 62s',
    ],
    [
      'connecting stays unadorned before the first second',
      { kind: 'idle', modelName: 'OpenRouter Free Auto', elapsedMs: 200 },
      'Connecting to OpenRouter Free Auto',
    ],
  ];

  it.each(cases)('%s', (_description, signal, expected) => {
    expect(deriveAgentActivityLabel(signal)).toBe(expected);
  });
});

describe('the waiting label is honest about what it is waiting for', () => {
  it('never claims to be connecting once the route has answered the request', () => {
    const connecting = deriveAgentActivityLabel({ kind: 'idle', modelName: 'Any Model' });
    const waiting = deriveAgentActivityLabel({
      kind: 'waiting',
      modelName: 'Any Model',
      elapsedMs: 30_000,
    });

    expect(connecting).toContain('Connecting');
    expect(waiting).not.toContain('Connecting');
  });

  it('advances the elapsed reading as the wait grows', () => {
    const signal = (elapsedMs: number): AgentActivityLabelSignal => ({
      kind: 'waiting',
      modelName: 'Any Model',
      elapsedMs,
    });

    expect(deriveAgentActivityLabel(signal(5_000))).not.toBe(
      deriveAgentActivityLabel(signal(6_000)),
    );
  });
});

describe('extractToolActivityArgument', () => {
  it('returns undefined for missing args', () => {
    expect(extractToolActivityArgument(undefined)).toBeUndefined();
  });

  it('returns undefined when no known key holds a usable value', () => {
    expect(extractToolActivityArgument({ unrelated: 'value' })).toBeUndefined();
  });

  it('skips blank strings', () => {
    expect(extractToolActivityArgument({ query: '   ', path: 'notes.md' })).toBe('notes.md');
  });

  it('prefers query over lower-priority keys', () => {
    expect(extractToolActivityArgument({ query: 'weather today', path: 'notes.md' })).toBe(
      'weather today',
    );
  });

  it('trims the matched value', () => {
    expect(extractToolActivityArgument({ query: '  weather today  ' })).toBe('weather today');
  });
});
