import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { InteractiveCardRenderContext, MapSearchCardBody } from '@agiworkforce/types';

import { MapSearchCard } from './MapSearchCard';

const ctx: InteractiveCardRenderContext = { canRespond: false, onOpenUrl: () => {} };

const ACTIONS: MapSearchCardBody['actions'] = [
  {
    provider: 'google_maps',
    label: 'Open in Google Maps',
    url: 'https://www.google.com/maps/search/?api=1&query=Dallas',
  },
];

describe('MapSearchCard', () => {
  it('paints same-origin tiles and a pin per resolved place', () => {
    render(
      <MapSearchCard
        ctx={ctx}
        body={{
          title: 'Dallas to Las Vegas',
          query: 'Dallas to Las Vegas',
          actions: ACTIONS,
          view: {
            latitude: 34.47,
            longitude: -105.97,
            zoom: 5,
            attribution: '© OpenStreetMap contributors',
          },
          places: [
            { label: 'Dallas, Texas', latitude: 32.7762719, longitude: -96.7968559 },
            { label: 'Las Vegas, Nevada', latitude: 36.1672559, longitude: -115.148516 },
          ],
        }}
      />,
    );

    const frame = screen.getByTestId('map-search-tiles');
    const tiles = frame.querySelectorAll('img');
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      // Tiles must never be fetched from the upstream host directly: the proxy
      // is what carries the required User-Agent and keeps the tile server out
      // of the page's request graph.
      expect(tile.getAttribute('src')).toMatch(/^\/api\/maps\/tile\/5\/\d+\/\d+$/);
    }
    expect(screen.getByTitle('Dallas, Texas')).toBeTruthy();
    expect(screen.getByTitle('Las Vegas, Nevada')).toBeTruthy();
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeTruthy();
  });

  it('degrades to the link-only layout when the server resolved no viewport', () => {
    render(
      <MapSearchCard
        ctx={ctx}
        body={{ title: 'Map search: nowhere', query: 'nowhere', actions: ACTIONS }}
      />,
    );

    expect(screen.queryByTestId('map-search-tiles')).toBeNull();
    // The answer still carries its provider affordance rather than going blank.
    expect(screen.getByRole('button', { name: /Open in Google Maps/ })).toBeTruthy();
  });
});

describe('MapSearchCard · interaction', () => {
  const body: MapSearchCardBody = {
    title: 'Dallas',
    query: 'Dallas',
    actions: ACTIONS,
    view: {
      latitude: 32.7762719,
      longitude: -96.7968559,
      zoom: 11,
      attribution: '© OpenStreetMap contributors',
    },
    places: [{ label: 'Dallas, Texas', latitude: 32.7762719, longitude: -96.7968559 }],
  };

  function tileZooms(): number[] {
    const sources = [...screen.getByTestId('map-search-tiles').querySelectorAll('img')].map(
      (img) => img.getAttribute('src') ?? '',
    );
    return [...new Set(sources.map((src) => Number(src.split('/')[4])))];
  }

  it('zooms the tile grid and offers a reset once the view has moved', () => {
    render(<MapSearchCard ctx={ctx} body={body} />);
    expect(tileZooms()).toEqual([11]);
    // Reset is the only control that appears conditionally — absent until the
    // user has actually left the server's viewport.
    expect(screen.queryByRole('button', { name: 'Reset map view' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(tileZooms()).toEqual([12]);

    fireEvent.click(screen.getByRole('button', { name: 'Reset map view' }));
    expect(tileZooms()).toEqual([11]);
    expect(screen.queryByRole('button', { name: 'Reset map view' })).toBeNull();
  });

  it('clamps zoom to the range the tile proxy will serve', () => {
    render(<MapSearchCard ctx={ctx} body={body} />);
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    for (let i = 0; i < 10; i++) fireEvent.click(zoomIn);

    // 17 is MAP_SEARCH_MAX_ZOOM; past it the proxy answers 400, so the control
    // must stop rather than paint a grid of broken images.
    expect(tileZooms()).toEqual([17]);
    expect(zoomIn).toBeDisabled();
  });

  it('pans with the keyboard without changing zoom', () => {
    render(<MapSearchCard ctx={ctx} body={body} />);
    const surface = screen.getByRole('application');

    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(tileZooms()).toEqual([11]);
    expect(screen.getByRole('button', { name: 'Reset map view' })).toBeInTheDocument();
  });
});
