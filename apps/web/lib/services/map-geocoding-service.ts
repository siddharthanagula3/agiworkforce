import 'server-only';

import {
  MAP_SEARCH_MAX_PLACES,
  MAP_SEARCH_MAX_ZOOM,
  MAP_SEARCH_MIN_ZOOM,
  type MapSearchPlace,
  type MapSearchView,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const GEOCODE_TIMEOUT_MS = 4_000;

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

function userAgent(): string {
  const contact = process.env['AGI_MAP_GEOCODER_CONTACT']?.trim();
  return `AGIWorkforce/1.0 (${contact && contact.length <= 120 ? contact : 'https://agiworkforce.com'})`;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
  category?: string;
  class?: string;
  type?: string;
  boundingbox?: [string, string, string, string];
}

const PLACE_CATEGORIES = new Set(['place', 'boundary']);
const STREET_CATEGORIES = new Set(['highway']);

function candidateRank(result: NominatimResult): number {
  const category = result.category ?? result.class ?? '';
  if (STREET_CATEGORIES.has(category)) return 0;
  if (PLACE_CATEGORIES.has(category)) return 2;
  return 1;
}

function humanKind(type: string): string {
  if (type === 'administrative') return 'Locality';
  const spaced = type.replace(/[_-]+/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : type;
}

function pickBestResult(results: NominatimResult[]): NominatimResult | undefined {
  return [...results].sort((a, b) => {
    const rank = candidateRank(b) - candidateRank(a);
    if (rank !== 0) return rank;
    return (b.importance ?? 0) - (a.importance ?? 0);
  })[0];
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isUsableResult(value: unknown): value is NominatimResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<NominatimResult>;
  return (
    typeof candidate.display_name === 'string' &&
    candidate.display_name.length > 0 &&
    finiteNumber(candidate.lat) !== null &&
    finiteNumber(candidate.lon) !== null
  );
}

async function geocodeOne(query: string, signal: AbortSignal): Promise<MapSearchPlace | null> {
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '0');

  const response = await fetch(url, {
    signal,
    headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
    next: { revalidate: 86_400 },
  });
  if (!response.ok) return null;

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) return null;
  const first = pickBestResult(payload.filter(isUsableResult));
  if (!first) return null;

  const latitude = finiteNumber(first.lat);
  const longitude = finiteNumber(first.lon);
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 85.05112878 || Math.abs(longitude) > 180) return null;

  return {
    label: first.display_name.slice(0, 160),
    latitude,
    longitude,
    ...(first.type ? { kind: humanKind(first.type) } : {}),
  };
}

export function splitRouteQuery(query: string): [string, string] | null {
  const match = /^(.{2,120}?)\s+(?:to|->|→|until|thru|through)\s+(.{2,120})$/iu.exec(query.trim());
  if (!match) return null;
  const [, origin, destination] = match;
  if (!origin?.trim() || !destination?.trim()) return null;
  return [origin.trim(), destination.trim()];
}

function mercatorY(latitude: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const radians = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
}

export function fitZoom(places: MapSearchPlace[], tilesAcross: number, tilesDown: number): number {
  if (places.length < 2) return 11;

  const xs = places.map((place) => (place.longitude + 180) / 360);
  const ys = places.map((place) => mercatorY(place.latitude));
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const usableX = tilesAcross * 0.8;
  const usableY = tilesDown * 0.8;

  let zoom = MAP_SEARCH_MIN_ZOOM;
  for (let candidate = MAP_SEARCH_MAX_ZOOM; candidate >= MAP_SEARCH_MIN_ZOOM; candidate--) {
    const tiles = 2 ** candidate;
    if (spanX * tiles <= usableX && spanY * tiles <= usableY) {
      zoom = candidate;
      break;
    }
  }
  return zoom;
}

export interface ResolvedMapView {
  view: MapSearchView;
  places: MapSearchPlace[];
}

export async function resolveMapView(
  query: string,
  grid: { tilesAcross: number; tilesDown: number },
): Promise<ResolvedMapView | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const route = splitRouteQuery(query);
    const targets = route ?? [query];
    const resolved: MapSearchPlace[] = [];

    for (const target of targets.slice(0, MAP_SEARCH_MAX_PLACES)) {
      const place = await geocodeOne(target, controller.signal);
      if (place) resolved.push(place);
    }
    if (resolved.length === 0) return null;

    const zoom = fitZoom(resolved, grid.tilesAcross, grid.tilesDown);
    const latitude = resolved.reduce((sum, place) => sum + place.latitude, 0) / resolved.length;
    const longitude = resolved.reduce((sum, place) => sum + place.longitude, 0) / resolved.length;

    return {
      view: { latitude, longitude, zoom, attribution: OSM_ATTRIBUTION },
      places: resolved,
    };
  } catch (error) {
    logger.warn({ error }, 'Map card geocoding failed; shipping link-only card');
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
