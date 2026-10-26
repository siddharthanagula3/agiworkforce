import { describe, expect, it } from 'vitest';

import { cardLeadsProse } from './interactive-card-placement';

const IMAGE = { cardId: 'card-image', kind: 'image.v1' };

describe('cardLeadsProse', () => {
  it('puts a card the model made after announcing it below that text', () => {
    expect(cardLeadsProse(IMAGE, { 'card-image': 120 })).toBe(false);
  });

  it('puts a card made before any text above the prose', () => {
    expect(cardLeadsProse(IMAGE, { 'card-image': 0 })).toBe(true);
  });

  it('keeps the kind rule for a turn saved before offsets were recorded', () => {
    expect(cardLeadsProse(IMAGE, undefined)).toBe(true);
    expect(cardLeadsProse({ cardId: 'card-map', kind: 'map-search.v1' }, {})).toBe(false);
  });
});
