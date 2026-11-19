import type { MapSearchAction } from '@agiworkforce/types';

export function isAllowedMapSearchProviderUrl(
  value: string,
  provider?: MapSearchAction['provider'],
): boolean {
  try {
    const url = new URL(value);
    const google =
      (!provider || provider === 'google_maps') &&
      url.origin === 'https://www.google.com' &&
      url.pathname === '/maps/search/' &&
      url.searchParams.get('api') === '1' &&
      Boolean(url.searchParams.get('query'));
    const openStreetMap =
      (!provider || provider === 'openstreetmap') &&
      url.origin === 'https://www.openstreetmap.org' &&
      url.pathname === '/search' &&
      Boolean(url.searchParams.get('query'));
    return google || openStreetMap;
  } catch {
    return false;
  }
}

const GOOGLE_MAPS_PLACE_ORIGIN = 'https://maps.google.com';
const GOOGLE_MAPS_ORIGIN = 'https://www.google.com';
const GOOGLE_MAPS_PATH_PREFIX = '/maps/';
const GOOGLE_MAPS_PLACE_ID_PARAM = 'cid';

export function isAllowedPlaceDirectionsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.origin === GOOGLE_MAPS_PLACE_ORIGIN) {
      return url.pathname === '/' && Boolean(url.searchParams.get(GOOGLE_MAPS_PLACE_ID_PARAM));
    }
    return url.origin === GOOGLE_MAPS_ORIGIN && url.pathname.startsWith(GOOGLE_MAPS_PATH_PREFIX);
  } catch {
    return false;
  }
}
