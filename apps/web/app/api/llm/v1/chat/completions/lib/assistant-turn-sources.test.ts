import { describe, expect, it } from 'vitest';

import { AssistantTurnSourceCollector, MAX_PERSISTED_TURN_SOURCES } from './assistant-turn-sources';

function searchResultsEvent(content: unknown): Record<string, unknown> {
  return { choices: [{ delta: { x_search_results: { content } } }] };
}

function webResult(url: string, title = `Title for ${url}`, snippet = 'a snippet') {
  return { type: 'web_search_result', url, title, encrypted_content: snippet };
}

function citationEvent(url: string, title: string): Record<string, unknown> {
  return { choices: [{ delta: { x_citation: { url, title } } }] };
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

  /**
   * The pages a turn cited and the pages it searched are two lists that only
   * partly overlap. Persisting the searched list alone left a reloaded answer
   * whose [n] markers pointed at outlets the row never recorded, so the markers
   * rendered with nothing behind them and the Sources count was short.
   */
  it('collects the cited pages in marker order, separately from the searched pages', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(searchResultsEvent([webResult('https://searched.example')]));
    collector.ingestWireEvent(citationEvent('https://cited.example', 'Cited Outlet'));
    collector.ingestWireEvent(citationEvent('https://searched.example', 'Searched Outlet'));

    expect(collector.citationSnapshot()).toEqual([
      { type: 'url_citation', url: 'https://cited.example', title: 'Cited Outlet' },
      { type: 'url_citation', url: 'https://searched.example', title: 'Searched Outlet' },
    ]);
    expect(collector.snapshot()).toHaveLength(1);
  });

  it('records one entry per cited page when the model cites it twice', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(citationEvent('https://a.example', 'First'));
    collector.ingestWireEvent(citationEvent('https://a.example', 'Second'));

    expect(collector.citationSnapshot()).toHaveLength(1);
    expect(collector.citationSnapshot()?.[0]?.title).toBe('First');
  });

  it('ignores a citation with no url or no title, which cannot open anything', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(citationEvent('', 'No link'));
    collector.ingestWireEvent(citationEvent('https://a.example', ''));

    expect(collector.citationSnapshot()).toBeUndefined();
  });

  it('reads citations out of raw SSE bytes, the shape the stream really carries', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireBytes(
      new TextEncoder().encode(
        `data: ${JSON.stringify(citationEvent('https://a.example', 'A'))}\n\ndata: [DONE]\n\n`,
      ),
    );

    expect(collector.citationSnapshot()).toEqual([
      { type: 'url_citation', url: 'https://a.example', title: 'A' },
    ]);
  });

  /**
   * The source cap used to short-circuit the whole ingest, so a turn that
   * searched widely before it cited would have recorded no citation at all.
   */
  it('still collects citations after the source cap is reached', () => {
    const collector = new AssistantTurnSourceCollector();
    collector.ingestWireEvent(
      searchResultsEvent(
        Array.from({ length: MAX_PERSISTED_TURN_SOURCES }, (_, index) =>
          webResult(`https://example.test/${index}`),
        ),
      ),
    );
    collector.ingestWireEvent(citationEvent('https://cited.example', 'Cited Outlet'));

    expect(collector.snapshot()).toHaveLength(MAX_PERSISTED_TURN_SOURCES);
    expect(collector.citationSnapshot()).toHaveLength(1);
  });

  it('bounds how many citations one turn can write into a row', () => {
    const collector = new AssistantTurnSourceCollector();
    for (let index = 0; index < MAX_PERSISTED_TURN_SOURCES + 15; index += 1) {
      collector.ingestWireEvent(citationEvent(`https://example.test/${index}`, `T${index}`));
    }

    expect(collector.citationSnapshot()).toHaveLength(MAX_PERSISTED_TURN_SOURCES);
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
