import { describe, expect, it } from 'vitest';
import type { AgentActivityState, AgentActivityToolEntry } from '@agiworkforce/client-runtime';

import { buildAgentActivitySummary } from '../AgentActivityTimeline';

function search(id: string, urls: string[]): AgentActivityToolEntry {
  return {
    kind: 'tool',
    id: `tool:${id}`,
    toolCallId: id,
    name: 'web_search',
    category: 'web-search',
    summary: 'Searching the web',
    status: 'completed',
    input: { query: 'node lts' },
    startedAtMs: 1_100,
    completedAtMs: 1_500,
    query: 'node lts',
    sources: urls.map((url) => ({ url, title: url })),
  };
}

function finished(entries: AgentActivityToolEntry[]): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    turnId: 'turn-1',
    lastSequence: 4,
    status: 'completed',
    startedAtMs: 1_000,
    updatedAtMs: 1_900,
    completedAtMs: 1_900,
    entries,
  };
}

const RUN = finished([
  search('s1', ['https://a.example', 'https://b.example']),
  search('s2', ['https://b.example', 'https://c.example']),
]);

describe('web search source count', () => {
  it('counts a page two searches both returned once', () => {
    expect(buildAgentActivitySummary(RUN, 2_000)).toBe('Searched the web · 3 sources');
  });

  it('reads the count the finished answer lists when one is given', () => {
    expect(buildAgentActivitySummary(RUN, 2_000, undefined, 5)).toBe(
      'Searched the web · 5 sources',
    );
  });
});
