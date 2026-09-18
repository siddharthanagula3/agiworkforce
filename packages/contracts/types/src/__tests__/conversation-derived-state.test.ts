import { describe, expect, it } from 'vitest';

import {
  CONVERSATION_DERIVED_STATE,
  CONVERSATION_DERIVED_STATE_KINDS,
  RETRIEVED_HISTORY_SOURCES,
  type RetrievedHistory,
} from '../conversation';

describe('conversation derived state', () => {
  it('declares a regeneration method and a deletion propagation for every kind', () => {
    for (const kind of CONVERSATION_DERIVED_STATE_KINDS) {
      const descriptor = CONVERSATION_DERIVED_STATE[kind];
      expect(descriptor.kind).toBe(kind);
      expect(descriptor.regeneratedBy).toBeTruthy();
      expect(descriptor.deletionPropagation).toBeTruthy();
    }
  });

  it('declares nothing it does not also enumerate', () => {
    expect(Object.keys(CONVERSATION_DERIVED_STATE).sort()).toEqual(
      [...CONVERSATION_DERIVED_STATE_KINDS].sort(),
    );
  });

  it('only exempts a kind from deletion propagation when it is never stored', () => {
    for (const kind of CONVERSATION_DERIVED_STATE_KINDS) {
      const descriptor = CONVERSATION_DERIVED_STATE[kind];
      if (descriptor.deletionPropagation === 'not_stored') {
        expect(descriptor.regeneratedBy).toBe('per_request');
      }
    }
  });
});

describe('retrieved history contract', () => {
  it('cites a passage with the source it came from', () => {
    const history: RetrievedHistory = {
      query: 'quarterly plan',
      passages: [
        {
          source: 'conversation',
          sourceId: 'conv-1',
          title: 'Quarterly plan',
          snippet: 'the plan for the quarter',
          score: 0.82,
          indexedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      truncated: false,
    };

    expect(RETRIEVED_HISTORY_SOURCES).toContain(history.passages[0]?.source);
    expect(history.truncated).toBe(false);
  });
});
