import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { InteractiveCardRenderContext, MapSearchCardBody } from '@agiworkforce/types';

vi.mock('leaflet', async () => await import('@/test/__mocks__/leaflet'));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));

import { mapInstances, resetLeafletMock } from '@/test/__mocks__/leaflet';
import { resetMapTileConfigCache } from './map/mapTileConfig';
import { MapSearchCard } from './MapSearchCard';

const TILE_CONFIG = {
  tileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}',
  attribution: 'Map data from OpenStreetMap contributors',
  darkTileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}?style=dark',
  darkAttribution: 'Map data from OpenStreetMap contributors, dark tiles',
  dimLightTiles: false,
  minZoom: 2,
  maxZoom: 19,
};

const openUrl = vi.fn();
const ctx: InteractiveCardRenderContext = { canRespond: false, onOpenUrl: openUrl };

const ACTIONS: MapSearchCardBody['actions'] = [
  {
    provider: 'google_maps',
    label: 'Open in Google Maps',
    url: 'https://www.google.com/maps/search/?api=1&query=Dallas',
  },
];

const ROUTE_BODY: MapSearchCardBody = {
  title: 'Dallas to Las Vegas',
  query: 'Dallas to Las Vegas',
  actions: ACTIONS,
  view: { latitude: 34.47, longitude: -105.97, zoom: 5, attribution: 'ignored by the renderer' },
  places: [
    { label: 'Dallas, Texas', latitude: 32.7762719, longitude: -96.7968559 },
    { label: 'Las Vegas, Nevada', latitude: 36.1672559, longitude: -115.148516 },
  ],
};

beforeEach(() => {
  openUrl.mockClear();
  resetLeafletMock();
  resetMapTileConfigCache();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(TILE_CONFIG), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MapSearchCard', () => {
  it('draws one shared map with a numbered pin per resolved place', async () => {
    render(<MapSearchCard ctx={ctx} body={ROUTE_BODY} />);

    expect(await screen.findByTestId('places-map-canvas')).toBeTruthy();
    expect(screen.getByTitle('Dallas, Texas')).toBeTruthy();
    expect(screen.getByTitle('Las Vegas, Nevada')).toBeTruthy();
    expect(mapInstances[0]?.fitBounds).toHaveBeenCalled();
  });

  it('takes its attribution from the tile endpoint actually being drawn', async () => {
    render(<MapSearchCard ctx={ctx} body={ROUTE_BODY} />);

    expect(await screen.findByText(TILE_CONFIG.attribution)).toBeTruthy();
    expect(screen.queryByText('ignored by the renderer')).toBeNull();
  });

  it('degrades to the link-only layout when the server resolved no viewport', () => {
    render(
      <MapSearchCard
        ctx={ctx}
        body={{ title: 'Map search: nowhere', query: 'nowhere', actions: ACTIONS }}
      />,
    );

    expect(screen.queryByTestId('places-map-canvas')).toBeNull();
    expect(screen.getByRole('button', { name: /Open in Google Maps/ })).toBeTruthy();
  });

  it('zooms through the shared canvas controls', async () => {
    render(<MapSearchCard ctx={ctx} body={ROUTE_BODY} />);
    await screen.findByTestId('places-map-canvas');

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(mapInstances[0]?.setZoom).toHaveBeenCalledWith(expect.any(Number), { animate: false });
  });

  it('opens a provider search through the host rather than navigating itself', async () => {
    render(<MapSearchCard ctx={ctx} body={ROUTE_BODY} />);
    await screen.findByTestId('places-map-canvas');

    fireEvent.click(
      screen.getAllByRole('button', { name: /Open in Google Maps/ })[0] as HTMLElement,
    );
    expect(openUrl).toHaveBeenCalledWith(ACTIONS[0]?.url);
  });
});
