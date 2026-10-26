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
