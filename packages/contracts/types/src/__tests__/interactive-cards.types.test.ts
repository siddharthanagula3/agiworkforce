import { describe, expect, it } from 'vitest';
import {
  INTERACTIVE_CARD_IDENTITY_GUARD,
  KNOWN_INTERACTIVE_CARD_KINDS,
  interactiveCardRendersBeforeProse,
  isKnownInteractiveCardKind,
  isResolvedPlace,
  type InteractiveCard,
  type ItineraryRoute,
  type ItineraryToolInputStop,
  type PlaceIdentity,
} from '../interactive-cards';

/**
 * The type-level half of the wrong-city fix.
 *
 * The runtime schemas in @agiworkforce/cloud-contracts make the wrong PAYLOAD
 * impossible. This file proves the wrong CODE does not compile, that a renderer
 * cannot reach for an unvalidated body, routing cannot reach for coordinates
 * that were never resolved, and the model-facing tool input cannot carry
 * identity at all.
 *
 * The `@ts-expect-error` lines ARE the assertions: each one fails the build if
 * the access it guards ever becomes legal again. The runtime `expect` calls
 * exist so the file is also a real test rather than a silently-skipped one.
 */

describe('unrecognized cards cannot be read as if validated', () => {
  it('has no body on the unrecognized branch', () => {
    const card = {
      recognized: false as const,
      kind: 'weather.v1',
      schemaVersion: 1,
      cardId: 'toolu_1',
      createdAt: '2026-08-05T10:00:00.000Z',
      fallback: { headline: 'h', text: 't' },
      producedBy: { toolCallId: 'toolu_1', toolName: 'x' },
    } satisfies InteractiveCard;

    // @ts-expect-error `body` is ABSENT from the unrecognized branch, not
    const leaked = card.body;

    expect(leaked).toBeUndefined();
    expect(card.fallback.text).toBe('t');
  });
});

describe('unresolved places carry no identity', () => {
  const unresolved: PlaceIdentity = {
    status: 'unresolved',
    query: 'South Park',
    reason: 'ambiguous',
  };

  it('has no coordinates', () => {
    // @ts-expect-error An optional `lat?` would have been silently skipped by
    const lat = unresolved.lat;

    // @ts-expect-error Same for longitude.
    const lng = unresolved.lng;

    expect(lat).toBeUndefined();
    expect(lng).toBeUndefined();
  });

  it('has no provider place id and no address', () => {
    // @ts-expect-error The opaque provider id only exists once a resolver
    const id = unresolved.providerPlaceId;

    // @ts-expect-error A resolver-authored address likewise.
    const address = unresolved.formattedAddress;

    expect(id).toBeUndefined();
    expect(address).toBeUndefined();
  });

  it('narrows to the resolved branch through the guard', () => {
    const resolved: PlaceIdentity = {
      status: 'resolved',
      provider: 'test',
      providerPlaceId: 'places/ChIJtest',
      lat: 37.7955,
      lng: -122.3937,
      displayName: 'Ferry Building',
      formattedAddress: '1 Ferry Building, San Francisco, CA 94111',
      resolvedAt: '2026-08-05T09:00:00.000Z',
      attribution: { providerLabel: 'Test Places' },
    };
    expect(isResolvedPlace(resolved)).toBe(true);
    expect(isResolvedPlace(unresolved)).toBe(false);
    if (isResolvedPlace(resolved)) expect(resolved.lat).toBeCloseTo(37.7955);
  });
});

describe('an unavailable route has nothing to open', () => {
  const route: ItineraryRoute = {
    status: 'unavailable',
    reason: 'unresolved_stops',
    unresolvedStopCount: 2,
  };

  it('has no legs and no url', () => {
    // @ts-expect-error "Open route" is not disabled by a runtime `if` that
    const legs = route.legs;

    // @ts-expect-error And no travel mode to label it with.
    const mode = route.travelMode;

    expect(legs).toBeUndefined();
    expect(mode).toBeUndefined();
    expect(route.unresolvedStopCount).toBe(2);
  });
});

describe('the model cannot author place identity', () => {
  it('compiles the identity guard', () => {
    expect(INTERACTIVE_CARD_IDENTITY_GUARD).toBe(true);
  });

  it('offers the model intent and presentation only', () => {
    const stop: ItineraryToolInputStop = {
      startTimeLabel: '08:30',
      note: 'Coffee before the first meeting.',
      placeQuery: 'South Park',
      localityHint: 'San Francisco, CA',
    };

    // @ts-expect-error No place id.
    stop.placeId = 'places/ChIJanything';

    // @ts-expect-error No coordinates.
    stop.lat = 32.8;

    // @ts-expect-error No URL, the documented anti-pattern is letting the model
    stop.url = 'https://maps.example/anything';

    // @ts-expect-error No display name either: a model-authored name beside a
    stop.displayName = 'South Park';

    expect(stop.placeQuery).toBe('South Park');
    expect(stop.localityHint).toBe('San Francisco, CA');
  });
});

describe('kind allowlist', () => {
  it('recognizes exactly the kinds this build ships', () => {
    expect([...KNOWN_INTERACTIVE_CARD_KINDS]).toEqual([
      'clarify.v1',
      'itinerary.v1',
      'map-search.v1',
      'mcp-app.v1',
      'places.v1',
    ]);
  });

  it('leads the turn with the places map and trails with every other kind', () => {
    expect(interactiveCardRendersBeforeProse('places.v1')).toBe(true);
    for (const kind of KNOWN_INTERACTIVE_CARD_KINDS) {
      if (kind === 'places.v1') continue;
      expect(interactiveCardRendersBeforeProse(kind)).toBe(false);
    }
  });

  it('treats anything else as unknown rather than throwing', () => {
    expect(isKnownInteractiveCardKind('clarify.v1')).toBe(true);
    expect(isKnownInteractiveCardKind('weather.v1')).toBe(false);
    expect(isKnownInteractiveCardKind('')).toBe(false);
  });
});
