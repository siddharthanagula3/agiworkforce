import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnswerFileAccess } from '../src/features/side-panel/generatedFiles';

const TILE_CONFIG = {
  tileUrlTemplate: 'https://tiles.example/{z}/{x}/{y}.png',
  attribution: 'Map data',
  darkTileUrlTemplate: 'https://tiles.example/dark/{z}/{x}/{y}.png',
  darkAttribution: 'Map data dark',
  dimLightTiles: false,
  minZoom: 2,
  maxZoom: 19,
};

const CONFIG_URL = 'https://gateway.example/api/maps/config';

function textBlob(value: unknown): Blob {
  const body = JSON.stringify(value);
  return Object.assign(new Blob([body], { type: 'application/json' }), {
    text: () => Promise.resolve(body),
  });
}

function access(fetchFile: AnswerFileAccess['fetchFile']): AnswerFileAccess {
  return {
    resolveUrl: (uri) => (uri.startsWith('/') ? `https://gateway.example${uri}` : uri),
    fetchFile,
    openUrl: vi.fn(),
  };
}

const REQUEST = {
  label: 'Map',
  unavailableText: 'Map unavailable',
  view: { latitude: 30.27, longitude: -97.74, zoom: 10 },
  points: [{ latitude: 30.27, longitude: -97.74, label: '1' }],
};

async function settle(frame: HTMLElement): Promise<void> {
  await vi.waitFor(() => expect(frame.getAttribute('aria-busy')).toBeNull());
}

describe('map preview tile config', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as { chrome?: unknown }).chrome = {
      i18n: { getMessage: (key: string) => key, getUILanguage: () => 'en' },
      runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the gateway again after it answered with a body that is not a tile config', async () => {
    const { buildPointsMapPreview } = await import('../src/features/side-panel/mapPreview');
    const fetchFile = vi
      .fn<AnswerFileAccess['fetchFile']>()
      .mockResolvedValueOnce(textBlob({ tileUrlTemplate: 7 }))
      .mockImplementation((url) =>
        Promise.resolve(
          url === CONFIG_URL ? textBlob(TILE_CONFIG) : new Blob(['x'], { type: 'image/png' }),
        ),
      );
    const files = access(fetchFile);

    const first = buildPointsMapPreview(REQUEST, files);
    await settle(first);
    expect(first.textContent).toContain('Map unavailable');

    const second = buildPointsMapPreview(REQUEST, files);
    await settle(second);

    const configRequests = fetchFile.mock.calls.filter(([url]) => url === CONFIG_URL);
    expect(configRequests).toHaveLength(2);
    expect(second.querySelector('.sp-map-preview__tile')).not.toBeNull();
  });

  it('reuses a tile config that loaded', async () => {
    const { buildPointsMapPreview } = await import('../src/features/side-panel/mapPreview');
    const fetchFile = vi
      .fn<AnswerFileAccess['fetchFile']>()
      .mockImplementation((url) =>
        Promise.resolve(
          url === CONFIG_URL ? textBlob(TILE_CONFIG) : new Blob(['x'], { type: 'image/png' }),
        ),
      );
    const files = access(fetchFile);

    await settle(buildPointsMapPreview(REQUEST, files));
    await settle(buildPointsMapPreview(REQUEST, files));

    expect(fetchFile.mock.calls.filter(([url]) => url === CONFIG_URL)).toHaveLength(1);
  });
});
