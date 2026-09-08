import { describe, expect, it } from 'vitest';

import {
  AssistantTurnSourceCollector,
  MAX_PERSISTED_TURN_SOURCES,
} from './assistant-turn-sources';

function searchResultsEvent(content: unknown): Record<string, unknown> {
  return { choices: [{ delta: { x_search_results: { content } } }] };
}

function webResult(url: string, title = `Title for ${url}`, snippet = 'a snippet') {
  return { type: 'web_search_result', url, title, encrypted_content: snippet };
}

describe('AssistantTurnSourceCollector', () => {
  it('collects the pages a turn cited, in the order they arrived', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      searchResultsEvent([webResult('https://a.example'), webResult('https://b.example')]),
    );

    expect(collector.snapshot()).toEqual([
      { url: 'https://a.example', title: 'Title for https://a.example', snippet: 'a snippet' },
      { url: 'https://b.example', title: 'Title for https://b.example', snippet: 'a snippet' },
    ]);
  });

  it('keeps one entry per page when a turn grounds the same source twice', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(searchResultsEvent([webResult('https://a.example')]));
    collector.ingestWireEvent(searchResultsEvent([webResult('https://a.example', 'Second look')]));

    expect(collector.snapshot()).toHaveLength(1);
    expect(collector.snapshot()?.[0]?.title).toBe('Title for https://a.example');
  });

  it('falls back to the url when a result carries no title', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      searchResultsEvent([{ type: 'web_search_result', url: 'https://a.example' }]),
    );

    expect(collector.snapshot()?.[0]).toEqual({
      url: 'https://a.example',
      title: 'https://a.example',
      snippet: '',
    });
  });

  it('returns nothing for a turn that cited nothing', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent({ choices: [{ delta: { content: 'plain text' } }] });

    expect(collector.snapshot()).toBeUndefined();
  });

  it('ignores a failed search, which cites no pages', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      searchResultsEvent({ type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' }),
    );

    expect(collector.snapshot()).toBeUndefined();
  });

  it('ignores an entry that is not a web result, and one with no url', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      searchResultsEvent([
        { type: 'something_else', url: 'https://a.example' },
        { type: 'web_search_result' },
      ]),
    );

    expect(collector.snapshot()).toBeUndefined();
  });

  it('bounds how much one turn can write into a row', () => {
    const collector = new AssistantTurnSourceCollector();
    const many = Array.from({ length: MAX_PERSISTED_TURN_SOURCES + 15 }, (_, index) =>
      webResult(`https://example.test/${index}`),
    );
    collector.ingestWireEvent(searchResultsEvent(many));

    expect(collector.snapshot()).toHaveLength(MAX_PERSISTED_TURN_SOURCES);
  });

  it('bounds a single oversized snippet', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      searchResultsEvent([webResult('https://a.example', 'T', 'x'.repeat(5_000))]),
    );

    expect(collector.snapshot()?.[0]?.snippet.length).toBeLessThanOrEqual(500);
  });

  it.each([
    ['a frame with no choices', { id: 'chunk' }],
    ['a frame whose delta carries no search block', { choices: [{ delta: { content: 'x' } }] }],
    ['a non-object', 'data: [DONE]'],
    ['null', null],
  ])('survives %s', (_label, event) => {
    const collector = new AssistantTurnSourceCollector();
    expect(() => collector.ingestWireEvent(event)).not.toThrow();
    expect(collector.snapshot()).toBeUndefined();
  });
});
