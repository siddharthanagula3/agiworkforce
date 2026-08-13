import { describe, expect, it } from 'vitest';

import { fitZoom, splitRouteQuery } from './map-geocoding-service';

const DALLAS = { label: 'Dallas', latitude: 32.7762719, longitude: -96.7968559 };
const LAS_VEGAS = { label: 'Las Vegas', latitude: 36.1672559, longitude: -115.148516 };

/** The card's visible crop, mirrored from `map-search-tool-service`. */
const GRID = { tilesAcross: 2.5, tilesDown: 300 / 256 };

describe('splitRouteQuery', () => {
  it('splits the plain corridor forms', () => {
    expect(splitRouteQuery('Dallas to Las Vegas')).toEqual(['Dallas', 'Las Vegas']);
    expect(splitRouteQuery('Austin, TX -> Houston, TX')).toEqual(['Austin, TX', 'Houston, TX']);
  });

  it('leaves an ordinary place query alone', () => {
    // "Toronto" starts with "to" but is not a separator — a greedy split here
    // is how a single-city request would become two failed lookups.
    expect(splitRouteQuery('Toronto')).toBeNull();
    expect(splitRouteQuery('coffee shops near Austin, Texas')).toBeNull();
  });
});

describe('fitZoom', () => {
  it('frames both endpoints of a long corridor', () => {
    const zoom = fitZoom([DALLAS, LAS_VEGAS], GRID.tilesAcross, GRID.tilesDown);

    // Assert the property, not a magic number: at the chosen zoom the pair must
    // fit the visible crop, and one zoom further in it must not.
    const worldSpanX = (LAS_VEGAS.longitude - DALLAS.longitude) / 360;
    expect(Math.abs(worldSpanX) * 2 ** zoom).toBeLessThanOrEqual(GRID.tilesAcross);
    expect(Math.abs(worldSpanX) * 2 ** (zoom + 1)).toBeGreaterThan(GRID.tilesAcross * 0.8);
  });

  it('uses a city-level zoom for a single place', () => {
    expect(fitZoom([DALLAS], GRID.tilesAcross, GRID.tilesDown)).toBe(11);
  });

  it('stays inside the zoom range the tile proxy will serve', () => {
    const antipodal = fitZoom(
      [
        { label: 'a', latitude: -80, longitude: -179 },
        { label: 'b', latitude: 80, longitude: 179 },
      ],
      GRID.tilesAcross,
      GRID.tilesDown,
    );
    expect(antipodal).toBeGreaterThanOrEqual(2);
    expect(antipodal).toBeLessThanOrEqual(17);
  });
});
