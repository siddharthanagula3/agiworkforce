import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('@/services/authSession', () => ({ getAuthHeaders: jest.fn() }));

import {
  openItineraryRoute,
  openMapSearchAction,
  openPlaceDirections,
  openPlaceInMaps,
  placeDirectionsTarget,
  placeInMapsUrl,
} from '../mapHandoff';
import { isAllowedMapSearchProviderUrl } from '@agiworkforce/cloud-contracts';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { fitViewToPoints, project } from '../../../services/mapTiles';

describe('placeInMapsUrl', () => {
  const place = { latitude: 30.2672, longitude: -97.7431, name: 'Cafe & Bar (Downtown)' };

  it('builds an Apple Maps pin with the place name on iOS', () => {
    expect(placeInMapsUrl(place, 'ios')).toBe(
      'https://maps.apple.com/?ll=30.2672,-97.7431&q=Cafe%20%26%20Bar%20(Downtown)',
    );
  });

  it('hands a labelled geo URI to the platform maps handler elsewhere', () => {
    expect(placeInMapsUrl(place, 'android')).toBe(
      `geo:30.2672,-97.7431?q=${encodeURIComponent('30.2672,-97.7431(Cafe & Bar (Downtown))')}`,
    );
  });

  it('refuses coordinates that are not numbers', () => {
    expect(placeInMapsUrl({ latitude: Number.NaN, longitude: 1, name: 'x' }, 'ios')).toBeNull();
  });
});

describe('map URL hand-off guards', () => {
  const openBrowser = WebBrowser.openBrowserAsync as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    openBrowser.mockResolvedValue({ type: 'dismiss' });
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens only provider search URLs that match the action provider', async () => {
    const url = 'https://www.openstreetmap.org/search?query=austin';
    await expect(
      openMapSearchAction({ provider: 'google_maps', label: 'Open', url }),
    ).resolves.toBe(false);
    expect(openBrowser).not.toHaveBeenCalled();

    await expect(
      openMapSearchAction({ provider: 'openstreetmap', label: 'Open', url }),
    ).resolves.toBe(true);
    expect(openBrowser).toHaveBeenCalledWith(url, expect.any(Object));
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('opens only Google directions URLs with an origin and destination', async () => {
    await expect(
      openItineraryRoute('https://www.google.com/maps/dir/?api=1&origin=A'),
    ).resolves.toBe(false);
    expect(openBrowser).not.toHaveBeenCalled();

    const route = 'https://www.google.com/maps/dir/?api=1&origin=A&destination=B';
    await expect(openItineraryRoute(route)).resolves.toBe(true);
    expect(openBrowser).toHaveBeenCalledWith(route, expect.any(Object));
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('opens only the Google Maps place links places.v1 stores as directions', async () => {
    await expect(openPlaceDirections('https://maps.example.com/?cid=1')).resolves.toBe(false);
    await expect(openPlaceDirections('http://maps.google.com/?cid=1')).resolves.toBe(false);
    expect(openBrowser).not.toHaveBeenCalled();

    await expect(openPlaceDirections('https://maps.google.com/?cid=1')).resolves.toBe(true);
    expect(openBrowser).toHaveBeenCalledWith('https://maps.google.com/?cid=1', expect.any(Object));
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('shows an iOS place on Apple Maps in the in-app browser by default, not another app', async () => {
    await expect(
      openPlaceInMaps({ latitude: 30.2672, longitude: -97.7431, name: 'Cafe' }),
    ).resolves.toBe(true);
    expect(openBrowser).toHaveBeenCalledWith(
      'https://maps.apple.com/?ll=30.2672,-97.7431&q=Cafe',
      expect.any(Object),
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('reports a failed hand-off', async () => {
    openBrowser.mockRejectedValue(new Error('no browser'));
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    await expect(
      openItineraryRoute('https://www.google.com/maps/dir/?api=1&origin=A&destination=B'),
    ).resolves.toBe(false);
  });
});

describe('map provider choice', () => {
  const openBrowser = WebBrowser.openBrowserAsync as jest.Mock;
  const place = { latitude: 30.2672, longitude: -97.7431, name: 'Cafe' };
  const placeLink = 'https://maps.google.com/?cid=1';

  beforeEach(() => {
    jest.clearAllMocks();
    useLocalSettingsStore.setState({ mapProvider: 'apple' });
    openBrowser.mockResolvedValue({ type: 'dismiss' });
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    useLocalSettingsStore.setState({ mapProvider: 'apple' });
  });

  it('builds a Google Maps search at the coordinates on iOS', () => {
    expect(placeInMapsUrl(place, 'ios', 'google')).toBe(
      'https://www.google.com/maps/search/?api=1&query=30.2672%2C-97.7431',
    );
    expect(isAllowedMapSearchProviderUrl(placeInMapsUrl(place, 'ios', 'google')!)).toBe(true);
  });

  it('refuses a Google Maps place outside the coordinate range', () => {
    expect(placeInMapsUrl({ ...place, latitude: 95 }, 'ios', 'google')).toBeNull();
  });

  it('leaves Android to the system chooser whatever the choice', () => {
    expect(placeInMapsUrl(place, 'android', 'google')).toBe(placeInMapsUrl(place, 'android'));
    expect(placeDirectionsTarget(placeLink, place, 'android', 'apple')).toBe(placeLink);
  });

  it('shows a place on Google Maps in the in-app browser when it is chosen', async () => {
    useLocalSettingsStore.setState({ mapProvider: 'google' });
    await expect(openPlaceInMaps(place)).resolves.toBe(true);
    expect(openBrowser).toHaveBeenCalledWith(
      'https://www.google.com/maps/search/?api=1&query=30.2672%2C-97.7431',
      expect.any(Object),
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('shows Apple Maps directions to the place in the in-app browser', async () => {
    await expect(openPlaceDirections(placeLink, place)).resolves.toBe(true);
    expect(openBrowser).toHaveBeenCalledWith(
      'https://maps.apple.com/?daddr=30.2672,-97.7431',
      expect.any(Object),
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('keeps the Google place link for directions without coordinates', () => {
    expect(placeDirectionsTarget(placeLink, undefined, 'ios', 'apple')).toBe(placeLink);
    expect(placeDirectionsTarget(placeLink, { latitude: 95, longitude: 0 }, 'ios', 'apple')).toBe(
      placeLink,
    );
  });

  it('shows the Google place link in the in-app browser when Google Maps is chosen', async () => {
    useLocalSettingsStore.setState({ mapProvider: 'google' });
    await expect(openPlaceDirections(placeLink, place)).resolves.toBe(true);
    expect(openBrowser).toHaveBeenCalledWith(placeLink, expect.any(Object));
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('still refuses a directions link outside the Google Maps place links', async () => {
    await expect(openPlaceDirections('https://maps.example.com/?cid=1', place)).resolves.toBe(
      false,
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(openBrowser).not.toHaveBeenCalled();
  });
});

describe('fitViewToPoints', () => {
  const frame = { width: 320, height: 200, padding: 28 };
  const zoomRange = { min: 2, max: 17, single: 15 };
  const points = [
    { key: 'a', latitude: 30.2672, longitude: -97.7431 },
    { key: 'b', latitude: 30.28, longitude: -97.73 },
    { key: 'c', latitude: 30.25, longitude: -97.76 },
  ];

  function spanAt(zoom: number) {
    const projected = points.map((point) => project(point.latitude, point.longitude, zoom));
    const xs = projected.map((point) => point.pixelX);
    const ys = projected.map((point) => point.pixelY);
    return { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) };
  }

  it('picks the closest zoom that still fits every point inside the padded frame', () => {
    const view = fitViewToPoints(points, frame, zoomRange)!;
    const fits = spanAt(view.zoom);
    const tooClose = spanAt(view.zoom + 1);

    expect(fits.x).toBeLessThanOrEqual(frame.width - frame.padding * 2);
    expect(fits.y).toBeLessThanOrEqual(frame.height - frame.padding * 2);
    expect(
      tooClose.x > frame.width - frame.padding * 2 || tooClose.y > frame.height - frame.padding * 2,
    ).toBe(true);
  });

  it('centres the view between the outermost points', () => {
    const view = fitViewToPoints(points, frame, zoomRange)!;
    const centre = project(view.latitude, view.longitude, view.zoom);
    const projected = points.map((point) => project(point.latitude, point.longitude, view.zoom));
    const xs = projected.map((point) => point.pixelX);
    const ys = projected.map((point) => point.pixelY);

    expect(centre.pixelX).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2, 3);
    expect(centre.pixelY).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2, 3);
  });

  it('shows a single place at the single-place zoom', () => {
    expect(fitViewToPoints([points[0]!], frame, zoomRange)).toEqual({
      latitude: 30.2672,
      longitude: -97.7431,
      zoom: 15,
    });
  });

  it('falls back to the widest zoom when the points cannot fit', () => {
    const world = [
      { key: 'w', latitude: 60, longitude: -170 },
      { key: 'e', latitude: -60, longitude: 170 },
    ];
    expect(fitViewToPoints(world, frame, zoomRange)!.zoom).toBe(2);
  });

  it('returns nothing without points', () => {
    expect(fitViewToPoints([], frame, zoomRange)).toBeNull();
  });
});
