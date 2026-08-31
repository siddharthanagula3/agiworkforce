import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveMapView } from './map-geocoding-service';

interface StubResult {
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
  category?: string;
  type?: string;
}

const CHICAGO_LAT = 41.8796;
const CHICAGO_LON = -87.6237;

const CHICAGO = {
  lat: '41.8796',
  lon: '-87.6237',
  display_name: 'Art Institute of Chicago, Chicago, Illinois, United States',
  category: 'tourism',
  type: 'museum',
  importance: 0.7,
} satisfies StubResult;

const MILLENNIUM_PARK_CHICAGO = {
  lat: '41.8826',
  lon: '-87.6226',
  display_name: 'Millennium Park, Chicago, Illinois, United States',
  category: 'leisure',
  type: 'park',
  importance: 0.55,
} satisfies StubResult;

const MILLENNIUM_PARK_NAMIBIA = {
  lat: '-17.9333',
  lon: '19.7667',
  display_name: 'Millennium Park, Rundu, Kavango East, Namibia',
  category: 'place',
  type: 'suburb',
  importance: 0.3,
} satisfies StubResult;

function stubGeocoder(byQuery: (query: string) => StubResult[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string) => {
      const url = input instanceof URL ? input : new URL(String(input));
      const query = url.searchParams.get('q') ?? '';
      return {
        ok: true,
        json: async () => byQuery(query),
      } as unknown as Response;
    }),
  );
}

const GRID = { tilesAcross: 4, tilesDown: 3 };

describe('map place resolution keeps one request in one place', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('marks a same-name match on another continent as unconfirmed', async () => {
    // The audit's case: the museum resolves in Chicago, then the park resolves
    // to Rundu, Namibia, and a walking route is offered between them.
    stubGeocoder((query) => (/art institute/i.test(query) ? [CHICAGO] : [MILLENNIUM_PARK_NAMIBIA]));

    const resolved = await resolveMapView('Art Institute of Chicago to Millennium Park', GRID);

    expect(resolved).not.toBeNull();
    const [anchor, second] = resolved!.places;
    expect(anchor?.confident).toBe(true);
    expect(second?.label).toContain('Namibia');
    expect(second?.confident).toBe(false);
  });

  it('accepts the local match when the geocoder returns one', async () => {
    stubGeocoder((query) => (/art institute/i.test(query) ? [CHICAGO] : [MILLENNIUM_PARK_CHICAGO]));

    const resolved = await resolveMapView('Art Institute of Chicago to Millennium Park', GRID);

    expect(resolved!.places.every((place) => place.confident !== false)).toBe(true);
  });

  it('biases the second lookup toward the first place', async () => {
    const seen: Array<string | null> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string) => {
        const url = input instanceof URL ? input : new URL(String(input));
        seen.push(url.searchParams.get('viewbox'));
        return {
          ok: true,
          json: async () =>
            /art institute/i.test(url.searchParams.get('q') ?? '')
              ? [CHICAGO]
              : [MILLENNIUM_PARK_CHICAGO],
        } as unknown as Response;
      }),
    );

    await resolveMapView('Art Institute of Chicago to Millennium Park', GRID);

    expect(seen[0], 'the first lookup has no context to bias toward').toBeNull();
    // The box brackets the anchor rather than containing its literal digits.
    const [left, top, right, bottom] = (seen[1] ?? '').split(',').map(Number);
    expect(left).toBeLessThan(CHICAGO_LON);
    expect(right).toBeGreaterThan(CHICAGO_LON);
    expect(bottom).toBeLessThan(CHICAGO_LAT);
    expect(top).toBeGreaterThan(CHICAGO_LAT);
  });

  it.each([
    // Springfield, Illinois is ~300km from Chicago and is deliberately NOT in
    // this list: it is plausibly the one the user meant. These are the ones
    // that are not.
    ['Springfield', { lat: '42.1015', lon: '-72.5898', name: 'Springfield, Massachusetts' }],
    ['Cambridge', { lat: '52.2053', lon: '0.1218', name: 'Cambridge, England' }],
    ['Victoria', { lat: '-37.8136', lon: '144.9631', name: 'Victoria, Australia' }],
  ])('flags a distant %s rather than routing to it', async (name, far) => {
    stubGeocoder((query) =>
      /chicago/i.test(query)
        ? [CHICAGO]
        : [
            {
              lat: far.lat,
              lon: far.lon,
              display_name: `${name}, ${far.name}`,
              category: 'place',
              type: 'city',
            },
          ],
    );

    const resolved = await resolveMapView(`Art Institute of Chicago to ${name}`, GRID);

    expect(resolved!.places[1]?.confident).toBe(false);
  });

  it('leaves a single place confident', async () => {
    stubGeocoder(() => [CHICAGO]);
    const resolved = await resolveMapView('Art Institute of Chicago', GRID);
    expect(resolved!.places).toHaveLength(1);
    expect(resolved!.places[0]?.confident).toBe(true);
  });
});
