import { describe, expect, it } from 'vitest';
import {
  countWebSearchSources,
  createSendReplayMetadata,
  hasWebSearchSources,
  isWebSearchResponse,
} from './message-metadata';

describe('web chat search metadata helpers', () => {
  it('counts flat search-result arrays by usable URLs', () => {
    const results = [
      { title: 'One', url: 'https://example.com/one', snippet: 'A' },
      { title: 'Missing', url: '', snippet: 'B' },
      { title: 'Two', url: 'https://example.com/two', snippet: 'C' },
    ];

    expect(countWebSearchSources(results)).toBe(2);
    expect(hasWebSearchSources(results)).toBe(true);
  });

  it('counts SearchResponse results and source URLs', () => {
    const response = {
      query: 'agi',
      results: [{ title: 'One', url: 'https://example.com/one', snippet: 'A' }],
      sources: ['https://example.com/source', ''],
      timestamp: new Date('2026-06-11T00:00:00.000Z'),
    };

    expect(isWebSearchResponse(response)).toBe(true);
    expect(countWebSearchSources(response)).toBe(2);
  });

  it('rejects malformed object metadata as a SearchResponse', () => {
    expect(isWebSearchResponse({ query: 'agi', sources: ['https://example.com'] })).toBe(false);
    expect(isWebSearchResponse([{ url: 'https://example.com' }])).toBe(false);
    expect(hasWebSearchSources(undefined)).toBe(false);
  });

  it('creates replay metadata without persisting raw skill instructions', () => {
    expect(
      createSendReplayMetadata({
        webSearchEnabled: true,
        thinkingEnabled: false,
        officeCreationEnabled: true,
        workMode: 'agiwork',
        styleMode: 'formal',
        hasSkillInstruction: true,
      }),
    ).toEqual({
      webSearchEnabled: true,
      thinkingEnabled: false,
      officeCreationEnabled: true,
      workMode: 'agiwork',
      styleMode: 'formal',
      hasSkillInstruction: true,
    });

    expect(createSendReplayMetadata({ styleMode: 'unknown' })).toBeUndefined();
  });
});
