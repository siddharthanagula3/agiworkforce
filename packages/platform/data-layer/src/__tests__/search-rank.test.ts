import { describe, expect, it } from 'vitest';

import {
  RECIPROCAL_RANK_CONSTANT,
  reciprocalRankScore,
  rerankCandidates,
  searchTerms,
  windowText,
  type SearchCandidate,
} from '../search';

function candidate(overrides: Partial<SearchCandidate>): SearchCandidate {
  return {
    chunkId: 'chunk',
    documentId: 'doc',
    sourceKind: 'project_knowledge',
    sourceId: 'source',
    title: '',
    text: '',
    start: 0,
    end: 0,
    metadata: {},
    chunkVersion: 1,
    indexedAt: null,
    lexicalRank: null,
    semanticRank: null,
    ...overrides,
  };
}

describe('reciprocal rank fusion', () => {
  it('rewards a candidate both lists found over one only a single list found', () => {
    const both = reciprocalRankScore({ lexicalRank: 3, semanticRank: 3 });
    const lexicalOnly = reciprocalRankScore({ lexicalRank: 1, semanticRank: null });
    expect(both).toBeGreaterThan(lexicalOnly);
    expect(lexicalOnly).toBeCloseTo(1 / (RECIPROCAL_RANK_CONSTANT + 1));
  });
});

describe('rerankCandidates', () => {
  it('promotes the passage that actually answers the query over a higher fused rank', () => {
    const hits = rerankCandidates(
      'refund window',
      [
        candidate({
          chunkId: 'a',
          sourceId: 's1',
          text: 'shipping takes five days',
          semanticRank: 1,
        }),
        candidate({
          chunkId: 'b',
          sourceId: 's2',
          text: 'The refund window is thirty days from delivery.',
          lexicalRank: 2,
          semanticRank: 2,
        }),
      ],
      { limit: 5 },
    );
    expect(hits.map((hit) => hit.chunkId)).toEqual(['b', 'a']);
    expect(hits[0]!.matchedTerms).toEqual(['refund', 'window']);
  });

  it('drops a near-duplicate passage from a second source', () => {
    const text = 'Quarterly revenue grew twelve percent on enterprise seat expansion.';
    const hits = rerankCandidates(
      'quarterly revenue',
      [
        candidate({ chunkId: 'a', sourceId: 's1', text, lexicalRank: 1 }),
        candidate({ chunkId: 'b', sourceId: 's2', text: `${text} `, lexicalRank: 2 }),
      ],
      { limit: 5 },
    );
    expect(hits).toHaveLength(1);
  });

  it('caps how many hits one source may take', () => {
    const hits = rerankCandidates(
      'alpha',
      [
        'alpha launch checklist for the mobile store',
        'alpha pricing notes from the finance review',
        'alpha incident timeline and the follow-up owners',
      ].map((text, index) =>
        candidate({ chunkId: `c${index}`, sourceId: 'same', text, lexicalRank: index + 1 }),
      ),
      { limit: 5, maxPerSource: 2 },
    );
    expect(hits).toHaveLength(2);
  });
});

describe('searchTerms', () => {
  it('keeps single CJK characters and drops single Latin letters', () => {
    expect(searchTerms('a 数 data')).toEqual(['数', 'data']);
  });
});

describe('windowText', () => {
  it('covers the whole text with overlapping windows carrying offsets', () => {
    const content = Array.from({ length: 40 }, (_, index) => `Sentence ${index} ends here.`).join(
      ' ',
    );
    const windows = windowText(content, {
      windowChars: 200,
      overlapChars: 40,
      minWindowChars: 50,
      boundarySearchChars: 60,
    });
    expect(windows[0]!.start).toBe(0);
    expect(windows.at(-1)!.end).toBe(content.length);
    for (const window of windows) {
      expect(content.slice(window.start, window.end)).toBe(window.text);
    }
    for (let index = 1; index < windows.length; index += 1) {
      expect(windows[index]!.start).toBeLessThan(windows[index - 1]!.end);
    }
  });
});
