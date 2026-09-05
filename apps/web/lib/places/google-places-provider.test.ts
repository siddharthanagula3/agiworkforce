import { beforeEach, describe, expect, it, vi } from 'vitest';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

import recordedTextSearch from './__fixtures__/google-text-search.json';
import { buildGoogleTextQuery, createGooglePlacesProvider } from './google-places-provider';

const RECORDED_KEY = 'recorded-test-key';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('createGooglePlacesProvider', () => {
  beforeEach(() => {
    dnsMocks.lookup.mockResolvedValue([{ address: '142.250.72.1', family: 4 }]);
  });

  it('reports unconfigured when no key is present', () => {
    const provider = createGooglePlacesProvider({ apiKey: undefined });
    const previous = process.env['GOOGLE_PLACES_API_KEY'];
    delete process.env['GOOGLE_PLACES_API_KEY'];
    try {
      expect(provider.configured()).toBe(false);
    } finally {
      if (previous !== undefined) process.env['GOOGLE_PLACES_API_KEY'] = previous;
    }
  });

  it('normalises a recorded response into the shared place shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(recordedTextSearch));
    const provider = createGooglePlacesProvider({ apiKey: RECORDED_KEY, fetchImpl });

    const outcome = await provider.search({
      query: 'best coffee',
      near: 'Union Square San Francisco',
      openNow: true,
      limit: 5,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.billableCalls).toBe(1);
    expect(outcome.attribution).toBe('Powered by Google');
    expect(outcome.places).toHaveLength(2);

    const [first, second] = outcome.places;
    expect(first).toMatchObject({
      placeId: 'ChIJ_recorded_saint_frank',
      name: 'Saint Frank Coffee',
      address: '2340 Polk St, San Francisco, CA 94109, USA',
      rating: 4.5,
      reviewCount: 1180,
      category: 'Coffee shop',
      priceLevel: 'moderate',
      openNow: true,
      phone: '(415) 926-5019',
      website: 'https://www.saintfrankcoffee.com/',
      latitude: 37.7975,
      longitude: -122.4223,
    });
    expect(first?.hours).toEqual(['Monday: 7:00 AM - 6:00 PM', 'Tuesday: 7:00 AM - 6:00 PM']);
    expect(first?.photos?.[0]).toMatchObject({
      reference: 'places/ChIJ_recorded_saint_frank/photos/recorded-photo-1',
      widthPx: 4032,
      attribution: 'A Google User',
    });
    expect(second).toMatchObject({ openNow: false, priceLevel: 'inexpensive', reviewCount: 76 });
    expect(second?.hours).toBeUndefined();
  });

  it('sends the documented request shape and never leaks the key into the body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(recordedTextSearch));
    const provider = createGooglePlacesProvider({ apiKey: RECORDED_KEY, fetchImpl });

    await provider.search({ query: 'ramen', near: 'Shibuya', openNow: true, limit: 3 });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe(RECORDED_KEY);
    expect(headers['X-Goog-FieldMask']).toContain('places.currentOpeningHours.openNow');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({ textQuery: 'ramen near Shibuya', pageSize: 3, openNow: true });
    expect(JSON.stringify(body)).not.toContain(RECORDED_KEY);
  });

  it('clamps the requested limit to the published bounds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ places: [] }));
    const provider = createGooglePlacesProvider({ apiKey: RECORDED_KEY, fetchImpl });

    await provider.search({ query: 'bars', limit: 99 });

    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.pageSize).toBe(10);
  });

  it('reports an upstream error and still counts the call as billable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('quota exceeded', { status: 429 }));
    const provider = createGooglePlacesProvider({ apiKey: RECORDED_KEY, fetchImpl });

    const outcome = await provider.search({ query: 'bars', limit: 5 });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errorCode).toBe('upstream_error');
    expect(outcome.error).toContain('429');
    expect(outcome.billableCalls).toBe(1);
  });

  it('reports a cancelled search without buying anything', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    const provider = createGooglePlacesProvider({ apiKey: RECORDED_KEY, fetchImpl });

    const outcome = await provider.search({ query: 'bars', limit: 5, signal: controller.signal });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errorCode).toBe('cancelled');
    expect(outcome.billableCalls).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('buildGoogleTextQuery', () => {
  it('appends the locality the user named', () => {
    expect(buildGoogleTextQuery({ query: 'coffee', near: 'Union Square', limit: 5 })).toBe(
      'coffee near Union Square',
    );
  });

  it('does not repeat a locality the query already carries', () => {
    expect(
      buildGoogleTextQuery({ query: 'coffee in Union Square', near: 'Union Square', limit: 5 }),
    ).toBe('coffee in Union Square');
  });

  it('passes the query through when no locality was given', () => {
    expect(buildGoogleTextQuery({ query: 'coffee', limit: 5 })).toBe('coffee');
  });
});
