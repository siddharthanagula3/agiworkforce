import { describe, expect, it, vi } from 'vitest';
import {
  INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH,
  PLACES_CARD_MAX_PHOTOS_PER_PLACE,
  PLACES_SEARCH_TOOL_NAME,
  type PlacesSearchPayload,
} from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

import { buildPlacesCard, PLACES_CARD_KIND } from './places-card';

const TOOL_CALL_ID = 'call-places-1';
const NOW = () => new Date('2026-09-05T16:14:00.000Z');

function payload(overrides: Partial<PlacesSearchPayload> = {}): PlacesSearchPayload {
  return {
    query: 'best coffee',
    near: 'Union Square San Francisco',
    openNowRequested: true,
    localTime: 'Fri, Sep 05, 2026, 09:14',
    providerId: 'test_places',
    attribution: 'Powered by a places provider',
    termsUrl: 'https://example.com/terms',
    places: [
      {
        placeId: 'one',
        name: 'Blue Bottle Coffee',
        address: '66 Mint St',
        rating: 4.5,
        reviewCount: 1204,
        category: 'Coffee shop',
        priceLevel: 'moderate',
        openNow: true,
        hours: ['Monday: 7am to 6pm'],
        phone: '+1 415 555 0100',
        website: 'https://bluebottle.example.com',
        mapsUrl: 'https://maps.example.com/blue-bottle',
        latitude: 37.788,
        longitude: -122.407,
        photos: [{ reference: 'places/one/photos/a' }],
      },
    ],
    ...overrides,
  };
}

describe('buildPlacesCard', () => {
  it('carries the facts the card renders and drops the ones only the model needs', () => {
    const card = buildPlacesCard(payload(), { toolCallId: TOOL_CALL_ID, now: NOW });

    expect(card?.recognized).toBe(true);
    if (!card?.recognized || card.kind !== PLACES_CARD_KIND) throw new Error('not a places card');

    expect(card.cardId).toBe(TOOL_CALL_ID);
    expect(card.producedBy).toEqual({
      toolCallId: TOOL_CALL_ID,
      toolName: PLACES_SEARCH_TOOL_NAME,
    });
    expect(card.body.attribution).toBe('Powered by a places provider');
    expect(card.body.termsUrl).toBe('https://example.com/terms');
    expect(card.body.places[0]).toMatchObject({
      placeId: 'one',
      name: 'Blue Bottle Coffee',
      latitude: 37.788,
      longitude: -122.407,
      directionsUrl: 'https://maps.example.com/blue-bottle',
      websiteUrl: 'https://bluebottle.example.com',
    });
    expect(card.body.places[0]).not.toHaveProperty('phone');
    expect(card.body.places[0]).not.toHaveProperty('hours');
  });

  it('skips a place the provider could not put on the map', () => {
    const card = buildPlacesCard(
      payload({
        places: [
          { placeId: 'no-location', name: 'Somewhere' },
          { placeId: 'located', name: 'Here', latitude: 1, longitude: 2 },
        ],
      }),
      { toolCallId: TOOL_CALL_ID, now: NOW },
    );

    if (!card?.recognized || card.kind !== PLACES_CARD_KIND) throw new Error('not a places card');
    expect(card.body.places.map((place) => place.placeId)).toEqual(['located']);
  });

  it('gives up photos rather than places to stay inside the envelope budget', () => {
    const longReference = (index: number, photo: number) =>
      `places/${'p'.repeat(200)}${index}/photos/${'q'.repeat(200)}${photo}`;
    const card = buildPlacesCard(
      payload({
        places: Array.from({ length: 10 }, (_unused, index) => ({
          placeId: `place-${index}`,
          name: `Place number ${index}`,
          latitude: 37 + index / 100,
          longitude: -122 - index / 100,
          address: `${index} Long Example Street, San Francisco, California`,
          photos: Array.from({ length: PLACES_CARD_MAX_PHOTOS_PER_PLACE }, (_ignored, photo) => ({
            reference: longReference(index, photo),
          })),
        })),
      }),
      { toolCallId: TOOL_CALL_ID, now: NOW },
    );

    if (!card?.recognized || card.kind !== PLACES_CARD_KIND) throw new Error('not a places card');
    expect(card.body.places).toHaveLength(10);
    expect(JSON.stringify(card).length).toBeLessThanOrEqual(INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH);
  });

  it('still produces a card when nothing matched, so the answer shows the empty result', () => {
    const card = buildPlacesCard(payload({ places: [] }), {
      toolCallId: TOOL_CALL_ID,
      now: NOW,
    });

    if (!card?.recognized || card.kind !== PLACES_CARD_KIND) throw new Error('not a places card');
    expect(card.body.places).toEqual([]);
    expect(card.fallback.text).toContain('No places matched');
  });
});
