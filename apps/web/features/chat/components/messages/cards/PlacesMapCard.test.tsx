import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PlacesCardBody } from '@agiworkforce/types';

const reducedMotion = vi.hoisted(() => ({ value: false }));

vi.mock('leaflet', async () => await import('@/test/__mocks__/leaflet'));
vi.mock('framer-motion', () => ({ useReducedMotion: () => reducedMotion.value }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));

import { mapInstances, resetLeafletMock, tileLayers } from '@/test/__mocks__/leaflet';
import { resetMapTileConfigCache } from './map/mapTileConfig';
import {
  PLACES_MAP_EMPTY_MESSAGE,
  PLACES_MAP_UNAVAILABLE_MESSAGE,
  PlacesMapCard,
} from './PlacesMapCard';

const TILE_CONFIG = {
  tileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}',
  attribution: 'Map data from OpenStreetMap contributors',
  darkTileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}?style=dark',
  darkAttribution: 'Map data from OpenStreetMap contributors, dark tiles',
  dimLightTiles: false,
  minZoom: 2,
  maxZoom: 19,
};

const BODY: PlacesCardBody = {
  query: 'best coffee',
  near: 'Union Square San Francisco',
  openNowRequested: true,
  localTime: 'Fri, Sep 05, 2026, 09:14',
  attribution: 'Powered by a places provider',
  termsUrl: 'https://example.com/terms',
  places: [
    {
      placeId: 'place-one',
      name: 'Blue Bottle Coffee',
      latitude: 37.788,
      longitude: -122.407,
      address: '66 Mint St, San Francisco',
      rating: 4.5,
      reviewCount: 1204,
      category: 'Coffee shop',
      priceLevel: 'moderate',
      openNow: true,
      directionsUrl: 'https://maps.example.com/blue-bottle',
      websiteUrl: 'https://bluebottle.example.com',
      photos: [{ reference: 'places/one/photos/a' }, { reference: 'places/one/photos/b' }],
    },
    {
      placeId: 'place-two',
      name: 'Sightglass Coffee',
      latitude: 37.77,
      longitude: -122.409,
      rating: 4.2,
      reviewCount: 860,
      category: 'Espresso bar',
      openNow: false,
    },
  ],
};

function stubMapConfig(response: Response | Error): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response))),
  );
}

function okConfigResponse(): Response {
  return new Response(JSON.stringify(TILE_CONFIG), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  reducedMotion.value = false;
  resetLeafletMock();
  resetMapTileConfigCache();
  stubMapConfig(okConfigResponse());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PlacesMapCard', () => {
  it('renders a rating pill marker and a list card for every place', async () => {
    render(<PlacesMapCard body={BODY} />);

    const markers = await screen.findAllByTestId('places-map-marker');
    expect(markers).toHaveLength(2);
    expect(markers[0]?.getAttribute('aria-label')).toBe('Blue Bottle Coffee, rated 4.5 out of 5');
    expect(markers[0]?.textContent).toContain('4.5');

    expect(screen.getAllByTestId('places-list-card')).toHaveLength(2);
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('Closed')).toBeTruthy();
  });

  it('pans and zooms the map and opens the anchored popup when a card is clicked', async () => {
    render(<PlacesMapCard body={BODY} />);
    await screen.findAllByTestId('places-map-marker');

    const map = mapInstances[0];
    expect(map).toBeDefined();
    map?.setView.mockClear();

    fireEvent.click(screen.getAllByTestId('places-list-card')[1] as HTMLElement);

    await screen.findByTestId('places-detail-popup');
    expect(map?.setView).toHaveBeenCalledWith([37.77, -122.409], expect.any(Number), {
      animate: true,
    });
    expect(screen.getByRole('dialog', { name: 'Sightglass Coffee' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Directions' })).toBeNull();

    fireEvent.click(screen.getAllByTestId('places-list-card')[0] as HTMLElement);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Directions' })).toHaveAttribute(
        'href',
        'https://maps.example.com/blue-bottle',
      ),
    );
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute(
      'href',
      'https://bluebottle.example.com',
    );
  });

  it('steps through places with the popup pagination', async () => {
    render(<PlacesMapCard body={BODY} />);
    await screen.findAllByTestId('places-map-marker');

    fireEvent.click(screen.getAllByTestId('places-list-card')[0] as HTMLElement);
    await screen.findByTestId('places-detail-popup');
    expect(screen.getByText('1 of 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next place' }));
    await waitFor(() => expect(screen.getByText('2 of 2')).toBeTruthy());
    expect(screen.getByRole('dialog', { name: 'Sightglass Coffee' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Previous place' }));
    await waitFor(() => expect(screen.getByText('1 of 2')).toBeTruthy());
  });

  it('closes the popup on Escape and returns focus to the card that opened it', async () => {
    render(<PlacesMapCard body={BODY} />);
    await screen.findAllByTestId('places-map-marker');

    const firstCard = screen.getAllByTestId('places-list-card')[0] as HTMLElement;
    fireEvent.click(firstCard);
    await screen.findByTestId('places-detail-popup');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('places-detail-popup')).toBeNull());
    expect(document.activeElement).toBe(firstCard);
  });

  it('shows the assistant note from the answer, labelled as such', async () => {
    render(
      <PlacesMapCard
        body={BODY}
        assistantText={'**Blue Bottle Coffee** pours the cleanest filter on the block. Go early.'}
      />,
    );
    await screen.findAllByTestId('places-map-marker');

    fireEvent.click(screen.getAllByTestId('places-list-card')[0] as HTMLElement);
    await screen.findByTestId('places-detail-popup');

    expect(screen.getByText('About, from this answer')).toBeTruthy();
    expect(
      screen.getByText('Blue Bottle Coffee pours the cleanest filter on the block.'),
    ).toBeTruthy();
  });

  it('does not animate the pan when the viewer asked for reduced motion', async () => {
    reducedMotion.value = true;
    render(<PlacesMapCard body={BODY} />);
    await screen.findAllByTestId('places-map-marker');

    mapInstances[0]?.setView.mockClear();
    fireEvent.click(screen.getAllByTestId('places-list-card')[1] as HTMLElement);

    await waitFor(() =>
      expect(mapInstances[0]?.setView).toHaveBeenCalledWith(expect.anything(), expect.any(Number), {
        animate: false,
      }),
    );
  });

  it('draws the dark basemap and credits it, so a dark transcript is not lit up', async () => {
    render(<PlacesMapCard body={BODY} />);
    const canvas = await screen.findByTestId('places-map-canvas');

    expect(tileLayers.map((layer) => layer.urlTemplate)).toContain(TILE_CONFIG.darkTileUrlTemplate);
    expect(screen.getByText(new RegExp(TILE_CONFIG.darkAttribution))).toBeTruthy();
    expect(canvas.getAttribute('data-tiles-dimmed')).toBeNull();
  });

  it('darkens the light tiles when the deployment has no dark basemap', async () => {
    resetMapTileConfigCache();
    stubMapConfig(
      new Response(JSON.stringify({ ...TILE_CONFIG, dimLightTiles: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(<PlacesMapCard body={BODY} />);
    const canvas = await screen.findByTestId('places-map-canvas');

    expect(canvas.getAttribute('data-tiles-dimmed')).toBe('true');
    expect(canvas.style.filter).toContain('invert(1)');
  });

  it('keeps the photo square on a place with no photo, so the rows line up', async () => {
    render(<PlacesMapCard body={BODY} />);
    await screen.findAllByTestId('places-map-marker');

    // Two of the three fixture places carry no photo.
    expect(screen.getAllByTestId('places-photo-placeholder')).toHaveLength(1);
    const withoutPhoto = screen.getAllByTestId('places-list-card')[1] as HTMLElement;
    expect(withoutPhoto.querySelector('[data-testid="places-photo-placeholder"]')).not.toBeNull();
  });

  it('marks the selected place with a ring and keeps its rating pill readable', async () => {
    render(<PlacesMapCard body={BODY} />);
    await screen.findAllByTestId('places-map-marker');

    fireEvent.click(screen.getAllByTestId('places-list-card')[0] as HTMLElement);

    await waitFor(() => {
      const selected = screen.getAllByTestId('places-map-marker')[0];
      expect(selected?.className).toContain('ring-[var(--chat-accent-primary)]');
    });
    const markers = screen.getAllByTestId('places-map-marker');
    expect(markers[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(markers[0]?.textContent).toContain('4.5');
    expect(markers[1]?.className).not.toContain('ring-[var(--chat-accent-primary)]');
  });

  it('says plainly that nothing matched instead of drawing an empty map', async () => {
    render(<PlacesMapCard body={{ ...BODY, places: [] }} />);

    expect(await screen.findByTestId('places-card-empty')).toHaveTextContent(
      PLACES_MAP_EMPTY_MESSAGE,
    );
    expect(screen.queryByTestId('places-map-canvas')).toBeNull();
  });

  it('keeps the places readable when the tile endpoint cannot be reached', async () => {
    resetMapTileConfigCache();
    stubMapConfig(new Error('offline'));

    render(<PlacesMapCard body={BODY} />);

    expect(await screen.findByTestId('places-map-unavailable')).toHaveTextContent(
      PLACES_MAP_UNAVAILABLE_MESSAGE,
    );
    expect(screen.getAllByTestId('places-list-card')).toHaveLength(2);
    expect(screen.queryByTestId('places-map-canvas')).toBeNull();
  });
});
