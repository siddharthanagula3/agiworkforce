import 'server-only';

import { logger } from '@/lib/logger';

export const MAP_TILE_URL_TEMPLATE_ENV = 'AGI_MAP_TILE_URL_TEMPLATE';
export const MAP_TILE_ATTRIBUTION_ENV = 'AGI_MAP_TILE_ATTRIBUTION';
export const MAP_TILE_MAX_ZOOM_ENV = 'AGI_MAP_TILE_MAX_ZOOM';
export const MAP_TILE_DARK_URL_TEMPLATE_ENV = 'AGI_MAP_TILE_DARK_URL_TEMPLATE';
export const MAP_TILE_DARK_ATTRIBUTION_ENV = 'AGI_MAP_TILE_DARK_ATTRIBUTION';

/**
 * The public OpenStreetMap tiles are the documented development default. A
 * deployment that serves real traffic points these at a paid tile endpoint;
 * nothing in the client knows which one it got.
 */
const DEVELOPMENT_TILE_URL_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEVELOPMENT_TILE_ATTRIBUTION = 'Map data from OpenStreetMap contributors';
const DEVELOPMENT_TILE_MAX_ZOOM = 19;

export const MAP_TILE_MIN_ZOOM = 2;
export const MAP_TILE_ZOOM_CEILING = 22;
export const MAP_TILE_ATTRIBUTION_MAX_LENGTH = 200;

const TEMPLATE_SLOTS = ['{z}', '{x}', '{y}'] as const;

export const MAP_TILE_STYLES = ['light', 'dark'] as const;
export type MapTileStyle = (typeof MAP_TILE_STYLES)[number];

export function parseMapTileStyle(raw: string | null): MapTileStyle {
  return raw === 'dark' ? 'dark' : 'light';
}

export interface MapTileProvider {
  urlTemplate: string;
  attribution: string;
  maxZoom: number;
  /**
   * A dark transcript with a bright basemap reads as a bug, and no tile vendor
   * serves both looks from one URL, so the dark style is its own endpoint.
   * Unset, it is the light endpoint and `dimLightTiles` tells the client to
   * darken what it draws instead, which is the only option a deployment
   * without a dark basemap has.
   */
  darkUrlTemplate: string;
  darkAttribution: string;
  dimLightTiles: boolean;
}

function configuredString(name: string): string | undefined {
  const raw = process.env[name];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

function isUsableTemplate(template: string): boolean {
  if (!TEMPLATE_SLOTS.every((slot) => template.includes(slot))) return false;
  try {
    return new URL(template.replace(/\{[zxy]\}/gu, '0')).protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveTemplate(env: string, fallback: string): string {
  const configured = configuredString(env);
  if (configured === undefined) return fallback;
  if (isUsableTemplate(configured)) return configured;
  logger.error(
    { env },
    '[maps] tile template must be an https url containing {z}, {x} and {y}; using the default',
  );
  return fallback;
}

function resolveMaxZoom(): number {
  const configured = configuredString(MAP_TILE_MAX_ZOOM_ENV);
  if (configured === undefined) return DEVELOPMENT_TILE_MAX_ZOOM;
  const parsed = Number.parseInt(configured, 10);
  if (!Number.isInteger(parsed) || parsed < MAP_TILE_MIN_ZOOM || parsed > MAP_TILE_ZOOM_CEILING) {
    logger.error(
      { env: MAP_TILE_MAX_ZOOM_ENV, value: configured },
      '[maps] tile max zoom out of range; using the default',
    );
    return DEVELOPMENT_TILE_MAX_ZOOM;
  }
  return parsed;
}

function resolveAttribution(env: string, fallback: string): string {
  return (configuredString(env) ?? fallback).slice(0, MAP_TILE_ATTRIBUTION_MAX_LENGTH);
}

export function mapTileProvider(): MapTileProvider {
  const lightTemplate = resolveTemplate(MAP_TILE_URL_TEMPLATE_ENV, DEVELOPMENT_TILE_URL_TEMPLATE);
  const lightAttribution = resolveAttribution(
    MAP_TILE_ATTRIBUTION_ENV,
    DEVELOPMENT_TILE_ATTRIBUTION,
  );
  const darkTemplate = resolveTemplate(MAP_TILE_DARK_URL_TEMPLATE_ENV, lightTemplate);

  return {
    urlTemplate: lightTemplate,
    attribution: lightAttribution,
    darkUrlTemplate: darkTemplate,
    darkAttribution: resolveAttribution(MAP_TILE_DARK_ATTRIBUTION_ENV, lightAttribution),
    dimLightTiles: darkTemplate === lightTemplate,
    maxZoom: resolveMaxZoom(),
  };
}

export function upstreamTileUrl(
  provider: MapTileProvider,
  zoom: number,
  tileX: number,
  tileY: number,
  style: MapTileStyle = 'light',
): string {
  return (style === 'dark' ? provider.darkUrlTemplate : provider.urlTemplate)
    .replace('{z}', String(zoom))
    .replace('{x}', String(tileX))
    .replace('{y}', String(tileY));
}
