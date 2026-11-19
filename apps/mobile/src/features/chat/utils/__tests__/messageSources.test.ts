import {
  nativeCitationFromDelta,
  persistedSourcesForSync,
  sourcesFromPersistedMetadata,
  sourcesFromToolCalls,
  turnSourceMetadata,
  turnSources,
  turnSourcesWithActivity,
  withPersistedSources,
} from '../messageSources';
import type { ChatMessage, ToolCall } from '@/types/chat';

function result(index: number, extra: Record<string, unknown> = {}) {
  return {
    url: `https://site${index}.example.org/article`,
    title: `Result ${index}`,
    snippet: `About result ${index}`,
    ...extra,
  };
}

function searchTool(results: ReturnType<typeof result>[], id = 'search-1'): ToolCall {
  return { id, name: 'web_search', status: 'succeeded', searchResults: results };
}

function activityWithSources(sources: Array<{ url: string; title: string }>) {
  return {
    schemaVersion: 1,
    sessionId: 'session',
    turnId: 'turn',
    lastSequence: 2,
    status: 'running',
    startedAtMs: 1,
    updatedAtMs: 2,
    entries: [{ kind: 'sources', id: 'sources-1', sources, emittedAtMs: 1 }],
  };
}

describe('sources stored on a turn', () => {
  it('numbers every stored search result, with no cap, keeping the published and retrieved dates', () => {
    const results = Array.from({ length: 12 }, (_, index) =>
      result(index + 1, {
        publishedDate: '2026-11-01',
        provenance: { retrievedAt: '2026-11-14T09:00:00.000Z' },
      }),
    );
    const sources = sourcesFromPersistedMetadata({
      searchResults: { query: 'tulip care', results, timestamp: '2026-11-14T09:00:00.000Z' },
    });
    expect(sources).toHaveLength(12);
    expect(sources[9]).toEqual({
      url: 'https://site10.example.org/article',
      title: 'Result 10',
      snippet: 'About result 10',
      publishedDate: '2026-11-01',
      retrievedAt: '2026-11-14T09:00:00.000Z',
    });
  });

  it('puts the pages a native-search answer cited first, in marker order, and adds cited pages that were never listed', () => {
    const sources = sourcesFromPersistedMetadata({
      searchResults: [result(1), result(2), result(3)],
      citations: [
        { type: 'url_citation', url: 'https://www.site3.example.org/article/', title: 'Cited 3' },
        { type: 'url_citation', url: 'https://only-cited.example.net/page', title: 'Only cited' },
      ],
    });
    expect(sources.map((source) => source.title)).toEqual([
      'Cited 3',
      'Only cited',
      'Result 1',
      'Result 2',
    ]);
    expect(sources[0]?.snippet).toBe('About result 3');
  });

  it('reads the source URLs a search answer listed without result rows', () => {
    expect(
      sourcesFromPersistedMetadata({
        searchResults: {
          query: 'q',
          results: [result(1)],
          sources: ['https://site1.example.org/article', 'https://extra.example.com/'],
        },
      }).map((source) => source.url),
    ).toEqual(['https://site1.example.org/article', 'https://extra.example.com/']);
  });

  it('adds the pages the stored activity trace read, after the numbered ones', () => {
    const sources = sourcesFromPersistedMetadata({
      searchResults: [result(1)],
      agentActivity: {
        schemaVersion: 1,
        sessionId: 'session',
        turnId: 'turn',
        lastSequence: 2,
        status: 'completed',
        startedAtMs: 1,
        updatedAtMs: 2,
        entries: [
          {
            kind: 'sources',
            id: 'sources-1',
            sources: [
              { url: 'https://site1.example.org/article', title: 'Result 1' },
              { url: 'https://trace.example.com/read', title: 'Read by the agent' },
            ],
            emittedAtMs: 1,
          },
        ],
      },
    });
    expect(sources.map((source) => source.url)).toEqual([
      'https://site1.example.org/article',
      'https://trace.example.com/read',
    ]);
  });

  it('ignores rows without a URL and metadata that is not an object', () => {
    expect(sourcesFromPersistedMetadata(null)).toEqual([]);
    expect(sourcesFromPersistedMetadata({ searchResults: [{ title: 'no url' }] })).toEqual([]);
    expect(
      sourcesFromPersistedMetadata({ citations: [{ url: 'https://a.example.com/', title: '' }] }),
    ).toEqual([]);
  });

  it('gives a reopened answer its stored sources and leaves a question alone', () => {
    const metadata = { searchResults: [result(1)] };
    const base = { conversationId: 'c', createdAt: '2026-11-15T10:00:00Z', metadata };
    const answer: ChatMessage = { ...base, id: 'a', role: 'assistant', content: 'See [1].' };
    const question: ChatMessage = { ...base, id: 'q', role: 'user', content: 'Q' };
    expect(withPersistedSources(answer).citations).toEqual([result(1)]);
    expect(withPersistedSources(question)).toBe(question);
  });
});

describe('sources from a live turn', () => {
  it('keeps every search result across tools, once each, with its published date', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      result(index + 1, { publishedDate: 'Nov 2026' }),
    );
    const sources = sourcesFromToolCalls([
      searchTool(many),
      searchTool([result(1), result(13)], 'search-2'),
      { id: 'code', name: 'code_execution', status: 'succeeded' },
    ]);
    expect(sources).toHaveLength(13);
    expect(sources[11]?.publishedDate).toBe('Nov 2026');
  });

  it('orders a native-search turn by the pages the model cited', () => {
    const cited = [{ url: 'https://site2.example.org/article', title: 'Second' }];
    expect(turnSources([searchTool([result(1), result(2)])], cited).map((s) => s.url)).toEqual([
      'https://site2.example.org/article',
      'https://site1.example.org/article',
    ]);
  });

  it('stores a turn in the shape web writes and reads back the same order', () => {
    const tools = [searchTool([result(1), result(2)])];
    const cited = [
      { url: 'https://cited.example.com/a', title: 'Cited' },
      { url: 'https://cited.example.com/a', title: 'Cited again' },
    ];
    const metadata = turnSourceMetadata(tools, cited);
    expect(metadata).toEqual({
      searchResults: [result(1), result(2)],
      citations: [{ type: 'url_citation', url: 'https://cited.example.com/a', title: 'Cited' }],
    });
    expect(sourcesFromPersistedMetadata(metadata)).toEqual(turnSources(tools, cited));
    expect(turnSourceMetadata([], [])).toEqual({});
  });

  it('adds the pages an agent run reported only as activity, after the cited and searched ones, once each', () => {
    const tools = [searchTool([result(1), result(2)])];
    const cited = [{ url: 'https://site2.example.org/article', title: 'Second' }];
    const agentActivity = activityWithSources([
      { url: 'https://www.site1.example.org/article/', title: 'Result 1 again' },
      { url: 'https://agent.example.com/read', title: 'Read by the agent' },
      { url: 'https://agent.example.com/read', title: 'Read twice' },
      { url: 'https://agent.example.com/other', title: 'Another page' },
    ]);
    const sources = turnSourcesWithActivity(tools, cited, agentActivity);
    expect(sources.map((source) => source.url)).toEqual([
      'https://site2.example.org/article',
      'https://site1.example.org/article',
      'https://agent.example.com/read',
      'https://agent.example.com/other',
    ]);
    expect(sources[2]?.title).toBe('Read by the agent');
    expect(
      sourcesFromPersistedMetadata({ ...turnSourceMetadata(tools, cited), agentActivity }),
    ).toEqual(sources);
  });

  it('lists an agent run that searched only through activity, and nothing when it read no pages', () => {
    const agentActivity = activityWithSources([
      { url: 'https://agent.example.com/read', title: 'Read by the agent' },
    ]);
    expect(turnSourcesWithActivity([], [], agentActivity).map((source) => source.url)).toEqual([
      'https://agent.example.com/read',
    ]);
    expect(turnSourcesWithActivity([], [], activityWithSources([]))).toEqual([]);
    expect(turnSourcesWithActivity([], [], undefined)).toEqual([]);
  });

  it('accepts a cited page from the stream only with a URL and a title', () => {
    expect(nativeCitationFromDelta({ url: 'https://a.example.com/', title: 'A' })).toEqual({
      url: 'https://a.example.com/',
      title: 'A',
    });
    expect(nativeCitationFromDelta({ url: 'https://a.example.com/' })).toBeNull();
    expect(nativeCitationFromDelta('https://a.example.com/')).toBeNull();
  });
});

describe('sources written back on a sync', () => {
  it('stores the shown sources when the row has none, and never replaces stored ones', () => {
    const citations = [
      { url: 'https://a.example.com/', title: 'A', publishedDate: '2026-11-02' },
    ] as ChatMessage['citations'];
    expect(persistedSourcesForSync({ role: 'assistant', citations, metadata: {} })).toEqual([
      { url: 'https://a.example.com/', title: 'A', publishedDate: '2026-11-02' },
    ]);
    expect(
      persistedSourcesForSync({
        role: 'assistant',
        citations,
        metadata: { searchResults: [] },
      }),
    ).toBeUndefined();
    expect(persistedSourcesForSync({ role: 'user', citations, metadata: {} })).toBeUndefined();
    expect(persistedSourcesForSync({ role: 'assistant', metadata: {} })).toBeUndefined();
  });
});

describe('opaque provider tokens are never shown as a snippet', () => {
  const OPAQUE =
    'EsQBCioIDBgCIiQ4YzMyNDBjOS1hZDFkLTRiNzItYjJkNy1mODI1MDQwMzkxZDhmEgwxQmFzZTY0VG9rZW5Zd0h4NzNhU1pRcEVhdjkwSnZRb0x3UnhHbk5mSzVhWjhQcTdMYzJYdw';

  it('drops them when a stored turn is read back', () => {
    const sources = sourcesFromPersistedMetadata({
      searchResults: [result(1, { snippet: OPAQUE }), result(2)],
    });
    expect(sources[0]).toEqual({
      url: 'https://site1.example.org/article',
      title: 'Result 1',
    });
    expect(sources[1]?.snippet).toBe('About result 2');
  });

  it('drops them from the sources of a live turn and of a sync write-back', () => {
    const live = sourcesFromToolCalls([searchTool([result(1, { snippet: OPAQUE })])]);
    expect(live[0]).not.toHaveProperty('snippet');
    expect(
      persistedSourcesForSync({
        role: 'assistant',
        metadata: {},
        citations: [{ url: 'https://a.example.com/', title: 'A', snippet: OPAQUE }],
      })?.[0],
    ).toEqual({ url: 'https://a.example.com/', title: 'A' });
  });
});
