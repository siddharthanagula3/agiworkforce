import { describe, expect, it, vi } from 'vitest';
import { INTERACTIVE_CARDS_MAX_PER_MESSAGE } from '@agiworkforce/types';
import { readPersistedInteractiveCards } from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn() }));

import { normalizeMessageMetadata } from './neon-chat';

function card(cardId: string) {
  return {
    schemaVersion: 1,
    cardId,
    kind: 'map-search.v1',
    createdAt: '2026-08-11T00:00:00.000Z',
    fallback: { headline: 'Map search', text: 'Map search: coffee near Austin' },
    producedBy: { toolCallId: cardId, toolName: 'search_maps' },
    body: {
      title: 'Coffee near Austin',
      query: 'coffee near Austin',
      actions: [
        {
          provider: 'openstreetmap',
          label: 'Open in OpenStreetMap',
          url: 'https://www.openstreetmap.org/search?query=coffee%20near%20Austin',
        },
      ],
    },
  };
}

function placesCard(cardId: string) {
  return {
    schemaVersion: 1,
    cardId,
    kind: 'places.v1',
    createdAt: '2026-09-05T16:14:00.000Z',
    fallback: { headline: 'Places for best coffee', text: '1. Blue Bottle Coffee' },
    producedBy: { toolCallId: cardId, toolName: 'search_places' },
    body: {
      query: 'best coffee',
      near: 'Union Square San Francisco',
      openNowRequested: true,
      localTime: 'Fri, Sep 05, 2026, 09:14',
      attribution: 'Powered by a places provider',
      termsUrl: 'https://example.com/terms',
      places: [
        {
          placeId: 'one',
          name: 'Blue Bottle Coffee',
          latitude: 37.788,
          longitude: -122.407,
          address: '66 Mint St',
          rating: 4.5,
          reviewCount: 1204,
          category: 'Coffee shop',
          priceLevel: 'moderate',
          openNow: true,
          directionsUrl: 'https://maps.example.com/blue-bottle',
          websiteUrl: 'https://bluebottle.example.com',
          photos: [{ reference: 'places/one/photos/a' }],
        },
      ],
    },
  };
}

describe('normalizeMessageMetadata interactive cards', () => {
  it('rejects too many cards before evaluating the total metadata size', () => {
    const metadata = {
      interactiveCards: Array.from({ length: INTERACTIVE_CARDS_MAX_PER_MESSAGE + 1 }, (_, index) =>
        card(`tool-fixture-${index}`),
      ),
      oversizedLaterField: 'x'.repeat(40_000),
    };

    expect(() => normalizeMessageMetadata(metadata)).toThrow(/too many interactive cards/i);
  });

  it('stores a places card whole, so the map re-renders on reload', () => {
    const stored = placesCard('tool-fixture-places');

    const normalized = normalizeMessageMetadata({ interactiveCards: [stored] }) as {
      interactiveCards: unknown[];
    };
    const rehydrated = readPersistedInteractiveCards(normalized);

    expect(rehydrated).toHaveLength(1);
    const restored = rehydrated[0];
    expect(restored?.recognized).toBe(true);
    if (!restored?.recognized || restored.kind !== 'places.v1') {
      throw new Error('the persisted places card did not survive the round trip');
    }
    expect(restored.body).toEqual(stored.body);
  });

  it('keeps only cards that pass the canonical persisted-card parser', () => {
    const valid = card('tool-fixture-valid');
    const normalized = normalizeMessageMetadata({
      label: 'fixture',
      interactiveCards: [{ arbitrary: true }, valid],
    });

    expect(normalized).toEqual({
      label: 'fixture',
      interactiveCards: [expect.objectContaining(valid)],
    });
  });
});
