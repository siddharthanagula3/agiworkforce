import { describe, expect, it } from 'vitest';
import {
  INTERACTIVE_CARDS_METADATA_KEY,
  INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH,
  resolveInteractiveCardRenderer,
  type InteractiveCard,
  type InteractiveCardRegistry,
} from '@agiworkforce/types';
import {
  ClarifyCardBodySchema,
  ItineraryCardBodySchema,
  MapSearchCardBodySchema,
  isAllowedMapSearchProviderUrl,
  parseInteractiveCardDelta,
  readPersistedInteractiveCards,
} from '../interactive-cards';

describe('map search card contract', () => {
  const body = {
    title: 'Coffee near Austin',
    query: 'coffee shops near Austin, Texas',
    actions: [
      {
        provider: 'google_maps',
        label: 'Open in Google Maps',
        url: 'https://www.google.com/maps/search/?api=1&query=coffee',
      },
      {
        provider: 'openstreetmap',
        label: 'Open in OpenStreetMap',
        url: 'https://www.openstreetmap.org/search?query=coffee',
      },
    ],
  };

  it('accepts bounded HTTPS provider-search actions', () => {
    expect(MapSearchCardBodySchema.safeParse(body).success).toBe(true);
  });

  it('rejects duplicate providers and unsafe URLs', () => {
    expect(
      MapSearchCardBodySchema.safeParse({
        ...body,
        actions: [body.actions[0], body.actions[0]],
      }).success,
    ).toBe(false);
    expect(
      MapSearchCardBodySchema.safeParse({
        ...body,
        actions: [{ ...body.actions[0], url: 'javascript:alert(1)' }],
      }).success,
    ).toBe(false);
    expect(
      MapSearchCardBodySchema.safeParse({
        ...body,
        actions: [{ ...body.actions[0], url: 'https://evil.example/maps/search/?api=1' }],
      }).success,
    ).toBe(false);
  });

  it('allows only the exact provider origin, path, and required search query', () => {
    expect(
      isAllowedMapSearchProviderUrl(
        'https://www.google.com/maps/search/?api=1&query=coffee',
        'google_maps',
      ),
    ).toBe(true);
    expect(
      isAllowedMapSearchProviderUrl(
        'https://www.openstreetmap.org/search?query=coffee',
        'openstreetmap',
      ),
    ).toBe(true);
    expect(
      isAllowedMapSearchProviderUrl('https://www.google.com:444/maps/search/?api=1&query=coffee'),
    ).toBe(false);
    expect(isAllowedMapSearchProviderUrl('https://www.google.com/maps/@30,-97,12z')).toBe(false);
    expect(isAllowedMapSearchProviderUrl('https://www.openstreetmap.org/search')).toBe(false);
  });
});

const envelope = {
  schemaVersion: 1,
  cardId: 'toolu_01abc',
  kind: 'clarify.v1',
  createdAt: '2026-08-05T10:00:00.000Z',
  fallback: {
    headline: 'A few questions about your trip',
    text: 'What kind of day are you in the mood for? Who is coming along? How will you get around?',
  },
  producedBy: { toolCallId: 'toolu_01abc', toolName: 'ask_clarifying_questions' },
  body: {
    questions: [
      {
        id: 'q1',
        header: 'Mood',
        question: 'What kind of day are you in the mood for?',
        options: [
          { id: 'o1', label: 'Relaxed', description: 'Slow pace, few stops' },
          { id: 'o2', label: 'Packed', description: 'See as much as possible' },
        ],
        multiSelect: false,
        isOther: true,
        isSecret: false,
      },
    ],
    state: { status: 'pending' },
  },
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('parseInteractiveCardDelta', () => {
  it('recognizes a well-formed card', () => {
    const card = parseInteractiveCardDelta({ card: envelope });
    expect(card?.recognized).toBe(true);
    expect(card?.kind).toBe('clarify.v1');
    expect(card?.cardId).toBe('toolu_01abc');
  });

  it('keeps cardId equal to the originating tool call id', () => {
    const card = parseInteractiveCardDelta({ card: envelope });
    expect(card?.cardId).toBe(card?.producedBy.toolCallId);
  });

  it('degrades an UNKNOWN kind to fallback instead of dropping it', () => {
    const payload = clone(envelope);
    payload.kind = 'weather.v1';
    const card = parseInteractiveCardDelta({ card: payload });
    expect(card).not.toBeNull();
    expect(card?.recognized).toBe(false);
    expect(card?.fallback.text).toContain('What kind of day');
  });

  it('degrades a HIGHER schemaVersion to fallback instead of dropping it', () => {
    const payload = clone(envelope);
    payload.schemaVersion = 2;
    const card = parseInteractiveCardDelta({ card: payload });
    expect(card).not.toBeNull();
    expect(card?.recognized).toBe(false);
    expect(card?.fallback.headline).toBe('A few questions about your trip');
  });

  it('degrades a MALFORMED body to fallback, keeping the answer intact', () => {
    const payload = clone(envelope) as Record<string, unknown>;
    payload['body'] = { questions: 'not an array' };
    const card = parseInteractiveCardDelta({ card: payload });
    expect(card?.recognized).toBe(false);
    expect(card?.fallback.text.length).toBeGreaterThan(0);
  });

  it('returns null only when the payload is not an envelope at all', () => {
    expect(parseInteractiveCardDelta(null)).toBeNull();
    expect(parseInteractiveCardDelta({})).toBeNull();
    expect(parseInteractiveCardDelta({ card: { kind: 'clarify.v1' } })).toBeNull();
  });

  it('rejects a card that would not survive persistence', () => {
    const payload = clone(envelope);
    payload.fallback.text = 'x'.repeat(INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH);
    expect(parseInteractiveCardDelta({ card: payload })).toBeNull();
  });

  it('never throws on fuzzed input', () => {
    const seeds: unknown[] = [
      undefined,
      null,
      0,
      '',
      [],
      { card: null },
      { card: [] },
      { card: { schemaVersion: -1 } },
      { card: { ...envelope, createdAt: 'not-a-date' } },
      { card: { ...envelope, fallback: null } },
      { card: { ...envelope, producedBy: {} } },
      { card: { ...envelope, interaction: { runId: 'not-a-uuid' } } },
    ];
    for (let i = 0; i < 100; i += 1) {
      const seed = seeds[i % seeds.length];
      expect(() => parseInteractiveCardDelta(seed)).not.toThrow();
    }
  });
});

describe('interaction', () => {
  it('accepts a suspended card in cloud_managed', () => {
    const payload = clone(envelope) as Record<string, unknown>;
    payload['interaction'] = {
      runId: '3f6c2f4e-0f1a-4c0b-9f77-2b1f4b9f0e21',
      awaitingResponse: true,
      expiresAt: '2026-08-05T11:00:00.000Z',
      executionMode: 'cloud_managed',
    };
    const card = parseInteractiveCardDelta({ card: payload });
    expect(card?.interaction?.awaitingResponse).toBe(true);
  });

  it('refuses an interaction claiming a non-cloud trust boundary', () => {
    for (const mode of ['local_only', 'byok']) {
      const payload = clone(envelope) as Record<string, unknown>;
      payload['interaction'] = {
        runId: '3f6c2f4e-0f1a-4c0b-9f77-2b1f4b9f0e21',
        awaitingResponse: true,
        expiresAt: '2026-08-05T11:00:00.000Z',
        executionMode: mode,
      };
      expect(parseInteractiveCardDelta({ card: payload })).toBeNull();
    }
  });
});

describe('url safety', () => {
  const itinerary = {
    title: 'A day out',
    summary: 'Two stops.',
    summarySources: [],
    region: { label: 'San Francisco, CA', timeZone: 'America/Los_Angeles' },
    places: [
      {
        status: 'resolved',
        provider: 'test',
        providerPlaceId: 'places/ChIJtest',
        lat: 37.7955,
        lng: -122.3937,
        displayName: 'Ferry Building',
        formattedAddress: '1 Ferry Building, San Francisco, CA 94111',
        resolvedAt: '2026-08-05T09:00:00.000Z',
        attribution: { providerLabel: 'Test Places' },
      },
    ],
    stops: [
      {
        id: 's1',
        pin: 1,
        placeIndex: 0,
        startTimeLabel: '08:30',
        note: 'Coffee and a walk along the water.',
        sources: [],
      },
    ],
    route: { status: 'unavailable', reason: 'too_few_stops', unresolvedStopCount: 0 },
  };

  it('rejects a javascript: source url', () => {
    const body = clone(itinerary) as Record<string, unknown>;
    body['summarySources'] = [{ url: 'javascript:alert(1)', title: 'x' }];
    expect(ItineraryCardBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects a data: source url', () => {
    const body = clone(itinerary) as Record<string, unknown>;
    body['summarySources'] = [{ url: 'data:text/html,<script>', title: 'x' }];
    expect(ItineraryCardBodySchema.safeParse(body).success).toBe(false);
  });

  it('rejects plain http', () => {
    const body = clone(itinerary) as Record<string, unknown>;
    body['summarySources'] = [{ url: 'http://example.com', title: 'x' }];
    expect(ItineraryCardBodySchema.safeParse(body).success).toBe(false);
  });

  it('accepts https', () => {
    const body = clone(itinerary) as Record<string, unknown>;
    body['summarySources'] = [{ url: 'https://example.com', title: 'x' }];
    expect(ItineraryCardBodySchema.safeParse(body).success).toBe(true);
  });
});

describe('itinerary invariants, the wrong-city link', () => {
  const base = {
    title: 'SF founder day',
    summary: 'A transit-only circuit.',
    summarySources: [],
    region: { label: 'San Francisco, CA', timeZone: 'America/Los_Angeles' },
    places: [
      {
        status: 'resolved',
        provider: 'test',
        providerPlaceId: 'places/ChIJresolved',
        lat: 37.7955,
        lng: -122.3937,
        displayName: 'Ferry Building',
        formattedAddress: '1 Ferry Building, San Francisco, CA 94111',
        resolvedAt: '2026-08-05T09:00:00.000Z',
        attribution: { providerLabel: 'Test Places' },
      },
      { status: 'unresolved', query: 'South Park', reason: 'ambiguous' },
    ],
    stops: [
      {
        id: 's1',
        pin: 1,
        placeIndex: 0,
        startTimeLabel: '08:30',
        note: 'Start here.',
        sources: [],
      },
      { id: 's2', pin: 2, placeIndex: 1, startTimeLabel: '10:30', note: 'Then here.', sources: [] },
    ],
    route: { status: 'unavailable', reason: 'unresolved_stops', unresolvedStopCount: 1 },
  };

  it('accepts an honest payload with one unresolved stop', () => {
    expect(ItineraryCardBodySchema.safeParse(clone(base)).success).toBe(true);
  });

  it('REFUSES a route marked available while a place is unresolved', () => {
    const body = clone(base) as Record<string, unknown>;
    body['route'] = {
      status: 'available',
      travelMode: 'transit',
      legs: [{ label: 'Full day', url: 'https://maps.example/route', stopIds: ['s1', 's2'] }],
    };
    const result = ItineraryCardBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((i) => i.message).join(' ')).toContain('unresolved');
  });

  it('refuses an unresolved count that disagrees with the places array', () => {
    const body = clone(base) as Record<string, unknown>;
    (body['route'] as Record<string, unknown>)['unresolvedStopCount'] = 0;
    expect(ItineraryCardBodySchema.safeParse(body).success).toBe(false);
  });

  it('refuses a stop pointing past the end of the places array', () => {
    const body = clone(base) as Record<string, unknown>;
    (body['stops'] as Array<Record<string, unknown>>)[1]!['placeIndex'] = 9;
    expect(ItineraryCardBodySchema.safeParse(body).success).toBe(false);
  });

  it('refuses identity fields smuggled onto the unresolved branch', () => {
    const body = clone(base) as Record<string, unknown>;
    (body['places'] as Array<Record<string, unknown>>)[1] = {
      status: 'unresolved',
      query: 'South Park',
      reason: 'ambiguous',
      lat: 32.8,
      lng: -96.9,
    };
    expect(ItineraryCardBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('clarify answer invariants', () => {
  const body = {
    questions: [
      {
        id: 'q1',
        header: 'Mood',
        question: 'What kind of day?',
        options: [
          { id: 'o1', label: 'Relaxed', description: '' },
          { id: 'o2', label: 'Packed', description: '' },
        ],
        multiSelect: false,
        isOther: false,
        isSecret: false,
      },
    ],
    state: {
      status: 'answered',
      answeredAt: '2026-08-05T10:05:00.000Z',
      answers: [{ questionId: 'q1', kind: 'options', optionIds: ['o1'], labels: ['Relaxed'] }],
    },
  };

  it('accepts a coherent answer', () => {
    expect(ClarifyCardBodySchema.safeParse(clone(body)).success).toBe(true);
  });

  it('refuses an answer naming an option the user never saw', () => {
    const payload = clone(body) as Record<string, unknown>;
    const state = payload['state'] as Record<string, unknown>;
    (state['answers'] as Array<Record<string, unknown>>)[0]!['optionIds'] = ['o9'];
    expect(ClarifyCardBodySchema.safeParse(payload).success).toBe(false);
  });

  it('refuses an answer to a question that does not exist', () => {
    const payload = clone(body) as Record<string, unknown>;
    const state = payload['state'] as Record<string, unknown>;
    (state['answers'] as Array<Record<string, unknown>>)[0]!['questionId'] = 'q9';
    expect(ClarifyCardBodySchema.safeParse(payload).success).toBe(false);
  });

  it('refuses multiple selections on a single-select question', () => {
    const payload = clone(body) as Record<string, unknown>;
    const state = payload['state'] as Record<string, unknown>;
    (state['answers'] as Array<Record<string, unknown>>)[0]!['optionIds'] = ['o1', 'o2'];
    expect(ClarifyCardBodySchema.safeParse(payload).success).toBe(false);
  });

  it('refuses free text on a question with no Other escape hatch', () => {
    const payload = clone(body) as Record<string, unknown>;
    const state = payload['state'] as Record<string, unknown>;
    state['answers'] = [{ questionId: 'q1', kind: 'other', text: 'something else' }];
    expect(ClarifyCardBodySchema.safeParse(payload).success).toBe(false);
  });

  it('represents silence distinctly from "not yet asked"', () => {
    const payload = clone(body) as Record<string, unknown>;
    const state = payload['state'] as Record<string, unknown>;
    state['answers'] = [{ questionId: 'q1', kind: 'skipped' }];
    expect(ClarifyCardBodySchema.safeParse(payload).success).toBe(true);
  });
});

describe('readPersistedInteractiveCards', () => {
  it('returns an empty list for absent or malformed metadata', () => {
    expect(readPersistedInteractiveCards(undefined)).toEqual([]);
    expect(readPersistedInteractiveCards(null)).toEqual([]);
    expect(readPersistedInteractiveCards([])).toEqual([]);
    expect(readPersistedInteractiveCards({})).toEqual([]);
    expect(readPersistedInteractiveCards({ [INTERACTIVE_CARDS_METADATA_KEY]: 'x' })).toEqual([]);
  });

  it('salvages per card, so one bad card never blanks the list', () => {
    const cards = readPersistedInteractiveCards({
      [INTERACTIVE_CARDS_METADATA_KEY]: [{ nonsense: true }, envelope],
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.recognized).toBe(true);
  });

  it('caps how many cards one message can carry', () => {
    const cards = readPersistedInteractiveCards({
      [INTERACTIVE_CARDS_METADATA_KEY]: Array.from({ length: 10 }, () => envelope),
    });
    expect(cards.length).toBeLessThanOrEqual(4);
  });
});

describe('resolveInteractiveCardRenderer', () => {
  const card = parseInteractiveCardDelta({ card: envelope })!;

  it('returns null for a kind this surface has no renderer for', () => {
    const registry: InteractiveCardRegistry<string> = {};
    expect(resolveInteractiveCardRenderer(registry, card)).toBeNull();
  });

  it('returns null for an unrecognized card even when a registry is full', () => {
    const registry: InteractiveCardRegistry<string> = {
      'clarify.v1': () => 'rendered',
      'itinerary.v1': () => 'rendered',
    };
    const unknown = parseInteractiveCardDelta({
      card: { ...clone(envelope), kind: 'weather.v1' },
    }) as InteractiveCard;
    expect(resolveInteractiveCardRenderer(registry, unknown)).toBeNull();
  });

  it('returns the renderer for a known kind', () => {
    const registry: InteractiveCardRegistry<string> = { 'clarify.v1': () => 'rendered' };
    expect(resolveInteractiveCardRenderer(registry, card)).not.toBeNull();
  });
});
