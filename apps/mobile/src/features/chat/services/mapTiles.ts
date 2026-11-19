import { useEffect, useState } from 'react';
import {
  MAP_CONFIG_PATH,
  parseMapTileConfig,
  type MapTileConfig,
} from '@agiworkforce/cloud-contracts';
import { apiFetch } from '@/services/api';
import { getAuthHeaders } from '@/services/authSession';

export const TILE_SIZE = 256;
export const FRAME_HEIGHT = 200;
export const SINGLE_STOP_ZOOM = 15;

const MAX_MERCATOR_LATITUDE = 85.05112878;

export type TileAccess =
  | { status: 'blocked' | 'authorizing' | 'signed-out' | 'error' }
  | { status: 'ready'; headers: Record<string, string> };

export function tileAccessCopy(status: TileAccess['status']): string {
  return status === 'authorizing'
    ? 'Loading secure map preview…'
    : status === 'blocked'
      ? 'Map preview is available in Managed Cloud.'
      : status === 'signed-out'
        ? 'Sign in to load the secure map preview.'
        : 'Map preview is unavailable. You can still open the result in Maps.';
}

export function useManagedCloudTileAccess(enabled: boolean): TileAccess {
  const [access, setAccess] = useState<TileAccess>(() =>
    enabled ? { status: 'authorizing' } : { status: 'blocked' },
  );

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setAccess({ status: 'blocked' });
      return () => {
        active = false;
      };
    }

    setAccess({ status: 'authorizing' });
    void getAuthHeaders()
      .then((headers) => {
        if (!active) return;
        const authorization = headers.Authorization;
        if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
          setAccess({ status: 'signed-out' });
          return;
        }
        setAccess({ status: 'ready', headers });
      })
      .catch(() => {
        if (active) setAccess({ status: 'error' });
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  return access;
}

export type MapTileConfigState =
  { status: 'loading' } | { status: 'ready'; config: MapTileConfig } | { status: 'unavailable' };

const pendingConfigs = new Map<string, Promise<MapTileConfig | null>>();

function normalizedBase(tileBaseUrl: string): string {
  return tileBaseUrl.replace(/\/$/, '');
}

function loadMapTileConfig(
  tileBaseUrl: string,
  headers: Record<string, string>,
): Promise<MapTileConfig | null> {
  const base = normalizedBase(tileBaseUrl);
  const cached = pendingConfigs.get(base);
  if (cached) return cached;
  const pending = Promise.resolve()
    .then(() => apiFetch(MAP_CONFIG_PATH, { method: 'GET' }, { baseUrl: base, headers }))
    .then((response) => (response.ok ? response.json() : null))
    .then((value: unknown) => {
      const config = parseMapTileConfig(value);
      if (!config) pendingConfigs.delete(base);
      return config;
    })
    .catch(() => {
      pendingConfigs.delete(base);
      return null;
    });
  pendingConfigs.set(base, pending);
  return pending;
}

export function resetMapTileConfigCache(): void {
  pendingConfigs.clear();
}

export function useMapTileConfig(tileBaseUrl: string, tileAccess: TileAccess): MapTileConfigState {
  const [state, setState] = useState<MapTileConfigState>({ status: 'loading' });
  const headers = tileAccess.status === 'ready' ? tileAccess.headers : null;

  useEffect(() => {
    if (tileAccess.status === 'authorizing') {
      setState({ status: 'loading' });
      return undefined;
    }
    if (!headers) {
      setState({ status: 'unavailable' });
      return undefined;
    }
    let active = true;
    setState({ status: 'loading' });
    void loadMapTileConfig(tileBaseUrl, headers).then((config) => {
      if (!active) return;
      setState(config ? { status: 'ready', config } : { status: 'unavailable' });
    });
    return () => {
      active = false;
    };
  }, [tileBaseUrl, tileAccess.status, headers]);

  return state;
}

export interface MapTileStyleChoice {
  urlTemplate: string;
  attribution: string;
}

export function mapTileStyle(config: MapTileConfig, dark: boolean): MapTileStyleChoice {
  return dark
    ? { urlTemplate: config.darkTileUrlTemplate, attribution: config.darkAttribution }
    : { urlTemplate: config.tileUrlTemplate, attribution: config.attribution };
}

export function tileUriFromTemplate(
  tileBaseUrl: string,
  urlTemplate: string,
): (zoom: number, x: number, y: number) => string {
  const base = normalizedBase(tileBaseUrl);
  return (zoom, x, y) =>
    `${base}${urlTemplate
      .replace('{z}', String(zoom))
      .replace('{x}', String(x))
      .replace('{y}', String(y))}`;
}

export function project(latitude: number, longitude: number, zoom: number) {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const clamped = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));
  const radians = (clamped * Math.PI) / 180;
  return {
    pixelX: ((longitude + 180) / 360) * worldSize,
    pixelY: ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * worldSize,
  };
}

export function unproject(pixelX: number, pixelY: number, zoom: number) {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const longitude = (pixelX / worldSize) * 360 - 180;
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - (2 * pixelY) / worldSize))) * 180) / Math.PI;
  return { latitude, longitude };
}

export interface MapPoint {
  key: string;
  latitude: number;
  longitude: number;
}

export interface FittedView {
  latitude: number;
  longitude: number;
  zoom: number;
}

export function fitViewToPoints(
  points: readonly MapPoint[],
  frame: { width: number; height: number; padding: number },
  zoomRange: { min: number; max: number; single: number },
): FittedView | null {
  const first = points[0];
  if (!first) return null;
  if (points.length === 1) {
    return { latitude: first.latitude, longitude: first.longitude, zoom: zoomRange.single };
  }
  const usableWidth = Math.max(1, frame.width - frame.padding * 2);
  const usableHeight = Math.max(1, frame.height - frame.padding * 2);
  for (let zoom = zoomRange.max; zoom >= zoomRange.min; zoom--) {
    const projected = points.map((point) => project(point.latitude, point.longitude, zoom));
    const xs = projected.map((point) => point.pixelX);
    const ys = projected.map((point) => point.pixelY);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (maxX - minX <= usableWidth && maxY - minY <= usableHeight) {
      return { ...unproject((minX + maxX) / 2, (minY + maxY) / 2, zoom), zoom };
    }
  }
  const projected = points.map((point) => project(point.latitude, point.longitude, zoomRange.min));
  const xs = projected.map((point) => point.pixelX);
  const ys = projected.map((point) => point.pixelY);
  return {
    ...unproject(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
      zoomRange.min,
    ),
    zoom: zoomRange.min,
  };
}

export interface MarkerAnchor {
  width: number;
  height: number;
}
