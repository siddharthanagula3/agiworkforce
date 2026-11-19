import { Linking, Platform } from 'react-native';
import {
  isAllowedItineraryRouteUrl,
  isAllowedMapSearchProviderUrl,
  isAllowedPlaceDirectionsUrl,
} from '@agiworkforce/cloud-contracts';
import type { MapSearchAction } from '@agiworkforce/types';
import { isInAppBrowsableUrl, openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useLocalSettingsStore, type MapProvider } from '@/stores/settings/localSettingsStore';
import { systemIntentTarget } from '../../utils/externalUrls';

interface Coordinates {
  latitude: number;
  longitude: number;
}

function selectedMapProvider(): MapProvider {
  return useLocalSettingsStore.getState().mapProvider;
}

function isValidCoordinates(point: Coordinates): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

function googleMapsSearchUrl(query: string): string {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  return url.toString();
}

function appleMapsDirectionsUrl(destination: Coordinates): string {
  return `https://maps.apple.com/?daddr=${destination.latitude},${destination.longitude}`;
}

async function handOff(url: string): Promise<boolean> {
  if (isInAppBrowsableUrl(url)) return openUntrustedUrlInAppBrowser(url);
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export function openMapSearchAction(action: MapSearchAction): Promise<boolean> {
  if (!isAllowedMapSearchProviderUrl(action.url, action.provider)) return Promise.resolve(false);
  return handOff(action.url);
}

export function openItineraryRoute(url: string): Promise<boolean> {
  if (!isAllowedItineraryRouteUrl(url)) return Promise.resolve(false);
  return handOff(url);
}

export function placeDirectionsTarget(
  url: string,
  destination: Coordinates | undefined,
  platform: string = Platform.OS,
  provider: MapProvider = selectedMapProvider(),
): string | null {
  if (!isAllowedPlaceDirectionsUrl(url)) return null;
  if (platform !== 'ios' || provider !== 'apple' || !destination) return url;
  return isValidCoordinates(destination) ? appleMapsDirectionsUrl(destination) : url;
}

export function openPlaceDirections(url: string, destination?: Coordinates): Promise<boolean> {
  const target = placeDirectionsTarget(url, destination);
  return target ? handOff(target) : Promise.resolve(false);
}

export function placeInMapsUrl(
  place: Coordinates & { name: string },
  platform: string = Platform.OS,
  provider: MapProvider = selectedMapProvider(),
): string | null {
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return null;
  const coordinates = `${place.latitude},${place.longitude}`;
  if (platform === 'ios' && provider === 'google') {
    return isValidCoordinates(place) ? googleMapsSearchUrl(coordinates) : null;
  }
  const geo = `geo:${coordinates}?q=${encodeURIComponent(`${coordinates}(${place.name})`)}`;
  return systemIntentTarget(geo, platform);
}

export function openPlaceInMaps(place: Coordinates & { name: string }): Promise<boolean> {
  const url = placeInMapsUrl(place);
  return url ? handOff(url) : Promise.resolve(false);
}
