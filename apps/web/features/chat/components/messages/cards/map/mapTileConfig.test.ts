import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMapTileConfig, resetMapTileConfigCache } from './mapTileConfig';

const TILE_CONFIG = {
  tileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}',
  attribution: 'Map data from OpenStreetMap contributors',
  darkTileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}?style=dark',
  darkAttribution: 'Map data from OpenStreetMap contributors, dark tiles',
  dimLightTiles: false,
  minZoom: 2,
  maxZoom: 19,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('loadMapTileConfig', () => {
  beforeEach(() => {
    resetMapTileConfigCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares one request between callers once the config loads', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json(TILE_CONFIG)));
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([loadMapTileConfig(), loadMapTileConfig()]);
    await loadMapTileConfig();

    expect(first).toEqual(TILE_CONFIG);
    expect(second).toEqual(TILE_CONFIG);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks again after a transport failure', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(json(TILE_CONFIG));
    vi.stubGlobal('fetch', fetchMock);

    expect(await loadMapTileConfig()).toBeNull();
    expect(await loadMapTileConfig()).toEqual(TILE_CONFIG);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks again after an error status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: 'busy' }, 503))
      .mockResolvedValueOnce(json(TILE_CONFIG));
    vi.stubGlobal('fetch', fetchMock);

    expect(await loadMapTileConfig()).toBeNull();
    expect(await loadMapTileConfig()).toEqual(TILE_CONFIG);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks again after a response that is not a tile config', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ tileUrlTemplate: 7 }))
      .mockResolvedValueOnce(json(TILE_CONFIG));
    vi.stubGlobal('fetch', fetchMock);

    expect(await loadMapTileConfig()).toBeNull();
    expect(await loadMapTileConfig()).toEqual(TILE_CONFIG);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
