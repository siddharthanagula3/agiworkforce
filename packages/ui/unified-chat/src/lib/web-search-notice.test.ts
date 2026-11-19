import { describe, expect, it } from 'vitest';
import {
  turnAttemptedSearch,
  turnDeclinedSearch,
  turnRanAnyTool,
  webSearchNoticeFor,
  type WebSearchNoticeTurn,
} from './web-search-notice';

const askedAndSearched: WebSearchNoticeTurn = {
  isUser: false,
  streaming: false,
  awaitingApproval: false,
  webSearchRequested: true,
  webSearchAskedInText: true,
  producedNoVisibleOutput: false,
  rendersResearchPlan: false,
  hasStreamError: false,
  webSearchUnavailable: false,
  toolAwaitingApproval: false,
  attemptedSearch: true,
  ranAnyTool: true,
  memoryCitationCount: 0,
  sourceCount: 0,
};

describe('webSearchNoticeFor', () => {
  it('reports an empty search the person asked for', () => {
    expect(webSearchNoticeFor(askedAndSearched)).toBe('no-results');
    expect(webSearchNoticeFor({ ...askedAndSearched, sourceCount: 2 })).toBeNull();
  });

  it('reports a search that never ran, or an answer from memory', () => {
    const notSearched = { ...askedAndSearched, attemptedSearch: false, ranAnyTool: false };
    expect(webSearchNoticeFor(notSearched)).toBe('not-invoked');
    expect(webSearchNoticeFor({ ...notSearched, memoryCitationCount: 1 })).toBe('memory-grounded');
    expect(webSearchNoticeFor({ ...notSearched, ranAnyTool: true })).toBeNull();
  });

  it('says nothing while the answer is open or the question was not about the web', () => {
    for (const change of [
      { isUser: true },
      { streaming: true },
      { awaitingApproval: true },
      { webSearchRequested: false },
      { webSearchAskedInText: false },
      { producedNoVisibleOutput: true },
      { rendersResearchPlan: true },
      { hasStreamError: true },
      { webSearchUnavailable: true },
      { toolAwaitingApproval: true },
      { declinedSearch: true },
    ] satisfies Partial<WebSearchNoticeTurn>[]) {
      expect(webSearchNoticeFor({ ...askedAndSearched, ...change })).toBeNull();
    }
  });
});

describe('search attempt from the turn activity', () => {
  it('reads a turn whose only searches the person declined as a declined search, not an empty one', () => {
    const declined = {
      entries: [
        { kind: 'tool', category: 'web-search', approval: { decision: 'denied' } },
        { kind: 'text' },
      ],
    };
    expect(turnAttemptedSearch(declined, undefined)).toBe(true);
    expect(turnDeclinedSearch(declined)).toBe(true);
    expect(
      webSearchNoticeFor({ ...askedAndSearched, declinedSearch: turnDeclinedSearch(declined) }),
    ).toBeNull();
    expect(
      turnDeclinedSearch({
        entries: [
          { kind: 'tool', category: 'web-search', approval: { decision: 'denied' } },
          { kind: 'tool', category: 'web-fetch', approval: { decision: 'approved' } },
        ],
      }),
    ).toBe(false);
    expect(turnDeclinedSearch({ entries: [{ kind: 'tool', category: 'web-search' }] })).toBe(false);
    expect(turnDeclinedSearch({ entries: [] })).toBe(false);
    expect(turnDeclinedSearch(undefined)).toBe(false);
  });

  it('counts a search or fetch step, a sources entry, or a legacy search tool name', () => {
    expect(turnAttemptedSearch({ entries: [{ kind: 'tool', category: 'web-fetch' }] }, [])).toBe(
      true,
    );
    expect(turnAttemptedSearch({ entries: [{ kind: 'sources' }] }, undefined)).toBe(true);
    expect(turnAttemptedSearch(undefined, ['google_grounding'])).toBe(true);
    expect(
      turnAttemptedSearch({ entries: [{ kind: 'tool', category: 'mcp' }] }, ['read_file']),
    ).toBe(false);
  });

  it('counts any tool step or legacy tool call as a turn that ran a tool', () => {
    expect(turnRanAnyTool({ entries: [{ kind: 'tool', category: 'mcp' }] }, undefined)).toBe(true);
    expect(turnRanAnyTool(null, ['read_file'])).toBe(true);
    expect(turnRanAnyTool({ entries: [{ kind: 'sources' }] }, [])).toBe(false);
  });
});
