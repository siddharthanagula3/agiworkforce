import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  MAP_TILE_ATTRIBUTION_ENV,
  MAP_TILE_DARK_ATTRIBUTION_ENV,
  MAP_TILE_DARK_URL_TEMPLATE_ENV,
  MAP_TILE_MAX_ZOOM_ENV,
  MAP_TILE_URL_TEMPLATE_ENV,
  mapTileProvider,
  upstreamTileUrl,
} from './map-tile-provider';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('mapTileProvider', () => {
  it('falls back to the documented development tiles when nothing is configured', () => {
    const provider = mapTileProvider();

    expect(provider.urlTemplate).toContain('{z}');
    expect(provider.attribution.length).toBeGreaterThan(0);
    expect(provider.maxZoom).toBeGreaterThan(0);
  });

  it('takes the endpoint, attribution and zoom ceiling from configuration', () => {
    vi.stubEnv(MAP_TILE_URL_TEMPLATE_ENV, 'https://tiles.example.com/{z}/{x}/{y}@2x.png');
    vi.stubEnv(MAP_TILE_ATTRIBUTION_ENV, 'Tiles from an example vendor');
    vi.stubEnv(MAP_TILE_MAX_ZOOM_ENV, '18');

    const provider = mapTileProvider();

    expect(provider).toMatchObject({
      urlTemplate: 'https://tiles.example.com/{z}/{x}/{y}@2x.png',
      attribution: 'Tiles from an example vendor',
      maxZoom: 18,
    });
    expect(upstreamTileUrl(provider, 5, 7, 12)).toBe('https://tiles.example.com/5/7/12@2x.png');
  });

  it.each([
    ['a template missing a slot', 'https://tiles.example.com/tile.png'],
    ['a template that is not https', 'http://tiles.example.com/{z}/{x}/{y}.png'],
  ])('refuses %s and keeps the default', (_label, template) => {
    vi.stubEnv(MAP_TILE_URL_TEMPLATE_ENV, template);

    expect(mapTileProvider().urlTemplate).not.toBe(template);
  });

  it('serves the dark basemap from its own endpoint, so a dark transcript is not lit up', () => {
    vi.stubEnv(MAP_TILE_DARK_URL_TEMPLATE_ENV, 'https://tiles.example.com/night/{z}/{x}/{y}.png');
    vi.stubEnv(MAP_TILE_DARK_ATTRIBUTION_ENV, 'Night tiles from an example vendor');

    const provider = mapTileProvider();

    expect(provider.darkUrlTemplate).not.toBe(provider.urlTemplate);
    expect(upstreamTileUrl(provider, 5, 7, 12, 'dark')).toBe(
      'https://tiles.example.com/night/5/7/12.png',
    );
    expect(upstreamTileUrl(provider, 5, 7, 12, 'light')).not.toContain('/night/');
    expect(provider.darkAttribution).toBe('Night tiles from an example vendor');
  });

  it('refuses a zoom ceiling outside the range a tile grid can serve', () => {
    vi.stubEnv(MAP_TILE_MAX_ZOOM_ENV, '99');
    const configured = mapTileProvider().maxZoom;

    vi.unstubAllEnvs();
    expect(configured).toBe(mapTileProvider().maxZoom);
  });
});
