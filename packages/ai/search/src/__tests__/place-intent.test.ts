import { describe, expect, it } from 'vitest';

import {
  detectPlaceIntent,
  hasPlaceIntent,
  PLACE_INTENT_PHRASES,
  placeIntentForcesPlacesSearch,
} from '../place-intent';

describe('detectPlaceIntent', () => {
  it('reads the reference question both leaders answer with a places tool', () => {
    expect(detectPlaceIntent('best coffee near Union Square San Francisco open now')).toBe(
      'proximity',
    );
  });

  it('reports proximity for a bare nearby question', () => {
    expect(detectPlaceIntent('anything good nearby?')).toBe('proximity');
    expect(detectPlaceIntent('pharmacies near me')).toBe('proximity');
    expect(detectPlaceIntent('bakeries near Prospect Park')).toBe('proximity');
  });

  it('reports wayfinding for directions, addresses and hours', () => {
    expect(detectPlaceIntent('directions to the Ferry Building')).toBe('wayfinding');
    expect(detectPlaceIntent('what is the address of Zuni Cafe')).toBe('wayfinding');
    expect(detectPlaceIntent('is it open on a Sunday')).toBe('wayfinding');
  });

  it('reports open_now only beside a place category or a locality', () => {
    expect(detectPlaceIntent('which pharmacies are open now')).toBe('open_now');
    expect(detectPlaceIntent('anything open now in Austin')).toBe('open_now');
    expect(detectPlaceIntent('is the market open now')).toBeNull();
  });

  it('reports locality for a category beside a capitalised place', () => {
    expect(detectPlaceIntent('best coffee in San Francisco')).toBe('locality');
    expect(detectPlaceIntent('sushi around Shibuya')).toBe('locality');
  });

  it('ignores a place word with no location signal at all', () => {
    expect(detectPlaceIntent('how do i make coffee with a moka pot')).toBeNull();
    expect(detectPlaceIntent('write a sql query joining bars and breweries')).toBeNull();
    expect(detectPlaceIntent('')).toBeNull();
  });

  it('ignores the non-geographic senses that break a naive map trigger', () => {
    expect(detectPlaceIntent('explain how a hash map resizes')).toBeNull();
    expect(detectPlaceIntent('generate a site map for the docs')).toBeNull();
  });

  it('matches whole words only', () => {
    expect(detectPlaceIntent('the barbershop pole in Austin')).toBeNull();
    expect(detectPlaceIntent('atmosphere in Denver')).toBeNull();
  });

  it('agrees with the boolean wrapper', () => {
    expect(hasPlaceIntent('coffee near me')).toBe(true);
    expect(hasPlaceIntent('summarise this document')).toBe(false);
  });
});

describe('placeIntentForcesPlacesSearch', () => {
  it('forces the tool only for the three unambiguous signals', () => {
    expect(placeIntentForcesPlacesSearch('proximity')).toBe(true);
    expect(placeIntentForcesPlacesSearch('open_now')).toBe(true);
    expect(placeIntentForcesPlacesSearch('wayfinding')).toBe(true);
    expect(placeIntentForcesPlacesSearch('locality')).toBe(false);
    expect(placeIntentForcesPlacesSearch(null)).toBe(false);
  });
});

describe('PLACE_INTENT_PHRASES', () => {
  it('publishes every phrase list with no duplicates', () => {
    for (const [signal, phrases] of Object.entries(PLACE_INTENT_PHRASES)) {
      expect(phrases.length, signal).toBeGreaterThan(0);
      expect(new Set(phrases).size, signal).toBe(phrases.length);
      for (const phrase of phrases) {
        expect(phrase, signal).toBe(phrase.toLowerCase().trim());
      }
    }
  });
});
