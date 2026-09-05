import { describe, expect, it } from 'vitest';

import { PLACES_SEARCH_TOOL_NAME } from '@agiworkforce/types';

import { canonicalToolSummary, isToolOffered, resolveToolRetrySafety } from './tool-loop';

describe('places search registration in the tool loop', () => {
  it('is a read-only tool the loop may retry', () => {
    expect(resolveToolRetrySafety(PLACES_SEARCH_TOOL_NAME)).toBe('safe');
  });

  it('announces itself with the leaders progress label', () => {
    expect(canonicalToolSummary(PLACES_SEARCH_TOOL_NAME, 'web-search')).toBe(
      'Searching for places',
    );
  });

  it('is offered only when the request actually carried it', () => {
    expect(isToolOffered(PLACES_SEARCH_TOOL_NAME, [], new Set([PLACES_SEARCH_TOOL_NAME]))).toBe(
      true,
    );
    expect(isToolOffered(PLACES_SEARCH_TOOL_NAME, [], new Set())).toBe(false);
  });
});
