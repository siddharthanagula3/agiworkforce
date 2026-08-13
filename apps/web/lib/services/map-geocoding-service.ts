import 'server-only';

import {
  MAP_SEARCH_MAX_PLACES,
  MAP_SEARCH_MAX_ZOOM,
  MAP_SEARCH_MIN_ZOOM,
  type MapSearchPlace,
  type MapSearchView,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';

/**
 * Server-side geocoding for `map-search.v1`.
 *
 * This module is the ONLY place a map card's coordinates may come from. The
 * model authors a bounded free-text query and nothing else — same trust rule
 * that already governs the card's provider URLs. If this resolver returns
 * nothing, the card ships WITHOUT a viewport and the renderer degrades to the
 * link-only layout. It never falls back to a guessed centre, because a map
 * pinned to the wrong city is worse than no map at all.
 *
 * Provider: OpenStreetMap Nominatim. It needs no API key, which is what makes
 * a rendered map possible on this deployment today — no Maps Platform key is
 * configured, and the existing `GOOGLE_API_KEY` is a Generative Language key.
 * Nominatim's usage policy requires an identifying User-Agent and a single
 * request at a time; both are honoured below.
 */

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const GEOCODE_TIMEOUT_MS = 4_000;

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * Nominatim asks for a real contact point so it can reach an operator before
 * blocking them. `AGI_MAP_GEOCODER_CONTACT` overrides it per deployment.
 */
function userAgent(): string {
  const contact = process.env['AGI_MAP_GEOCODER_CONTACT']?.trim();
  return `AGIWorkforce/1.0 (${contact && contact.length <= 120 ? contact : 'https://agiworkforce.com'})`;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  /** Nominatim relevance score. Higher is a more prominent place. */
  importance?: number;
  /** e.g. "place", "boundary", "highway". */
  category?: string;
  class?: string;
  /** e.g. "city", "administrative", "residential". */
  type?: string;
  /** [south, north, west, east] as strings. */
  boundingbox?: [string, string, string, string];
}

/**
 * Categories that answer "where is X" as a PLACE. Everything else — most
 * importantly `highway` — is a street that merely shares the name.
 *
 * Observed live 2026-08-12: "Las Vegas" resolved to a road called Las Vegas in
 * Limbé, CAMEROON, and the card cheerfully pinned West Africa for a Dallas ->
 * Las Vegas route. Nominatim's own top hit for the bare term is Las Vegas,
 * Nevada at importance 0.72, so the fix is to stop taking `limit=1` on faith
 * and instead rank a small candidate set: settlements first, then importance.
 */
const PLACE_CATEGORIES = new Set(['place', 'boundary']);
const STREET_CATEGORIES = new Set(['highway']);

function candidateRank(result: NominatimResult): number {
  const category = result.category ?? result.class ?? '';
  if (STREET_CATEGORIES.has(category)) return 0;
  if (PLACE_CATEGORIES.has(category)) return 2;
  return 1;
}

/**
 * Turn a raw OSM type into something a reader recognises. "administrative" is
 * the boundary classification behind most cities and means nothing to a user,
 * so it becomes "Locality"; everything else is just sentence-cased.
 */
function humanKind(type: string): string {
  if (type === 'administrative') return 'Locality';
  const spaced = type.replace(/[_-]+/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : type;
}

/** Best of a candidate list: place-ness first, Nominatim importance second. */
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
  // Ask for a small candidate set rather than trusting position 1 — ranking
  // needs alternatives to choose between.
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '0');

  const response = await fetch(url, {
    signal,
    headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
    // Geocoding a place name is a stable lookup; let the platform cache reuse
    // it so repeated cards for the same city do not re-hit a free service.
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
    // The geocoder's own name, truncated to the contract's bound. The model's
    // phrasing is deliberately not used here.
    label: first.display_name.slice(0, 160),
    latitude,
    longitude,
    ...(first.type ? { kind: humanKind(first.type) } : {}),
  };
}

/**
 * Split "Dallas to Las Vegas" into its endpoints so a corridor request gets a
 * viewport containing BOTH, instead of a pin on whichever token the geocoder
 * happened to match. Only the plainest separators are recognised — anything
 * else stays a single-place lookup rather than being mangled into two bad ones.
 */
export function splitRouteQuery(query: string): [string, string] | null {
  const match = /^(.{2,120}?)\s+(?:to|->|→|until|thru|through)\s+(.{2,120})$/iu.exec(query.trim());
  if (!match) return null;
  const [, origin, destination] = match;
  if (!origin?.trim() || !destination?.trim()) return null;
  return [origin.trim(), destination.trim()];
}

/** Web Mercator y in [0,1] — the projection the tile grid is built on. */
function mercatorY(latitude: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const radians = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
}

/**
 * Largest zoom at which every place still falls inside a viewport of
 * `tilesAcross` × `tilesDown` tiles, with margin so pins are not flush against
 * the edge. A single place has no extent, so it gets a fixed city-level zoom.
 */
export function fitZoom(places: MapSearchPlace[], tilesAcross: number, tilesDown: number): number {
  if (places.length < 2) return 11;

  const xs = places.map((place) => (place.longitude + 180) / 360);
  const ys = places.map((place) => mercatorY(place.latitude));
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  // 0.8 keeps both pins inside the frame rather than on its border.
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

/**
 * Resolve a map query into a paintable viewport. Returns null — never a
 * fabricated location — when the query cannot be geocoded, when the network
 * call fails, or when it exceeds the timeout.
 */
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

    // Sequential on purpose: Nominatim's policy is one request at a time.
    for (const target of targets.slice(0, MAP_SEARCH_MAX_PLACES)) {
      const place = await geocodeOne(target, controller.signal);
      // A corridor with only one resolvable endpoint is not a corridor. Fall
      // back to a single-place view rather than drawing a line to nowhere.
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
    // Fail soft: the card still ships with its provider links.
    logger.warn({ error }, 'Map card geocoding failed; shipping link-only card');
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
